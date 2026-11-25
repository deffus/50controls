# OWASP-Aligned Security Assessment: Cyber Assurance Checklist Application

- **Assessment Target:** Local application runtime (`http://localhost:3000`) and underlying application source in `/home/ubuntu/cyber_assurance_app/nextjs_space`.
- **Methodology & Frameworks Referenced:**
  - OWASP Top 10 2025 (and standard Top 10 risk categories)
  - OWASP Web Security Testing Guide (WSTG v4.2 baseline test IDs)
  - OWASP Application Security Verification Standard (ASVS 5.0 concepts: V1 Architecture, V2 Authentication, V3 Session Management, V4 Access Control, V5 Input Validation, V13 API/Web Services, V14 Configuration)
- **Execution Nature:** Non-destructive, evidence-based verification using controlled, temporary test accounts and test records. All test fixtures were cleaned up immediately upon completion. No automated denial-of-service, fuzzing, or external brute-force tests were conducted.

---

### Executive Summary

The application demonstrates strong foundational controls in several key areas:
1. **Password storage:** Uses `bcryptjs` with salt rounds 12.
2. **Session management:** Employs encrypted JWT session cookies with `HttpOnly`, `SameSite=Lax`, and `Secure` attributes set.
3. **Database access:** Queries are mediated primarily through Prisma ORM parameterized calls, protecting against traditional SQL injection.
4. **Administrative User Management:** The recently patched `/admin/users` interface enforces role validations, blocks self-demotion, invalidates stale sessions upon password reset, and prevents privilege escalation via client-side session payload modification.

However, **critical and high-severity authorization vulnerabilities were confirmed during live dynamic testing**:
1. **Critical Privilege Escalation (Mass Assignment):** An `ASSESSOR` role can escalate themselves to `ADMIN` by sending a nested Prisma update payload when updating a review or action (`createdBy: { update: { role: 'ADMIN' } }`).
2. **Critical Broken Object-Level Authorization on Reminders (`/api/reminders`):** An unauthenticated caller can trigger notifications and outbound email reminders containing review descriptions and owner email addresses.
3. **High-Severity Data Exposure (Unauthenticated Dashboard):** `/api/dashboard` has no authentication check, leaking overall review status, action counts, domain maturity scores, and trend dates to any anonymous caller.
4. **High-Severity Excessive Data Exposure via Self-Registration:** Public `/signup` allows anyone to register an account and immediately view all organizational reviews, control assessments, actions, user names, and emails.
5. **Medium-Severity Data Integrity Tampering:** Control assessment scores can be arbitrarily overwritten (`score: 999`) independent of standard completion state scoring rules due to unvalidated patch bodies.
6. **Medium-Severity Injection Risks:** Formula injection in CSV exports (`=1+1`) and iCalendar property injection via unsanitized CRLF characters in action descriptions.

---

### Detailed Findings & Technical Evidence

#### 1. CRITICAL: Privilege Escalation via Nested Mass Assignment in Prisma Updates
- **OWASP Classification:** OWASP Top 10 2025 - A01: Broken Access Control | ASVS v5.0 V4.1 / V5.1 | WSTG-v42-BUSL-02 / WSTG-v42-INPV-12
- **Affected Endpoints:**
  - `PATCH /api/reviews/[id]`
  - `PATCH /api/actions/[id]`
- **Vulnerability Details:**
  The `PATCH` handler accepts arbitrary JSON from the client request and passes `data` directly into Prisma's `update()` method:
  ```typescript
  // app/api/reviews/[id]/route.ts
  const data = await request.json();
  const review = await prisma.review.update({ where: { id }, data });
  ```
  Because Prisma allows relational updates via nested objects, an authenticated `ASSESSOR` can submit:
  ```json
  {
    "createdBy": {
      "update": {
        "role": "ADMIN"
      }
    }
  }
  ```
  Prisma updates the related `User` record associated with the review. Because the authentication JWT callback re-queries user roles from the database on subsequent calls, the user's active session is immediately elevated to `ADMIN`.
- **Verified Evidence:**
  Executed in `security-assessment/test.py`:
  - Test account created with `role: "ASSESSOR"`.
  - Sent `PATCH /api/reviews/<fixture-id>` with `createdBy: { update: { role: "ADMIN" } }`.
  - Result: HTTP `200 OK`.
  - Subsequent session check `/api/auth/session` returned `role: "ADMIN"`.
  - The same escalation was reproduced via `PATCH /api/actions/<id>` using the `owner: { update: { role: "ADMIN" } }` relationship.
- **Remediation:**
  Strictly whitelist permitted fields before passing objects to Prisma. Do not pass untyped `request.json()` bodies to ORM update operations. Use Zod schemas to reject unexpected or nested properties.

---

