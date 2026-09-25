# ThinkPlus Student Test Platform

This repository contains the complete ThinkPlus testing product and its DOCX question-extraction logic.

```text
services/                         Core DOCX extraction, validation, and image-mapping logic
student-test-platform/
  apps/api/                       Express API, Prisma schema, migrations, and import bridge
  apps/web/                       React and Vite web application
  docs/                           Architecture and database diagrams
  docker-compose.yml              Local PostgreSQL service
```

## Product capabilities

- Manual and DOCX-imported question banks.
- Passage/data-set and standalone questions with ordered inline images.
- Sectional tests with reading, question selection, answer, and result phases.
- CAT, IPMAT Indore, and IPMAT Rohtak mock-test templates.
- Exam-style mock attempt screen with live timing, section progression, palette navigation, and review marks.
- Administrator controls for question review, publishing, monitoring, analytics, and export.

## Quick start

### Prerequisites

- Node.js 20+ and npm 10+
- Docker Desktop
- Python 3 for DOCX imports

### Install and configure

```bash
cd student-test-platform
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d
npm run prisma:generate
npm --workspace apps/api exec prisma migrate deploy
npm run seed
npm run dev
```

The web application is available at `http://localhost:5173`; the API runs at `http://localhost:4100`.

Set `PREPROCESS_PYTHON` in `student-test-platform/apps/api/.env` only when Python is not available as `python3` or in `backend/.venv`.

## End-to-end mock fixtures

After the normal seed, add original answer-keyed fixtures for CAT and IPMAT mock-test flows:

```bash
cd student-test-platform
npm --workspace apps/api exec tsx scripts/seed-mock-test-banks.ts
```

## Verification

```bash
cd student-test-platform
npm --workspace apps/api exec prisma migrate status
npm --workspace apps/web run lint
npm run build
```

See [student-test-platform/README.md](student-test-platform/README.md) for the full environment, migration, storage, and production guide.
