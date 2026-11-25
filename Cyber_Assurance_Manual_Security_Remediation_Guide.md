### Cyber Assurance Checklist — manual security remediation guide

**Prepared:** 25 November 2026  
**Audience:** Application owner / developer maintaining the local Docker installation  
**Baseline:** Current application source and the report `OWASP_Security_Assessment_Cyber_Assurance.md`  
**Status:** Instructions only. These changes have **not** been applied to the application, compiled as an integrated change, deployed, or security-retested. Do not treat this guide as evidence that the findings are fixed.

This guide gives the files to edit, code to insert or replace, the order of work, and the expected verification results. Paths are relative to the extracted application folder containing `Dockerfile`, `docker-compose.yml`, `app/`, `lib/` and `prisma/`. In the managed workspace that folder is `nextjs_space`; in your extracted package use whichever folder contains those files. Commands below run on **your own computer**, not the hosted preview computer.

The recommended access model here is a **single internal organisation with administrator-approved accounts**. Approved Viewers can still read shared assurance records; Assessors can edit them; only Admins manage users. This preserves the current collaboration model. If different clients/departments must be isolated from one another, do not use that model: see section 4.4 before release.

#### Finding-to-fix map

| Finding | Original severity / evidence | Manual changes | Acceptance test |
|---|---|---|---|
| Nested update privilege escalation | Critical; runtime confirmed in review and action PATCH | Sections 2 and 3: strict scalar schemas, allowlisted roles and derived scores; also cover action creation | T1–T4 |
| Anonymous dashboard disclosure | High; runtime confirmed | Section 4.1: authenticate before querying | T5 |
| Open signup, weak passwords and access to shared records | High; runtime confirmed | Sections 4.2–4.4 and 6: close registration, approve accounts, minimise directory data, throttle authentication | T6–T9 |
| Unauthenticated reminder trigger | High; source review only, not invoked | Section 5: Admin-only caller, origin check and durable daily gate | T10 |
| Client-controlled assessment scores | Medium; runtime confirmed | Section 3: reject score input, derive score and assessor identity | T3, T11 |
| CSV formula injection | Medium; runtime confirmed | Section 7: spreadsheet-safe cell serialization | T12 |
| Calendar line injection | Medium; runtime confirmed | Section 8: escape text, fold UTF-8 lines, use CRLF | T13 |
| Missing browser security headers | Low / defence in depth; observed on local response | Section 9: actual Docker build configuration and managed configuration | T14 |

Additional source observations in this guide—such as raw request data reaching action creation—are related paths to secure, **not newly runtime-confirmed exploit findings**. The original assessment did not establish compliance with every OWASP category.

### 1. Prepare safely before editing

#### 1.1 Contain exposure and confirm administrator access

1. Keep the existing `127.0.0.1:3000:3000` binding. Do not publish the database port or expose the app to untrusted users while applying these changes.
2. Sign in with a known authorised Admin and confirm that `/admin/users` opens. A Viewer is not an administrator and is not a disabled account.
3. If this is a genuinely empty local installation, establish the first authorised administrator while it remains accessible only on your computer, then close registration as described below. Do not reopen public signup to recover a lost Admin account. If no usable Admin exists, resolve that explicitly before section 4.2; the existing admin-only creation endpoint cannot bootstrap an empty database.
4. Review the current user list. Confirm that each Admin role was intentionally granted, and investigate unexpected accounts or roles. Do not silently delete accounts or reset everyone based solely on this assessment.
5. Preserve your original extracted source folder and the current `.env` securely. Never attach `.env`, database backups, cookies or passwords to a ticket or a source archive.

#### 1.2 Back up the local database

Run these commands from the extracted application directory in your Mac/Linux shell (or WSL shell on Windows):

```bash
docker compose config --quiet
docker compose up -d db
docker compose stop app
mkdir -p backups
docker compose exec -T db pg_dump -U cyberassurance -d cyberassurance -Fc -f /tmp/security-before.dump
docker compose cp db:/tmp/security-before.dump ./backups/security-before.dump
docker compose exec -T db pg_restore --list /tmp/security-before.dump
docker compose exec -T db rm /tmp/security-before.dump
```

Use a **new backup filename** if `security-before.dump` already exists; do not overwrite the only earlier backup. A successful `pg_restore --list` checks the archive structure, not a full restore. Rehearse restoration into a separate disposable database before relying on this backup for recovery. The backup contains confidential assurance data and password hashes: restrict access and encrypt stored copies.

**Never run** `docker compose down -v`, a database reset, or a data-loss override during this work. There is no need to erase existing reviews or accounts.

### 2. Stop raw request objects reaching database writes

The same defect affects multiple handlers. Fixing only one PATCH route is not sufficient. Unknown fields must be **rejected**, not merely removed, and role checks should explicitly allow Admin/Assessor rather than allowing every role except Viewer.

#### 2.1 Create `lib/assurance-validation.ts`

Create this new file with the complete content below. The length limits are proposed validation limits, not existing business requirements. Adjust them deliberately if legitimate existing records exceed them; never truncate existing records automatically.

