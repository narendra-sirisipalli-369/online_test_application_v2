import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';

for (const dir of [env.uploadDir, env.storageDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(filename: string) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${Date.now()}_${base}${ext}`;
}

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => cb(null, safeName(file.originalname)),
});

export const upload = multer({ storage: uploadStorage });

export function toPublicAssetPath(absolutePath: string) {
  const relative = path.relative(env.storageDir, absolutePath);
  return `/files/${relative.split(path.sep).join('/')}`;
}
