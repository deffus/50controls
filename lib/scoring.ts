// Scoring logic per the workbook
// Not implemented / Planned / Ineffective = 0
// Partially implemented = 1
// Implemented - unverified = 2
// Partially effective = 3
// Effective = 4
// Not assessed / Not applicable = excluded from scoring

export const COMPLETION_STATES = [
  'NOT_ASSESSED',
  'NOT_IMPLEMENTED',
  'PLANNED',
  'PARTIALLY_IMPLEMENTED',
  'IMPLEMENTED_UNVERIFIED',
  'PARTIALLY_EFFECTIVE',
  'EFFECTIVE',
  'INEFFECTIVE',
  'NOT_APPLICABLE',
] as const;

export type CompletionStateType = typeof COMPLETION_STATES[number];

export const STATE_LABELS: Record<string, string> = {
  NOT_ASSESSED: 'Not assessed',
  NOT_IMPLEMENTED: 'Not implemented',
  PLANNED: 'Planned',
  PARTIALLY_IMPLEMENTED: 'Partially implemented',
  IMPLEMENTED_UNVERIFIED: 'Implemented - unverified',
  PARTIALLY_EFFECTIVE: 'Partially effective',
  EFFECTIVE: 'Effective',
  INEFFECTIVE: 'Ineffective',
  NOT_APPLICABLE: 'Not applicable',
};

export const STATE_SCORES: Record<string, number | null> = {
  NOT_ASSESSED: null,
  NOT_IMPLEMENTED: 0,
  PLANNED: 0,
  PARTIALLY_IMPLEMENTED: 1,
  IMPLEMENTED_UNVERIFIED: 2,
  PARTIALLY_EFFECTIVE: 3,
  EFFECTIVE: 4,
  INEFFECTIVE: 0,
  NOT_APPLICABLE: null,
};

export function getScore(state: string): number | null {
  return STATE_SCORES[state] ?? null;
}

export function isScored(state: string): boolean {
  return state !== 'NOT_ASSESSED' && state !== 'NOT_APPLICABLE';
}

export function isAssessed(state: string): boolean {
  return state !== 'NOT_ASSESSED';
}

// Scored maturity = sum of scores / (4 × count of scored controls)
export function calculateMaturity(assessments: { completionState: string }[]): number {
  const scored = (assessments ?? []).filter((a: any) => isScored(a?.completionState));
  if (scored.length === 0) return 0;
  const totalPoints = scored.reduce((sum: number, a: any) => sum + (getScore(a?.completionState) ?? 0), 0);
  return totalPoints / (4 * scored.length);
}

// Coverage = assessed applicable / total applicable
export function calculateCoverage(assessments: { completionState: string }[]): number {
  const applicable = (assessments ?? []).filter((a: any) => a?.completionState !== 'NOT_APPLICABLE');
  if (applicable.length === 0) return 0;
  const assessed = applicable.filter((a: any) => isAssessed(a?.completionState));
  return assessed.length / applicable.length;
}

// Verified effective = effective / applicable
export function calculateVerifiedEffective(assessments: { completionState: string }[]): number {
  const applicable = (assessments ?? []).filter((a: any) => a?.completionState !== 'NOT_APPLICABLE');
  if (applicable.length === 0) return 0;
  const effective = applicable.filter((a: any) => a?.completionState === 'EFFECTIVE');
  return effective.length / applicable.length;
}

export const DOMAINS = [
  'Governance and accountability',
  'Asset and data management',
  'Identity and access management',
  'Authentication and privileged access',
  'Device and system security',
  'Vulnerability and change management',
  'Network and cloud security',
  'Data protection and resilience',
  'Monitoring and incident response',
  'People, suppliers and assurance',
];

export const STATE_COLORS: Record<string, string> = {
  NOT_ASSESSED: '#6b7280',
  NOT_IMPLEMENTED: '#ef4444',
  PLANNED: '#f59e0b',
  PARTIALLY_IMPLEMENTED: '#f97316',
  IMPLEMENTED_UNVERIFIED: '#3b82f6',
  PARTIALLY_EFFECTIVE: '#8b5cf6',
  EFFECTIVE: '#22c55e',
  INEFFECTIVE: '#dc2626',
  NOT_APPLICABLE: '#9ca3af',
};