```typescript
import { z } from 'zod';
import { COMPLETION_STATES } from '@/lib/scoring';

const id = z.string().min(1).max(200);
const nullableId = z.union([id, z.literal(''), z.null()])
  .transform(value => value === '' ? null : value);
const dateValue = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true }),
]).transform(value => new Date(value));
const nullableDate = z.union([dateValue, z.literal(''), z.null()])
  .transform(value => value === '' ? null : value);
const text = z.string().max(20000).nullable();
const shortText = z.string().max(254).nullable();
const nonEmpty = (value: object) => Object.keys(value).length > 0;

export const reviewPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  reviewDate: dateValue.optional(),
  description: text.optional(),
}).strict().refine(nonEmpty, 'No changes supplied.');

export const actionPatchSchema = z.object({
  description: z.string().trim().min(1).max(20000).optional(),
  ownerId: nullableId.optional(),
  dueDate: nullableDate.optional(),
  closedDate: nullableDate.optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']).optional(),
  notes: text.optional(),
}).strict().refine(nonEmpty, 'No changes supplied.');

export const actionCreateSchema = z.object({
  reviewId: id,
  controlDefId: nullableId.optional(),
  description: z.string().trim().min(1).max(20000),
  ownerId: nullableId.optional(),
  dueDate: nullableDate.optional(),
  notes: text.optional(),
}).strict();

export const assessmentPatchSchema = z.object({
  completionState: z.enum(COMPLETION_STATES).optional(),
  scope: text.optional(),
  controlOwner: shortText.optional(),
  assessor: shortText.optional(),
  findings: text.optional(),
  evidenceRefs: text.optional(),
  testDate: nullableDate.optional(),
  naApproval: text.optional(),
}).strict().refine(nonEmpty, 'No changes supplied.');
```

Empty date fields from the current UI become `null`. Invalid calendar dates and unknown completion states are rejected. Relation objects such as `createdBy`, `owner`, `review`, `assessedBy`, and `controlDef` are deliberately absent, as are `score`, `assessedById`, audit timestamps and primary keys.

#### 2.2 Create `lib/mutation-error.ts`

This helper provides predictable errors without sending database details to clients.

```typescript
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export function mutationError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error.code === 'P2003') {
      return NextResponse.json({ error: 'Invalid linked record' }, { status: 400 });
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Conflicting record' }, { status: 409 });
    }
  }
  console.error('Assurance mutation failed', {
    type: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({ error: 'Unable to save changes' }, { status: 500 });
}
```

#### 2.3 Replace review PATCH only

**File:** `app/api/reviews/[id]/route.ts`

Keep the existing imports, GET handler, DELETE handler and `dynamic` declaration. Add:

```typescript
import { reviewPatchSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';
```

Replace the **entire PATCH function**, not the rest of the file:

```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['ADMIN', 'ASSESSOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const parsed = reviewPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid review changes' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const review = await prisma.review.update({ where: { id }, data: parsed.data });
    return NextResponse.json(review);
  } catch (error) {
    return mutationError(error);
  }
}
```

There must be no later fallback to the original raw JSON, no object spread from `request.json()`, and no `data: requestBody` in this function.

#### 2.4 Replace action PATCH only

**File:** `app/api/actions/[id]/route.ts`

Keep DELETE and existing imports. Add:

```typescript
import { actionPatchSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';
```

Replace the complete PATCH function:

```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['ADMIN', 'ASSESSOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const parsed = actionPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action changes' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const current = await prisma.action.findUnique({
      where: { id }, select: { status: true, closedDate: true },
    });
    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const data = { ...parsed.data };
    if (data.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId }, select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ error: 'Invalid owner' }, { status: 400 });
      }
    }
    const nextStatus = data.status ?? current.status;
    data.closedDate = nextStatus === 'CLOSED'
      ? (data.closedDate ?? current.closedDate ?? new Date())
      : null;
    const action = await prisma.action.update({
      where: { id }, data,
      include: { owner: { select: { id: true, name: true } } },
    });
    return NextResponse.json(action);
  } catch (error) {
    return mutationError(error);
  }
}
```

The proposed date rule is: a closed action has a closure date, reopening clears it, and an omitted closure date on a closed action preserves the existing one or records the current time. Verify that this matches your operational process.

#### 2.5 Secure action creation as well

**File:** `app/api/actions/route.ts`

Source inspection shows `POST` also passes an untrusted object directly into a create operation. Keep GET, add the following imports, and replace POST as shown. This related create path was not dynamically exploited in the original assessment.

```typescript
import { actionCreateSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';
```

```typescript
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['ADMIN', 'ASSESSOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const parsed = actionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const review = await prisma.review.findUnique({
      where: { id: data.reviewId }, select: { id: true },
    });
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }
    if (data.ownerId && !await prisma.user.findUnique({
      where: { id: data.ownerId }, select: { id: true },
    })) {
      return NextResponse.json({ error: 'Invalid owner' }, { status: 400 });
    }
    if (data.controlDefId && !await prisma.controlDefinition.findUnique({
      where: { id: data.controlDefId }, select: { id: true },
    })) {
      return NextResponse.json({ error: 'Invalid control' }, { status: 400 });
    }
    const action = await prisma.action.create({
      data: { ...data, status: 'OPEN' },
      include: { owner: { select: { id: true, name: true } } },
    });
    return NextResponse.json(action, { status: 201 });
  } catch (error) {
    return mutationError(error);
  }
}
```

### 3. Derive scores and assessment identity on the server

