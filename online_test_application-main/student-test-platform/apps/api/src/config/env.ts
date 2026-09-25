import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '../../');

// Load apps/api/.env explicitly, before anything below reads process.env.
// (Previously only Prisma's own lazy .env loading populated process.env, which
// happens on the first DB query — too late for values like CORS_ORIGIN and HOST
// that are read once, here, at module load time.)
const envFile = path.join(apiRoot, '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const bundledPython = path.resolve(apiRoot, '../../../.venv/bin/python3');
const defaultPython = fs.existsSync(bundledPython) ? bundledPython : 'python3';

export const env = {
  port: Number(process.env.PORT || 4100),
  // 0.0.0.0 binds to every network interface so LAN clients can reach the API,
  // not just processes on this machine (127.0.0.1 would block them).
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  databaseUrl: process.env.DATABASE_URL || '',
  uploadDir: path.join(apiRoot, 'uploads'),
  storageDir: path.join(apiRoot, 'storage'),
  preprocessPython:
    process.env.PREPROCESS_PYTHON ||
    defaultPython,
  preprocessScript: path.join(apiRoot, 'scripts', 'preprocess_docx.py'),
  // Comma-separated list of allowed browser origins for CORS, e.g.
  // "http://localhost:5173,http://192.168.29.196:5173".
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
