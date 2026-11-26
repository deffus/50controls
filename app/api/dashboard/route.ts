export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { isScored, isAssessed, getScore, DOMAINS } from '@/lib/scoring';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all reviews with assessments
    const reviews = await prisma.review.findMany({
      orderBy: { reviewDate: 'asc' },
      include: {
        assessments: {
          include: { controlDef: { select: { domain: true, controlId: true } } },
        },
      },
    });

    // Get open/overdue actions
    const openActions = await prisma.action.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    const overdueActions = await prisma.action.count({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
      },
    });

    const latestReview = reviews?.[reviews.length - 1];
    const assessments = latestReview?.assessments ?? [];

    // KPIs
    const applicable = assessments.filter((a: any) => a?.completionState !== 'NOT_APPLICABLE');
    const assessed = applicable.filter((a: any) => isAssessed(a?.completionState));
    const scored = assessments.filter((a: any) => isScored(a?.completionState));
    const totalPoints = scored.reduce((s: number, a: any) => s + (getScore(a?.completionState) ?? 0), 0);
    const maturity = scored.length > 0 ? totalPoints / (4 * scored.length) : 0;
    const coverage = applicable.length > 0 ? assessed.length / applicable.length : 0;
    const effective = applicable.filter((a: any) => a?.completionState === 'EFFECTIVE');
    const verifiedEff = applicable.length > 0 ? effective.length / applicable.length : 0;

    const kpis = [
      { metric: 'coverage', label: 'Assessment Coverage', value: coverage, format: 'percent', delta: null, delta_label: '', spark: [], good_when: 'up' },
      { metric: 'maturity', label: 'Scored Maturity', value: maturity, format: 'percent', delta: null, delta_label: '', spark: [], good_when: 'up' },
      { metric: 'verified', label: 'Verified Effective', value: verifiedEff, format: 'percent', delta: null, delta_label: '', spark: [], good_when: 'up' },
      { metric: 'open_actions', label: 'Open Actions', value: openActions, format: 'integer', delta: null, delta_label: '', spark: [], good_when: 'down' },
      { metric: 'overdue', label: 'Overdue Actions', value: overdueActions, format: 'integer', delta: null, delta_label: '', spark: [], good_when: 'down' },
    ];

    // Domain breakdown
    const domainData = DOMAINS.map((domain: string) => {
      const domainAssessments = assessments.filter((a: any) => a?.controlDef?.domain === domain);
      const domApplicable = domainAssessments.filter((a: any) => a?.completionState !== 'NOT_APPLICABLE');
      const domAssessed = domApplicable.filter((a: any) => isAssessed(a?.completionState));
      const domScored = domainAssessments.filter((a: any) => isScored(a?.completionState));
      const domPoints = domScored.reduce((s: number, a: any) => s + (getScore(a?.completionState) ?? 0), 0);
      const domMaturity = domScored.length > 0 ? domPoints / (4 * domScored.length) : 0;
      const domEffective = domApplicable.filter((a: any) => a?.completionState === 'EFFECTIVE');
      return {
        domain: domain.length > 25 ? domain.slice(0, 22) + '...' : domain,
        domain_full: domain,
        controls: domainAssessments.length,
        assessed: domAssessed.length,
        maturity: Math.round(domMaturity * 100),
        effective: domEffective.length,
        coverage: domApplicable.length > 0 ? Math.round((domAssessed.length / domApplicable.length) * 100) : 0,
      };
    });

    // State distribution
    const stateDistribution = [
      'NOT_ASSESSED', 'NOT_IMPLEMENTED', 'PLANNED', 'PARTIALLY_IMPLEMENTED',
      'IMPLEMENTED_UNVERIFIED', 'PARTIALLY_EFFECTIVE', 'EFFECTIVE', 'INEFFECTIVE', 'NOT_APPLICABLE',
    ].map((state: string) => ({
      state: state.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase()),
      count: assessments.filter((a: any) => a?.completionState === state).length,
    })).filter((s: any) => s.count > 0);

    // Trend across reviews
    const trend = reviews.map((r: any) => {
      const rAssessments = r?.assessments ?? [];
      const rApplicable = rAssessments.filter((a: any) => a?.completionState !== 'NOT_APPLICABLE');
      const rAssessed = rApplicable.filter((a: any) => isAssessed(a?.completionState));
      const rScored = rAssessments.filter((a: any) => isScored(a?.completionState));
      const rPoints = rScored.reduce((s: number, a: any) => s + (getScore(a?.completionState) ?? 0), 0);
      const rMaturity = rScored.length > 0 ? rPoints / (4 * rScored.length) : 0;
      const rEffective = rApplicable.filter((a: any) => a?.completionState === 'EFFECTIVE');
      const dateStr = r?.reviewDate ? new Date(r.reviewDate).toISOString().slice(0, 10) : '';
      return {
        x: dateStr,
        maturity: Math.round(rMaturity * 100),
        coverage: rApplicable.length > 0 ? Math.round((rAssessed.length / rApplicable.length) * 100) : 0,
        effective: rApplicable.length > 0 ? Math.round((rEffective.length / rApplicable.length) * 100) : 0,
      };
    });

    return NextResponse.json({
      data_as_of: new Date().toISOString(),
      data: {
        kpis,
        domain_breakdown: domainData,
        state_distribution: stateDistribution,
        trend,
      },
    });
  } catch (err: any) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ data_as_of: new Date().toISOString(), data: { kpis: [], domain_breakdown: [], state_distribution: [], trend: [] } });
  }
}
