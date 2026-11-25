# Cybersecurity Assurance Checklist

A portable web application for managing a 50-control cybersecurity baseline assurance checklist with scoring, action tracking, email reminders and reporting.

## Features

- **50 pre-loaded controls** across 10 security domains with evidence requirements, test procedures and pass criteria
- **Multiple reviews** — track assessments over time; copy forward from a previous review without overwriting history
- **Scoring** — 0–4 maturity scale; coverage and verified-effectiveness metrics calculated automatically
- **Action tracker** — remediation actions with owner, due date, status, overdue alerts
- **Dashboard** — KPIs, domain breakdown, state distribution, progress trends
- **User management** — Admin / Assessor / Viewer roles; first registered user becomes Admin
- **Email reminders** — daily digest of overdue and due-soon actions
- **Calendar export** — .ics download of action due dates
- **CSV export** — download review data for offline analysis
- **Dark mode** by default, with a persistent light-mode toggle

## Quick Start with Docker Compose

```bash
# 1. Clone the repository
git clone https://github.com/deffus/50controls.git
cd 50controls

# 2. Copy and edit environment variables
cp .env.example .env
# Edit .env — at minimum set NEXTAUTH_SECRET to a random string:
#   openssl rand -base64 32

# 3. Validate the configuration without displaying its secrets:
docker compose config --quiet

# 4. Build the image
docker compose --profile setup --progress=plain build app init > build.log 2>&1
#    This builds the application and a separate database-initialization image. Output goes to build.log, so the terminal may appear quiet while it runs.
#.   Continue only if the build succeeds. If it fails, upload build.log after checking it contains no credentials.

# 5. Start the database
docker compose up -d db
docker compose ps
#.   Docker creates the database and a persistent storage volume. The database may initially show health: starting; the next command waits for it to become healthy.

# 6. Create the tables and load the controls
docker compose --profile setup run --rm init
#    If initialisation fails or warns about data loss, stop—do not use reset or data-loss override flags.

# 7. Start the application
docker compose up -d app
docker compose ps

#    On the same computer running Docker, open:

http://localhost:3000

#    Register your own account using the signup link. The first registered account in a fresh database becomes administrator. You can then open User Management to create additional users and assign their access.

# Later: start, stop and troubleshoot
# To stop the app and database without deleting their stored data:
docker compose stop

# To start them again:
docker compose up -d db app

# You do not need to repeat initialization for normal restarts.

# If startup fails, inspect recent logs:
docker compose logs --tail=100 app db

# Never run docker compose down -v or delete the database volume unless you deliberately intend to erase its data. Keep the same folder/project name and database password. Email reminders are not configured by these steps.
```

## Running Locally (without Docker)-NOT TESTED

```bash
# Prerequisites: Node.js 20+, PostgreSQL

# 1. Install dependencies
yarn install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string and a random NEXTAUTH_SECRET

# 3. Set up the database
npx prisma generate
npx prisma db push
yarn prisma db seed

# 4. Start the dev server
yarn dev
```


## Scoring Model

| Completion State | Score |
|---|---|
| Not implemented / Planned / Ineffective | 0 |
| Partially implemented | 1 |
| Implemented – unverified | 2 |
| Partially effective | 3 |
| Effective | 4 |
| Not assessed / Not applicable | Excluded |

**Scored maturity** = achieved points ÷ (4 × assessed applicable controls)

## Daily Reminders

Call `POST /api/reminders` daily (e.g. via cron, or a scheduled task) to generate in-app notifications and send email reminders for overdue and due-soon actions.

## Testing report and actions to be taken

Due to credit allocation, all I managed at this time is to assess the app, fixes not implimented yet, but the report and actions are here should you like to explore this further.
Please not, the app designed as a helper utility to run internally and NOT to be exposed publicly.
you can read the findings here [Report](https://github.com/deffus/50controls/blob/main/OWASP_SECURITY_ASSESSMENT_REPORT.md/).
and follow the steps to make things better using the guide here [Fix guide](https://github.com/deffus/50controls/blob/main/Cyber_Assurance_Manual_Security_Remediation_Guide.md/).

