# Student Test Platform

A full-stack testing platform for administrators and students. Administrators can import DOCX question papers or create question banks manually, then publish sectional tests and CAT/IPMAT mock exams. Students take timed tests, submit answers, and view results when the configured visibility policy allows it.

## Features

- Role-based administrator and student access.
- DOCX question-paper import with extraction review, answer-key correction, and image handling.
- Manual question-bank creator for standalone questions and passage/data sets.
- Inline images before, between, or after question and passage text, with content previews.
- Sectional tests with reading/selection and answer phases.
- CAT, IPMAT Indore, and IPMAT Rohtak mock templates with subject-aware validation.
- Exam-style mock-test interface with a real-time timer, sections, question palette, review marks, and submission flow.
- Admin analytics, session monitoring, results export, and student profiles.

## Technology

| Layer | Technology |
| --- | --- |
| Web application | React, TypeScript, Vite, React Router |
| API | Node.js, Express, TypeScript |
| Database | PostgreSQL and Prisma ORM |
| Document import | Python DOCX preprocessing bridge |
| Local database | Docker Compose PostgreSQL 16 |

## Repository layout

```text
apps/
  api/                 Express API, Prisma schema, migrations, import scripts
  web/                 React application
docs/diagrams/         Mermaid architecture and database diagrams
docker-compose.yml     Local PostgreSQL service
```

## Prerequisites

- Node.js 20 or newer and npm 10 or newer
- Docker Desktop, recommended for PostgreSQL
- Python 3 for DOCX imports. The import pipeline needs the Python dependencies used by `backend/services`.

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set secure values in `apps/api/.env` outside local development:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/student_test_platform?schema=public"
JWT_SECRET="use-a-long-random-secret-outside-local-development"
PORT=4100
ADMIN_NAME="admin"
ADMIN_PASSWORD="change-this-password"
# Optional: PREPROCESS_PYTHON="/absolute/path/to/python3"
```

`apps/web/.env` should contain:

```dotenv
VITE_API_URL="http://localhost:4100"
```

### 3. Start PostgreSQL

```bash
docker compose up -d
```

### 4. Apply schema and seed the administrator

```bash
npm run prisma:generate
npm --workspace apps/api exec prisma migrate deploy
npm run seed
```

The seed creates the configured administrator and starter avatars, using `ADMIN_NAME` and `ADMIN_PASSWORD` from `apps/api/.env`.

### 5. Run the application

```bash
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:4100` by default.

Run services individually when needed:

```bash
npm run dev:api
npm run dev:web
```

## Mock-test question fixtures

This repository includes original, answer-keyed fixtures for end-to-end testing. They reproduce exam structures, not past-paper content.

```bash
npm --workspace apps/api exec tsx scripts/seed-mock-test-banks.ts
```

| Exam | Sections | Questions |
| --- | --- | --- |
| CAT | VARC 24, DILR 22, QA 22 | 68 |
| IPMAT Indore | QA MCQ 30, QA SA 15, VA 45 | 90 |
| IPMAT Rohtak | QA 40, LR 40, VA 40 | 120 |

## Development commands

```bash
npm run build                         # Type-check and production-build API and web app
npm --workspace apps/web run lint     # Run web static checks
npm --workspace apps/api exec prisma migrate dev --name <change-name>
npm --workspace apps/api exec prisma studio
```

Use `prisma migrate dev` while developing a schema change, and commit the generated migration. Use `prisma migrate deploy` for fresh environments, staging, and production.

## Verification

Run these checks before release:

```bash
npm --workspace apps/api exec prisma migrate status
npm --workspace apps/web run lint
npm run build
```

## File storage and imports

- Manual image uploads are stored under `apps/api/uploads` and served from `/uploads`.
- Imported document assets are stored under `apps/api/storage` and served from `/files`.
- These directories are ignored by Git. Use persistent object storage or mounted volumes for production.
- `apps/api/scripts/preprocess_docx.py` bridges to the existing `backend/services` DOCX reader, validator, and image mapper.

## Production notes

- Set a strong, unique `JWT_SECRET` and administrator password.
- Use managed PostgreSQL and run `prisma migrate deploy` during release.
- Set `VITE_API_URL` to the public API URL before building the web application.
- Store uploads and imported assets on durable storage.

## Diagrams

- [Application architecture](docs/diagrams/application-architecture.mmd)
- [Database schema](docs/diagrams/database-schema.mmd)