#### 3.1 Replace assessment PATCH

**File:** `app/api/assessments/[id]/route.ts`

Keep the existing imports, including `getScore`, and add:

```typescript
import { assessmentPatchSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';
```

Replace the complete PATCH function:

```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['ADMIN', 'ASSESSOR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const parsed = assessmentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid assessment changes' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const assessment = await prisma.$transaction(async tx => {
      const current = await tx.controlAssessment.findUniqueOrThrow({ where: { id } });
      const state = parsed.data.completionState ?? current.completionState;
      return tx.controlAssessment.update({
        where: { id },
        data: {
          ...parsed.data,
          completionState: state,
          score: getScore(state),
          assessedById: session.user.id,
        },
        include: { controlDef: true },
      });
    }, { isolationLevel: 'Serializable' });
    return NextResponse.json(assessment);
  } catch (error) {
    return mutationError(error);
  }
}
```

The transaction keeps state and score consistent when updates overlap; a concurrency conflict can return an error and the user can retry. Do not respond with success if the transaction failed. This does not add record-level collaboration conflict resolution.

#### 3.2 Stop copy-forward propagating a tampered stored score

**File:** `app/api/reviews/route.ts`

Add:

```typescript
import { getScore } from '@/lib/scoring';
```

Inside the copy-forward `controls.map(...)` object, replace only:

```typescript
score: prev?.score ?? null,
```

with:

```typescript
score: getScore(prev?.completionState ?? 'NOT_ASSESSED'),
```

#### 3.3 Check historical data without silently rewriting it

The changes above protect new writes; they do not prove that older scores are correct. Produce a read-only comparison of each stored `score` with `getScore(completionState)` and review differences. If any exist, retain the backup and approve a separate corrective update that changes only mismatching scores, not findings, ownership or completion states. Do not infer the intended completion state from a corrupt score.

Expected scoring remains: Not implemented, Planned and Ineffective → 0; Partially implemented → 1; Implemented–unverified → 2; Partially effective → 3; Effective → 4; Not assessed and Not applicable → `null`.

### 4. Close anonymous access and control account admission

#### 4.1 Authenticate dashboard requests

**File:** `app/api/dashboard/route.ts`

Add:

```typescript
import { auth } from '@/auth';
```

At the very start of GET, **before the existing `try` and before every database query**, insert:

```typescript
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Leave the existing dashboard data calculations in place. Do not put the guard inside a catch block that returns a successful empty dashboard on authentication failure. All authorised roles retain dashboard access under this guide's shared-organisation model.

#### 4.2 Disable public signup after a known Admin is established

**File:** `app/api/signup/route.ts`

Replace the entire file:

```typescript
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Self-registration is disabled. Contact your administrator.' },
    { status: 403 },
  );
}
```

**File:** `app/signup/page.tsx`

Replace the entire file:

```typescript
import { redirect } from 'next/navigation';

export default function SignupPage() {
  redirect('/login');
}
```

**File:** `app/login/_components/login-form.tsx`

Replace the paragraph containing `No account yet?` and the `/signup` link with:

```tsx
<p className="text-center text-sm text-muted-foreground">
  Contact your administrator to request an account.
</p>
```

Remove the `Link` import if it is now unused. The old signup form component can remain unreachable; it does not restore the closed API. Admins should create approved accounts through `/admin/users`, which already uses `createUserSchema`.

Do **not** implement public `role` selection, an email-domain-only approval bypass, or a new public “first user becomes Admin” toggle. Closing signup deliberately changes the fresh-install procedure: this patched version needs an existing Admin or a separately controlled bootstrap procedure.

#### 4.3 Keep password policy consistent and minimise email disclosure

The existing `lib/user-validation.ts` already enforces at least 12 characters and at most 72 UTF-8 bytes for admin-created/reset passwords. Keep that policy and bcrypt cost 12. Do not add a second weaker password schema. Check that both admin creation and reset reject a one-character password and a password exceeding 72 bytes. Existing weak passwords are not automatically corrected: review accounts and arrange approved resets through user management. Current resets invalidate older sessions; they do not send a reset email or expire a temporary password automatically.

**File:** `app/api/users/route.ts`

Within GET, replace:

```typescript
const users = await prisma.user.findMany({ select: publicUserFields, orderBy: { createdAt: 'asc' } });
```

with:

```typescript
const select = session.user.role === 'ADMIN'
  ? publicUserFields
  : { id: true, name: true };
