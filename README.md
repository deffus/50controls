### Cyber Assurance — Docker package

This package repairs dependency installation, generated database-client placement, container build output and one-off initialization. Use these instructions instead of the older deployment guide. Full container build/runtime testing is not available in the packaging workspace; see `PACKAGE_CHECKS.txt` in the downloadable archive for the exact checks completed.

#### 1. Replace files safely on your Mac

Quit any running development process. Back up your existing application folder and database before changing an installation containing real data. Extract the new ZIP, then copy its contents over the files in your existing `cyber_assurance_app` folder. Keep the same folder name and any existing Compose project name so Docker continues using the same database volume.

The ZIP does not contain `.env`. **Keep your existing `.env` and database password.** Do not delete volumes, run `down -v`, or run initialization with reset/accept-data-loss flags. No hosted credentials or assessment records are included.

#### 2. Configure the environment

Open a terminal in that application folder. Docker Desktop must be running. You do not need Node.js or Yarn installed on your Mac; the containers provide them.

Only for a fresh installation without an `.env` file:

```bash
cp .env.example .env
```

In your local editor, fill in `DB_PASSWORD` and `NEXTAUTH_SECRET` with different long random values from a password manager. Use a hexadecimal value for the database password to avoid URL-encoding problems. Set `NEXTAUTH_URL=http://localhost:3000`.

For an existing installation, preserve those existing values. Compose sets the other connection/authentication variables inside the containers. It deliberately ignores any old hosted `DATABASE_URL` in your local `.env`.

Do not share `.env`, commit it, or put secret values into terminal commands. The file is excluded from both the ZIP and Docker build context. Container environment variables remain visible to administrators of Docker on your machine.

Check the configuration without printing resolved secrets:

```bash
docker compose config --quiet
```

#### 3. Build the app and initialization images

```bash
docker compose --profile setup --progress=plain build app init > build.log 2>&1
```

The image uses Node.js 22 and the image's Yarn Classic. It permits lockfile resolution instead of enforcing the incompatible exported baseline. Your original lockfile on disk is not changed by this container install. This does not promise reproducible transitive dependency resolution across future rebuilds.

If the build fails, stop and share the redacted `build.log`. Do not ignore dependency-engine checks. On success, continue below.

#### 4. Start the database and initialize once

```bash
docker compose up -d db
docker compose --profile setup run --rm init
```

The initialization container waits for the database health check. It creates missing schema objects without destructive override flags and inserts missing control definitions. Existing definitions, users and assessments are not reset by the seed. If schema initialization warns about data loss or fails, stop rather than overriding it.

This command is restricted to the Compose database service and cannot use the hosted database address. It does not run automatically each time the app starts. No shared administrator account is created.

#### 5. Start and open the app

```bash
docker compose up -d app
docker compose ps
```

Open **http://localhost:3000 on your Mac**. On a fresh database, use **Create one** to register your own account before giving anyone else access; the first account becomes administrator. If your local database already contains users, use an existing administrator account. Do not delete users to force administrator assignment.

The app is bound to `127.0.0.1`, so other computers cannot access it by default. The database has no host-published port. This is a local evaluation package, not a claim that production security has been audited.

#### 6. Confirm persistence and roles

Create a review, confirm the 50 controls are available, edit and save a check, then reload it. Create an action, export the review and calendar, and verify the files open. Sign out and back in. Restart the app with `docker compose restart app` and confirm your saved work remains. Test Viewer restrictions before inviting a team.

#### Existing data and backups

The Docker volume stores the database separately from the app container. Rebuilding the app does not itself delete that volume. Keep the original folder/project name and database password. Never use `docker compose down -v` or volume-pruning commands on an installation containing data. A source ZIP or review CSV is not a full database backup; arrange and test database backups before operational use.

#### Scope and remaining limitations

Email delivery and scheduling are not enabled by this package. The existing reminder endpoint requires access-control and delivery-handling work before enabling external access or scheduled execution. No Slack or Teams integration has been added.

Do not expose this local package to the internet or a wider team without a separate security review, encrypted transport, registration/access controls and backup procedures. The prior embedded hosted-preview issue is not addressed by this packaging change. The hosted application's database is not read or changed by the package preparation.

#### Packaging implementation

The managed schema is preserved unchanged. Generation runs at its configured location, then a container-only script copies the generated artifacts into the dependency directory used by later stages and confirms that the models can be imported. A separate container configuration fixes build-output tracing to `/app` and enables standalone output. The Docker build checks that both the server entrypoint and generated database client exist before creating the runtime image.

A separate `init` image contains the tooling, seed scripts and control data; the runtime image runs as an unprivileged user. Environment files, host dependency folders, caches and logs are excluded from the build context.

#### User access and password resets

Sign in as an administrator and open **User Management** in the sidebar. Use **Create user** to enter a name, email, access level and initial password. New accounts default to Viewer. **Edit** changes a user's name, email and role. Admin manages users and assurance work; Assessor edits reviews/checks/actions; Viewer reads information and is not a disabled account. You cannot remove your own administrator access.

For a forgotten password, select **Reset password** next to that user. Enter and confirm a password of at least 12 characters (maximum 72 bytes), then save. Share it through your approved secure credential-sharing channel. No email is sent and no self-service email recovery is configured. Existing sessions are rejected on their next request, and the old password no longer works. Resetting your own password signs you out. These are administrator-set passwords, not automatically expiring temporary passwords.

Keep a second trusted administrator for recovery. If you cannot sign in, ask another administrator to reset your password. If no administrator can sign in, account recovery requires a separate local administrative recovery procedure; do not rerun the seed, reset the database or delete users.

After installing this user-management update, existing sessions require a fresh sign-in. Role changes are enforced on the next authenticated request; users can reload their page to refresh visible controls.

For an existing Docker installation, retain the same application folder/project name, `.env` and database volume. After replacing the source files, rebuild with `docker compose build app` and restart with `docker compose up -d app`. No schema migration or initialization command is needed for this user-management update. Do not use `down -v`.