#### 2. CRITICAL: Unauthenticated & Unthrottled Execution on Reminders Endpoint
- **OWASP Classification:** OWASP Top 10 2025 - A01: Broken Access Control & A07: Identification and Authentication Failures | WSTG-v42-ATHZ-02 / WSTG-v42-BUSL-04
- **Affected Endpoint:**
  - `POST /api/reminders`
- **Vulnerability Details:**
  `app/api/reminders/route.ts` contains no session check (`auth()`), no API key requirement, and no IP/rate throttling. Calling this endpoint queries all overdue or due-soon actions across all reviews, inserts in-app notification rows, and attempts to send external reminder emails via the Abacus notification service.
- **Impact:**
  - An anonymous attacker can repeatedly flood user inboxes with notifications.
  - Can exhaust third-party API quotas.
  - Can induce uncontrolled database growth via `prisma.notification.createMany`.
- **Remediation:**
  Require administrative session authentication, or protect the route with a strong, dedicated environment secret (`CRON_SECRET` / bearer token header) if called by external schedulers.

---

#### 3. HIGH: Information Exposure on Metrics Dashboard to Anonymous Callers
- **OWASP Classification:** OWASP Top 10 2025 - A01: Broken Access Control | ASVS v5.0 V4.1 | WSTG-v42-INFO-01
- **Affected Endpoint:**
  - `GET /api/dashboard`
- **Vulnerability Details:**
  Unlike `/api/reviews` and `/api/actions`, `/api/dashboard/route.ts` lacks the authentication gate:
  ```typescript
  // Missing:
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  ```
- **Verified Evidence:**
  - `GET /api/dashboard` called without session or authentication cookies returned HTTP `200 OK`.
  - The response body exposed open action counts, overdue action counts, domain maturity statistics, and historical audit trend dates.
- **Remediation:**
  Add the standard `auth()` check at the top of `GET /api/dashboard` and return HTTP `401 Unauthorized` if unauthenticated.

---

#### 4. HIGH: Open Self-Registration Exposes Assurance Portfolio
- **OWASP Classification:** OWASP Top 10 2025 - A01: Broken Access Control & A07: Identification and Authentication Failures | ASVS v5.0 V2.1 / V4.1 | WSTG-v42-IDNT-02
- **Affected Endpoints & Views:**
  - Public `/signup` form and `POST /api/signup`
  - Read permissions on `/api/reviews`, `/api/export`, and `/api/users`
- **Vulnerability Details:**
  The application maintains an open public signup route (`/signup`). While subsequent registrants receive the `VIEWER` role rather than `ADMIN`, a `VIEWER` has uninhibited read access to:
  1. All organizational reviews (`GET /api/reviews` and `GET /api/reviews/[id]`).
  2. Full CSV export of review evidence, findings, and scoring (`GET /api/export?reviewId=...`).
  3. The complete user directory with full names and emails (`GET /api/users`).
- **Verified Evidence:**
  - Registered a throwaway user via `POST /api/signup`.
  - The resulting account immediately fetched review details created by other users and exported the full control assessment CSV.
- **Remediation:**
  For internal enterprise assurance platforms, public self-registration should be disabled. New accounts should only be provisioned by an administrator via `/admin/users`, or restricted to verified corporate domain email patterns with pending approval queues.

---

#### 5. MEDIUM: Unrestricted Assessment Scoring Manipulation
- **OWASP Classification:** OWASP Top 10 2025 - A04: Insecure Design & A03: Injection (Integrity) | ASVS v5.0 V5.1 | WSTG-v42-BUSL-01
- **Affected Endpoint:**
  - `PATCH /api/assessments/[id]`
- **Vulnerability Details:**
  When updating a control assessment:
  ```typescript
  if (data.completionState) {
    data.score = getScore(data.completionState);
  }
  ```
  If `data.completionState` is omitted in the payload, but `data.score` is provided directly, the application accepts the raw score without validation.
- **Verified Evidence:**
  - An Assessor sent `PATCH /api/assessments/<id>` with `{"score": 999}`.
  - The response returned HTTP `200 OK` with `score: 999`, while `completionState` remained `NOT_ASSESSED`.
  - This invalidates executive metrics, coverage scoring, and compliance dashboards.
- **Remediation:**
  Calculate scores strictly on the server based on `completionState`. Reject direct client updates to the `score` column.

---

#### 6. MEDIUM: CSV Formula Injection (Formula / CSV Injection)
- **OWASP Classification:** OWASP Top 10 2025 - A03: Injection | ASVS v5.0 V5.1 | WSTG-v42-INPV-03
- **Affected Endpoint:**
  - `GET /api/export`
- **Vulnerability Details:**
  Free-text fields (such as `evidenceRefs`, `findings`, and `controlOwner`) are exported to CSV wrapped only in quotes:
  ```typescript
  const csv = [headers, ...rows]
    .map((row: any[]) => row.map((cell: any) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  ```