const users = await prisma.user.findMany({ select, orderBy: { createdAt: 'asc' } });
```

Keep the route authenticated. Do not simply make it Admin-only: the action-owner selectors use it. Admin user management still needs the full authorised profile fields.

Email addresses also appear in review/action responses. Remove those duplicates so reducing the directory response actually reduces disclosure:

1. In `app/api/reviews/route.ts`, change GET's `createdBy` selection from `{ name: true, email: true }` to `{ name: true }`.
2. In `app/api/reviews/[id]/route.ts`, change GET's `createdBy` and `actions.include.owner` selections to `{ name: true }`.
3. In `app/api/actions/route.ts`, change GET's `owner` selection to `{ id: true, name: true }`. The replacement POST and PATCH above already omit owner email.
4. In the action-owner dropdowns in `app/(authenticated)/actions/page.tsx` and `app/(authenticated)/reviews/[id]/page.tsx`, replace any `u.name || u.email` fallback with `u.name || 'Unnamed user'` (use the existing local variable name). Ensure selecting an owner still uses the user's ID.
5. Keep email selections in server-only reminder dispatch: delivery still requires recipients' addresses. Do not return those selections from a new public endpoint.

If your local copy has additional user-directory consumers or direct email rendering, search for `/api/users`, `owner.email` and `createdBy.email` and adjust the relevant display fallbacks. Retest both selectors and admin management.

#### 4.4 Decide the visibility boundary explicitly

For the recommended **shared organisation** model, all approved users retain read access to the organisation's reviews, dashboard, actions and exports. Admission control is the boundary; Viewer remains read-only, not disabled. Closing signup does not revoke accounts that already exist, so review previously registered accounts before release. Resetting a password alone is not a durable disabled-account feature.

If you require **per-client, per-review or departmental isolation**, the preceding changes are not enough. Keep deployment restricted until you have an approved membership model and apply the same server-side membership predicate to: review list/detail/create/copy-forward/update/delete; action list/create/update/delete; assessment updates via the parent review; dashboard aggregations; CSV export; ICS export, including the no-review-filter case; and owner assignment. Use membership-aware queries and return 404 or 403 consistently for inaccessible records. Never rely on hiding UI links or filtering only the list endpoint. A filter on `createdById` alone is not a collaborative membership model.

This guide does not invent an organisation/membership schema or silently change your intended visibility policy. That separate design decision is a release prerequisite **only if the shared-organisation model does not meet your needs**.

### 5. Protect and bound reminder execution

The reminder finding is **source review only**. The assessment did not send reminders. The following instructions preserve the feature but make it an Admin-only manual operation with a durable once-per-UTC-day gate. Automated scheduler access is deliberately not introduced.

#### 5.1 Add a small durable security-window table

This table is shared by the reminder gate and the authentication throttles in section 6.

**File:** `prisma/schema.prisma`

Append this model outside all existing models. Do not change the generator or existing tables:

```prisma
model SecurityWindow {
  id        String   @id
  count     Int      @default(0)
  expiresAt DateTime

  @@index([expiresAt])
}
```

It is an additive change: no existing row needs a backfill. Section 10 explains applying it to the **local Compose database**. Do not point local setup commands at a hosted/shared database.

#### 5.2 Create `lib/security-window.ts`

```typescript
import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export async function takeSecurityWindow(
  scope: string,
  subject: string,
  limit: number,
  seconds: number,
) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Security configuration missing');
  const now = Date.now();
  const width = seconds * 1000;
  const bucket = Math.floor(now / width);
  const expiresAt = new Date((bucket + 1) * width);
  const hash = createHmac('sha256', secret)
    .update(`${scope}:${subject}:${bucket}`).digest('hex');
  const row = await prisma.securityWindow.upsert({
    where: { id: hash },
    create: { id: hash, count: 1, expiresAt },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return {
    allowed: row.count <= limit,
    retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
  };
}
```

The unique key and atomic increment coordinate requests across processes. Do not replace this with an in-memory map: restarts and multiple workers would bypass it. A storage failure must fail closed, never allow an unbounded send. Expired rows are no longer used but should be removed periodically by an operator-controlled maintenance job, deleting **only** `SecurityWindow` rows with `expiresAt` older than your chosen retention period. No scheduled job is created by this guide. HMAC-keyed rows avoid storing raw email addresses in the limiter table.

#### 5.3 Add authorization and a daily gate to the reminder handler

**File:** `app/api/reminders/route.ts`

Add imports:

```typescript
import { auth } from '@/auth';
import { takeSecurityWindow } from '@/lib/security-window';
```

Change the declaration from `POST()` to `POST(request: Request)`. Insert the following block **at the beginning of its existing `try`, before `const now = new Date()` and before any queries, notification creation or email calls**:

```typescript
const session = await auth();
if (!session?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
if (session.user.role !== 'ADMIN') {
  return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
}
const configuredUrl = process.env.NEXTAUTH_URL;
if (!configuredUrl) {
  return NextResponse.json({ error: 'Reminder origin is not configured' }, { status: 503 });
}
const expectedOrigin = new URL(configuredUrl).origin;
if (request.headers.get('origin') !== expectedOrigin) {
  return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
}
const gate = await takeSecurityWindow('reminders', 'all', 1, 86400);
if (!gate.allowed) {
  return NextResponse.json(
    { error: 'Reminders have already been triggered in this UTC day' },
    { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
  );
}
```

For your local Docker app the configured origin and browser origin must both be `http://localhost:3000`. Opening the site as `127.0.0.1` instead will intentionally fail this origin check. Do not use a wildcard origin or derive the trusted origin solely from a caller-supplied Host header. Preserve the existing dynamic route declaration so runtime configuration is used. Do not manually override the managed preview's origin configuration.

The existing catch returns an error if the durable gate fails. Keep it fail-closed. Do not change the email service or notification IDs as part of this access-control fix.

**Operational trade-off:** The daily slot is consumed before side effects. A crash or partial email failure may leave that day's reminder batch incomplete and a retry blocked. This is deliberately at-most-once batch initiation, not guaranteed delivery. The gate prevents repeats within a UTC day, not a rolling 24-hour period; two runs across midnight are possible. Do not delete the gate and rerun without reconciling what was sent. If delivery guarantees and per-action retry are needed, use a durable per-recipient/per-action outbox with provider idempotency as a separately designed enhancement.

Test successful dispatch only against authorised test recipients. An Admin session and origin header are both necessary; an unauthenticated script must no longer work.

### 6. Throttle both credential-verification paths

Rate limiting was a recommendation from the assessment, not a measured brute-force test result. There are **two** verifier paths in the source: the credentials provider in `auth.ts` and `app/api/auth/login/route.ts`. Limiting only the latter does not protect the actual sign-in flow.

The proposed policy below is **10 verification attempts per normalised email per 15-minute fixed window**, counting successes and failures. These are chosen policy values, not observed attack measurements. Shared account lockout/denial-of-service is a trade-off; tune deliberately. Per-account throttling is not complete protection against distributed password spraying. Before external exposure add a trusted gateway limit on client address and a global request budget; never trust arbitrary `X-Forwarded-For` values from direct clients.

#### 6.1 Protect the credentials provider

**File:** `auth.ts`

Add:

```typescript
import { takeSecurityWindow } from '@/lib/security-window';
```

Inside `authorize`, keep the first existing type check. Immediately after it and before `prisma.user.findFirst`, insert:

```typescript
const email = credentials.email.trim().toLowerCase();
if (!email || email.length > 254 || credentials.password.length === 0 ||
    new TextEncoder().encode(credentials.password).length > 72) return null;
try {
  const gate = await takeSecurityWindow('login', email, 10, 900);
  if (!gate.allowed) return null;
} catch {
  console.error('Authentication rate-limit storage unavailable');
  return null;
}
```

Change the email lookup's `equals: credentials.email.trim()` to `equals: email`. Keep the existing case-insensitive lookup for legacy addresses. Keep all existing JWT/password-version callbacks, hashing and session-field restrictions unchanged. Do not expose the stored password or password-version hash in the public session.

The provider uses its normal generic credentials-failure response when blocked; it does not promise a raw HTTP 429 response. Test the absence of a newly authenticated session, not just a status code.

#### 6.2 Protect the auxiliary login route

**File:** `app/api/auth/login/route.ts`

Add the same helper import. Immediately after its current type/required-value check, and before querying the user, insert:

```typescript
const normalizedEmail = email.trim().toLowerCase();
if (normalizedEmail.length > 254 || new TextEncoder().encode(password).length > 72) {
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
const gate = await takeSecurityWindow('login', normalizedEmail, 10, 900);
if (!gate.allowed) {
  return NextResponse.json(
    { error: 'Too many attempts. Try again later.' },
    { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
  );
}
```

Use `equals: normalizedEmail` in the lookup. The shared scope means alternating between endpoints does not reset the account's budget. Keep errors generic. Malformed JSON must not authenticate a user. The auxiliary endpoint returns profile data on valid credentials; it is not a replacement for the application's session-establishing sign-in flow.

### 7. Neutralise CSV formulas at export time

Do not modify stored findings to make exports safe. Apply spreadsheet-safe handling to **every** cell, including control text, labels and numeric-looking user text; quotation alone is insufficient.

#### 7.1 Create `lib/csv.ts`

```typescript
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  const firstMeaningful = Array.from(text).find(character => {
    const code = character.codePointAt(0)!;
    return code > 32 && code !== 127 && !/\s/.test(character);
  });
  const startsWithControl = text.length > 0 &&
    (text.charCodeAt(0) <= 32 || text.charCodeAt(0) === 127);
  if (startsWithControl || (firstMeaningful && '=+-@'.includes(firstMeaningful))) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}
```

This prefixes a literal apostrophe for formula-triggering input, including whitespace/control prefixes, then applies CSV quote escaping. It intentionally treats negative-looking strings as text too. Ordinary zero-to-four numeric scores remain unchanged. Some applications may display the apostrophe; do not remove it as a cosmetic change without replacing the protection.

#### 7.2 Update export serialization

**File:** `app/api/export/route.ts`

Add:

```typescript
import { csvCell } from '@/lib/csv';
```

Replace the complete `const csv = ...` expression with:

```typescript
const csv = [headers, ...rows]
  .map((row: unknown[]) => row.map(csvCell).join(','))
  .join('\r\n');
```

Change its Content-Type to `text/csv; charset=utf-8` and add response header `'Cache-Control': 'private, no-store'`. Preserve the filename sanitization and authentication check.

Confirm behaviour in the spreadsheet applications you actually use. CSV neutralisation is import-dependent: saving and reopening an edited CSV can strip protections. For higher-assurance exchange, a separately implemented spreadsheet export with cells explicitly typed as text is preferable; it is not part of this patch.

### 8. Serialize calendar files safely

#### 8.1 Create `lib/ical.ts`

```typescript
export function escapeIcalText(value: unknown): string {
  return String(value ?? '')
    .split('').filter(character => {
      const code = character.charCodeAt(0);
      return code >= 32 || character === '\n' || character === '\r';
    }).join('')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function foldIcalLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let part = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      parts.push(part);
      part = ' ';
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  parts.push(part);
  return parts.join('\r\n');
}
```

Escaping must happen before folding. A literal backslash-n is text inside a property; an actual CRLF starts a new content line. Continuation lines start with one space, and the 75-octet limit is measured in UTF-8 bytes, not characters.

#### 8.2 Replace the calendar route

**File:** `app/api/ics/route.ts`

Replace the complete file:

```typescript
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { escapeIcalText, foldIcalLine } from '@/lib/ical';

const dateOnly = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
const timestamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const reviewId = new URL(request.url).searchParams.get('reviewId');
  const actions = await prisma.action.findMany({
    where: {
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      dueDate: { not: null },
      ...(reviewId ? { reviewId } : {}),
    },
    include: { review: { select: { name: true } } },
  });
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cyber Assurance//Actions//EN',
    'CALSCALE:GREGORIAN',
  ];
  const stamp = timestamp(new Date());
  for (const action of actions) {
    if (!action.dueDate) continue;
    const due = new Date(action.dueDate);
    const end = new Date(due);
    end.setUTCDate(end.getUTCDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcalText(action.id)}@cyber-assurance`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateOnly(due)}`,
      `DTEND;VALUE=DATE:${dateOnly(end)}`,
      `SUMMARY:${escapeIcalText('Action Due: ' + Array.from(action.description).slice(0, 60).join(''))}`,
      `DESCRIPTION:${escapeIcalText(`Review: ${action.review.name}\nStatus: ${action.status}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  const ics = lines.map(foldIcalLine).join('\r\n') + '\r\n';
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="actions.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
}
```

This also gives all-day events an exclusive next-day end date and a generation timestamp. The source used the same start/end date. These serialization details help avoid invalid or invisible calendar events. No new location, alarm or attendee property is introduced.

### 9. Add browser security headers in the configuration that actually runs

The Docker build copies `docker/next.config.cjs` over `next.config.js`. Editing only the managed configuration will **not** fix Docker response headers.

#### 9.1 Docker configuration

**File:** `docker/next.config.cjs`

Inside the exported configuration object, add the following `headers` method. Keep every existing build/tracing setting:

```javascript
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Content-Security-Policy',
        value: "object-src 'none'; base-uri 'self'; form-action 'self'",
      },
      {
        key: 'Content-Security-Policy-Report-Only',
        value: "default-src 'self'; script-src 'self' https://apps.abacus.ai; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://apps.abacus.ai; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
    ],
  }];
},
```

The enforced policy is intentionally a **limited baseline**; it does not restrict script execution. The broader script policy is report-only, so it will report inline-script and other compatibility violations without breaking sign-in or application hydration. It does not itself block those scripts. There is no reporting collector configured: inspect browser console/DevTools locally and do not claim a reporting service exists.

#### 9.2 Managed preview configuration, if you also maintain that copy

**File:** `next.config.js`

Replace only its existing `async headers()` method, which currently returns development cache-control headers, with a method that:

1. Defines `securityHeaders` as the same header array above.
2. Always returns `{ source: '/:path*', headers: securityHeaders }`.
3. Also returns the existing `/_next/static/:path*` `Cache-Control: no-store, must-revalidate` rule when `NODE_ENV === 'development'`.

Concrete replacement:

```javascript
async headers() {
  const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; form-action 'self'" },
    { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; script-src 'self' https://apps.abacus.ai; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://apps.abacus.ai; object-src 'none'; base-uri 'self'; form-action 'self'" },
  ];
  return [
    { source: '/:path*', headers: securityHeaders },
    ...(process.env.NODE_ENV === 'development' ? [{
      source: '/_next/static/:path*',
      headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
    }] : []),
  ];
},
```

#### 9.3 Finish CSP tuning before claiming comprehensive protection

Exercise the **production container build**, not just development: login, dashboard, theme switching, owner selectors, user management, CSV and calendar downloads. Review actual script/font/connect violations, including the existing platform script in the root layout. Do not delete that script to make a report quiet.

For a stronger enforced script policy, integrate a fresh cryptographic nonce per HTML response into both the rendered scripts and policy, keep HTML dynamic/non-shared-cacheable, and verify the framework-generated inline scripts receive the nonce. Do not use a fixed nonce, and do not copy the report-only policy into enforcement unchanged: it blocks currently required inline scripts. This nonce integration is a separate compatibility step, **not implemented by the static header snippets**. Keep the limited baseline and report-only policy until that work is tested; do not mark full script-CSP protection complete beforehand.

Do not add `X-Frame-Options: DENY`/`SAMEORIGIN` or an unapproved `frame-ancestors` restriction to the managed preview: it runs inside an iframe. Do not add HSTS to local HTTP. Configure HSTS only at a confirmed HTTPS termination point after validating certificate/redirect behaviour. Neither HTTPS termination nor HSTS was verified by the local assessment.

### 10. Build and apply locally without resetting data

The steps here assume you have completed the edits above, retained your source backup, and that the database backup in section 1 passed its archive check. The application remains stopped during the schema change.

#### 10.1 Validate configuration and build both targets

```bash
docker compose config --quiet
docker compose --profile setup --progress=plain build app init > security-build.log 2>&1
```

Review `security-build.log`; do not continue after a failed build. Do not restore the earlier separate `tsc` step inside the Dockerfile: the existing build generates its route declarations before type-checking. No new package dependency is required for these snippets.

#### 10.2 Add the security-window table using the local-only setup service

```bash
docker compose up -d db
docker compose --profile setup run --rm init
```

The supplied initializer validates the local Compose database target, synchronises the schema without a data-loss override, and seeds missing controls without resetting users. Confirm the only intended schema change is the added `SecurityWindow` table and index. If it reports an unexpected drop, reset or destructive change, **stop** and investigate; never add a force/data-loss flag to get past it.

The application image is built with the updated generated database client. The setup image must be rebuilt too; otherwise it will use the old schema. No custom edit to the client generator block is required.

#### 10.3 Restart the application and inspect startup

```bash
docker compose up -d --force-recreate app
docker compose ps
docker compose logs --tail=100 app
```

Open `http://localhost:3000` on **your own computer**. Keep logs private and redact secrets/user data before sharing them. Successful startup is not security acceptance: complete section 11.

#### 10.4 Recovery / rollback

If the build fails, leave the prior database intact and fix the compilation error; do not erase data. If the new container fails, stop it and inspect its logs. The additive limiter table can remain unused while investigating; it does not require dropping any existing table.

If you must return to the old source, restore the saved source folder and rebuild, **but leave the vulnerable version offline or restricted to trusted local maintenance**. Reverting the code reintroduces the security findings. A database restore is a separate, explicitly approved recovery operation because it overwrites newer work; do not automatically restore it for a code-only failure.

### 11. Manual regression and security verification

Use a **disposable local copy** containing an Admin, an Assessor, a Viewer, one test review, test assessments and a test action. Use separate browser profiles/private windows so roles do not get mixed. Obtain IDs from that test copy only. Do not run a privilege-escalation probe against real records just to check whether a patch was applied. Stop at the first unexpected success and review the patch; the old bug can really grant privileges.

For authenticated API checks, open DevTools Console while signed into your local test app. This helper sends the browser's existing session without copying a cookie or password:

```javascript
async function apiCheck(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  console.log(response.status, await response.text());
}
```

Replace the ID placeholders below with test-record IDs. They are deliberately not working credentials or identifiers. Confirm the stored record/session after each rejected mutation, not just the response status.

#### T1 — Nested review update is rejected

As Assessor:

```javascript
await apiCheck('/api/reviews/<TEST_REVIEW_ID>', 'PATCH', {
  name: 'This must not be saved',
  createdBy: { update: { role: 'ADMIN' } },
});
```

Expected: **400**, no name change, creator role unchanged. Fetch `/api/auth/session` and confirm the account is still Assessor. Then update only a valid review name: **200** and the name changes. Repeat the malicious request as Admin: it should still be **400**, because privilege does not bypass schema validation.

#### T2 — Nested action writes are rejected on update and creation

As Assessor:

```javascript
await apiCheck('/api/actions/<TEST_ACTION_ID>', 'PATCH', {
  owner: { update: { role: 'ADMIN' } },
});
await apiCheck('/api/actions', 'POST', {
  reviewId: '<TEST_REVIEW_ID>',
  description: 'Must not create this action',
  owner: { create: { name: 'Unexpected account' } },
});
```

Expected: both **400**, no changed role, no new action/user. A normal action creation with an existing scalar `ownerId` still returns **201**. An unknown owner ID returns **400**. Empty owner/date fields clear them normally. Reopen/close the test action and check closure dates.

#### T3 — Score and identity tampering are rejected

As Assessor, send separately:

```javascript
await apiCheck('/api/assessments/<TEST_ASSESSMENT_ID>', 'PATCH', { score: 999 });
await apiCheck('/api/assessments/<TEST_ASSESSMENT_ID>', 'PATCH', {
  assessedById: '<OTHER_USER_ID>',
});
await apiCheck('/api/assessments/<TEST_ASSESSMENT_ID>', 'PATCH', {
  assessedBy: { update: { role: 'ADMIN' } },
});
await apiCheck('/api/assessments/<TEST_ASSESSMENT_ID>', 'PATCH', {
  completionState: 'INVALID_STATE',
});
```

Expected: **400** for each; no record changes. Valid completion-state edits still work, with `assessedById` set to the signed-in user.

#### T4 — Reject malformed input and preserve role boundaries

For each protected mutation above, check empty `{}`, unknown fields and malformed JSON: expected **400** for authorised writers. Check an invalid date such as `2026-02-30`: **400**. Unauthenticated mutation requests must return **401**; Viewer mutations must return **403**. Do not broaden existing Admin-only DELETE permissions. A nonexistent ID with a valid payload must return **404**, not an uncaught database error.

#### T5 — Anonymous dashboard access is blocked

In a signed-out/private browser, or using your local terminal without cookies:

```bash
curl -i http://localhost:3000/api/dashboard
```

Expected: **401** and no metrics. Each approved role can still load the dashboard normally. Repeat the anonymous check on `/api/reviews`, `/api/actions`, `/api/users`, `/api/notifications`, `/api/export?reviewId=TEST` and `/api/ics`: none should disclose assurance data.

#### T6 — Registration is closed in the API and UI

```bash
curl -i -X POST http://localhost:3000/api/signup -H 'Content-Type: application/json' --data '{}'
```

Expected: **403**. A complete body also returns 403, not a created account. `/signup` redirects to login, and login no longer offers registration. Existing Admin sign-in and Admin account creation still work. Confirm the user count did not increase from the signup probes.

#### T7 — Approved user creation/reset enforces passwords

Through Admin user management, attempt a one-character password and a password whose UTF-8 representation exceeds 72 bytes: both must fail. A compliant password creates the approved test user. Reset that test user's password: its existing session must cease to authorise protected API access; the new password works and the old one does not. Never record real passwords in the test report.

#### T8 — Directory minimisation does not break selectors

As Viewer/Assessor, `GET /api/users` returns only IDs/names. Review and action responses no longer include creator/owner email addresses. As Admin, the directory still supports profile/role editing. As Assessor, select an owner, save an action, reopen it and confirm the same owner remains selected.

Approved Viewers can still read shared records by design. If this is unacceptable, section 4.4 is unresolved: do not call the access-control issue fully closed for your use case.

#### T9 — Authentication limits survive endpoint switching and restart

Use only a dedicated test email in the disposable environment. Make at most the configured ten credential attempts in one window, alternating the real sign-in flow and the auxiliary endpoint. The next auxiliary request must return **429**; the sign-in provider must not issue a new session, even for a correct password while blocked. Restart the app container and confirm the block remains until the window expires. A different approved test account is not blocked by that account's budget. These are bounded local checks, not a brute-force or load test.

#### T10 — Reminder denial is tested without sending real email

First, signed out:

```bash
curl -i -X POST http://localhost:3000/api/reminders
```

Expected: **401**, with no new notification or email. As Viewer and Assessor: **403**. As Admin with a missing or wrong Origin header: **403** before any side effects. Only after those checks, in a test environment with authorised test recipients, trigger once from the correct-origin Admin browser: the handler may proceed. A second trigger in the same UTC day must return **429**, including after a container restart, without creating further notifications or sending again.

Inspect actual delivery/notification records; the existing route's success body is not proof that its email provider delivered anything. If no safe recipient environment is available, test only denied paths and mark the authorised-dispatch/deduplication test **not completed**, not passed.

#### T11 — Server-side scoring remains correct

Change the test assessment through all completion states and confirm the mapping in section 3.3. A notes-only edit must retain the same derived score. Copy a review forward and confirm the copied scores are derived from states. Review any historical mismatches separately. Do not write false assurance evidence into real reviews for this test.

#### T12 — CSV cells remain text, not formulas

In test assessment text fields, enter separately: `=1+1`, `+1+1`, `-1+1`, `@SUM(1,1)`, a tab followed by `=1+1`, spaces followed by `=1+1`, and ordinary text containing quotes, commas and a newline. Download the CSV. Inspect raw bytes: risky cells must have an apostrophe **inside** the CSV quotes before the original text; double quotes must be doubled.

Open using your normal Excel/LibreOffice import method. Confirm the risky values display as text rather than calculated results and that columns/rows remain intact. No external links, command execution or network-callback formulas are needed for this test. Record which spreadsheet application/version and import method you used.

#### T13 — Calendar input cannot create properties or extra events

Set a test action description to text containing an actual newline followed by `LOCATION:Injected`. Test a review name containing a newline and `END:VEVENT`, plus commas, semicolons, backslashes and a long non-ASCII name. Export ICS and inspect it as plain text before importing.

Expected: user text is escaped within SUMMARY/DESCRIPTION, not a new unfolded `LOCATION`/`END:VEVENT` property. Physical lines end in CRLF, each line is at most 75 UTF-8 bytes excluding CRLF, and continuation lines begin with a space. After unfolding, the number of event start/end pairs equals the exported actions. Import into the calendar application you use and confirm the original due date and one-day all-day event behaviour.

#### T14 — Headers exist on the running production container

```bash
curl -sS -D - -o /dev/null http://localhost:3000/login
curl -sS -D - -o /dev/null http://localhost:3000/api/dashboard
```

Expected: nosniff, Referrer-Policy, Permissions-Policy, the limited enforced CSP and the report-only CSP are present; the second response is still **401** when anonymous. Test signed-in UI flows and inspect CSP console violations. Do not mark a complete strict script CSP as passed merely because a report-only header exists. Local HTTP cannot validate deployment TLS or HSTS.

### 12. Release decision and evidence record

Record for each test: date, local image/build identifier, test role, disposable record ID, expected status, actual status, database/session observations, and pass/fail/not-tested. Redact passwords, cookies and personal information. Retain the baseline report and this guide alongside your change record.

**Release gates:** No privilege escalation through any patched write path; no anonymous dashboard access; public signup closed; approved-user scope accepted; reminder authorization verified; score tampering rejected; export injection tests passed; normal user-management/review/action flows still work; schema changes are additive and backup recovery has been rehearsed.

**Residual items to state explicitly:** Shared-record visibility is preserved unless a membership model is separately implemented. Stronger nonce-based script CSP, external TLS/HSTS, edge rate limits, full dependency review and a complete endpoint-by-endpoint OWASP verification are not supplied by these snippets. Reminder delivery is not guaranteed by the daily gate. The Docker build/run and the proposed fixes still require execution and testing on your installation.

This is a remediation runbook for the eight recorded findings, not an independent penetration-test certificate or a claim that the application is now secure. **The application remains unchanged until you apply and verify these instructions.**
