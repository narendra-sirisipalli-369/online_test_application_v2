# Deploying to the lab (System 1 = server, 39 clients over LAN)

Server: **System 1 — 192.168.29.196**
Clients: everyone else, no install needed, just a browser.

## 1. Install on System 1 only

- **Node.js LTS** — nodejs.org (check "Add to PATH" during install)
- **PostgreSQL 16** — postgresql.org/download/windows
  - Remember the `postgres` user password you set
  - Keep port 5432 (default)
  - Create a database named exactly `student_test_platform` (pgAdmin → Databases → Create → Database)
- **Python 3** — python.org (check "Add python.exe to PATH")
  - After install, run `where python` in Command Prompt and note the full path — you'll need it below

## 2. Copy the project to System 1

Copy this entire `student-test-platform` folder over (USB / network share). Make sure `apps/api/uploads/` and `apps/api/storage/` come along — they hold the actual images referenced by imported questions.

Also copy `student_test_platform.dump` (in the project root) — this is your real database content (tests, question banks, students) exported from the dev machine.

## 3. Set up the two `.env` files

In `apps/api/` and `apps/web/`, rename `.env.windows-server.example` → `.env`, then edit the placeholders inside (Postgres password, Python path, a real JWT secret and admin password). Both files already have the correct LAN IP (`192.168.29.196`) filled in — only change that IP if System 1's address is different when you actually set it up (`ipconfig` to confirm).

## 4. Install dependencies & restore the database

```cmd
cd path\to\student-test-platform
npm install
npm run prisma:generate
```

Restore your real data (skip `prisma db push` — the dump already includes the schema):
```cmd
"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U postgres -d student_test_platform -h localhost student_test_platform.dump
```
(Or via pgAdmin: right-click `student_test_platform` → Restore... → pick the `.dump` file.)

If you'd rather start completely fresh with no existing content, run `npm --workspace apps/api exec prisma db push` instead of restoring the dump.

## 5. Build and run

```cmd
npm run build
```

Two Command Prompt windows, keep both open (or set up `pm2` — see note below):

**Window 1:**
```cmd
npm --workspace apps/api run start
```

**Window 2:**
```cmd
npm --workspace apps/web run preview -- --port 5173
```

Optional — keep both running in the background with `pm2` (`npm install -g pm2`):
```cmd
pm2 start "npm --workspace apps/api run start" --name api
pm2 start "npm --workspace apps/web run preview -- --port 5173" --name web
```

## 6. Open the firewall (PowerShell as Administrator, on System 1)

```powershell
New-NetFirewallRule -DisplayName "Test App API" -Direction Inbound -LocalPort 4100 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Test App Web" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
```

## 7. Verify

1. On System 1 itself: `http://localhost:4100/api/auth/avatars` should return JSON.
2. From a client machine: `http://192.168.29.196:4100/api/auth/avatars` should return the same JSON. If this fails but step 1 works, it's the firewall.
3. From a client machine: `http://192.168.29.196:5173` should load the login page. Log in and confirm your existing tests/question banks are there.

## 8. Client machines

Just open a browser and go to:
```
http://192.168.29.196:5173
```

## Known gotchas

- **Wi-Fi client/AP isolation**: if clients can't reach the server over Wi-Fi, this is almost always the cause — ask whoever manages the router to disable it, or use wired Ethernet.
- **All machines must be on the same subnet/network.**
- **8GB RAM / i5-7500 is plenty** for 39 students doing lightweight API calls — just close other apps on System 1 before the test.

## Re-syncing data later (Mac → Windows, if you keep editing content on your Mac before test day)

On your Mac:
```bash
pg_dump -U narendrasirisipalli -h localhost -d student_test_platform -F c -f student_test_platform.dump
```
Copy the new `.dump` file to System 1, then on System 1:
```cmd
"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U postgres -d student_test_platform -h localhost --clean student_test_platform.dump
```
The `--clean` flag drops the old data first so the restore replaces it cleanly instead of erroring on conflicts.