- **Verified Evidence:**
  - Injected an assessment finding starting with `=1+1`.
  - Exported CSV contained `"=1+1"`.
  - Spreadsheet applications (Excel, Google Sheets, LibreOffice Calc) interpret leading characters (`=`, `+`, `-`, `@`, `\t`, `\r`) as executable spreadsheet formulas or DDE command triggers.
- **Remediation:**
  Sanitize all export fields by prepending a single quote (`'`) to any cell value that starts with `=`, `+`, `-`, `@`, or a tab/carriage return.

---

#### 7. MEDIUM: iCalendar Line Injection via CRLF
- **OWASP Classification:** OWASP Top 10 2025 - A03: Injection | ASVS v5.0 V5.1 | WSTG-v42-INPV-15
- **Affected Endpoint:**
  - `GET /api/ics`
- **Vulnerability Details:**
  Action descriptions are interpolated directly into the VCALENDAR string without stripping newline characters (`\r` or `\n`):
  ```typescript
  SUMMARY:Action Due: ${(a?.description ?? '').slice(0, 60)}
  ```
- **Verified Evidence:**
  - Created an action with description: `Test\nLOCATION:Injected test location`.
  - Exported `.ics` file contained:
    ```text
    SUMMARY:Action Due: Test
    LOCATION:Injected test location
    ```
  - An attacker could inject arbitrary calendar directives, modify event boundaries, or alter organizer details.
- **Remediation:**
  Escape newlines (`\r` and `\n` to `\n`) or strip line breaks from single-line ICS properties such as `SUMMARY`.

---

#### 8. LOW: Missing Security Response Headers
- **OWASP Classification:** OWASP Top 10 2025 - A05: Security Misconfiguration | ASVS v5.0 V14.4 | WSTG-v42-CONF-07
- **Vulnerability Details:**
  Inspection of HTTP response headers on `http://localhost:3000/login` indicated that standard defensive HTTP headers are not configured:
  - `Content-Security-Policy` (CSP) is missing.
  - `X-Content-Type-Options: nosniff` is missing.
  - `Referrer-Policy: strict-origin-when-cross-origin` is missing.
  - `Permissions-Policy` is missing.
- **Remediation:**
  Configure these headers in `next.config.js` or via a dedicated reverse proxy (Nginx, Caddy, Cloudflare).

---

### OWASP Category Verification Summary

| OWASP Top 10 Category | Status | Remarks |
|---|---|---|
| **A01: Broken Access Control** | **FAIL** | Confirmed privilege escalation (Mass Assignment) and unauthenticated endpoints (`/api/dashboard`, `/api/reminders`). |
| **A02: Cryptographic Failures** | **PASS** | Bcrypt (cost 12) used; cookies marked `HttpOnly` and `SameSite=Lax`. Sensitive variables (`DATABASE_URL`, `NEXTAUTH_SECRET`) are kept server-side. |
| **A03: Injection** | **PARTIAL** | SQL injection protected via Prisma. CSV formula injection and ICS property injection present. |
| **A04: Insecure Design** | **PARTIAL** | Self-registration exposes sensitive corporate assurance data without an approval workflow. |
| **A05: Security Misconfiguration** | **PARTIAL** | Missing browser hardening headers (CSP, nosniff, Referrer-Policy). |
| **A06: Vulnerable & Outdated Components** | **PASS** | Uses current Next.js 16.4.5, Node 22 baseline, and modern Prisma 6.7.0. |
| **A07: Identification & Auth Failures** | **PARTIAL** | `/api/signup` allows 1-character passwords (lacks the 12-char minimum enforced in `/admin/users`). |
| **A08: Software & Data Integrity Failures** | **PARTIAL** | Direct `score` manipulation bypasses business logic. |
| **A09: Security Logging & Monitoring** | **PARTIAL** | Basic console logging exists; no persistent security audit trail for role changes or failed logins. |
| **A10: Server-Side Request Forgery (SSRF)**| **PASS** | Outbound notification fetch targets a fixed URL; no user-controlled URL fetches. |

---

### Prioritized Remediation Roadmap

1. **Immediate (Blocker for multi-user deployment):**
   - Whitelist request fields in `PATCH /api/reviews/[id]` and `PATCH /api/actions/[id]` to block nested relational updates (`createdBy`, `owner`).
   - Add session authentication to `/api/dashboard`.
   - Protect `/api/reminders` behind an administrative authorization check or secret header token.
2. **Short-Term (Prior to production use):**
   - Disable open self-registration, or enforce email domain whitelisting and an admin approval workflow. Enforce the 12-character password policy on `/api/signup`.
   - Sanitize CSV exports (prepend single quote to formula trigger characters).
   - Sanitize newline characters in `.ics` calendar generation.
   - Restrict assessment scoring so that `score` is always strictly derived from `completionState`.
3. **Defense-in-Depth:**
   - Configure HTTP security headers (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`) in `next.config.js`.
   - Implement an append-only audit log table for role modifications, user deletions, and password resets.
