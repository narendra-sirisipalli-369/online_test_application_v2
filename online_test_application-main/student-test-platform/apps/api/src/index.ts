import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { studentRouter } from './routes/student.js';

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin/non-browser requests (curl, server-to-server) send no Origin header.
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(env.uploadDir));
app.use('/files', express.static(env.storageDir));
app.use('/avatars', express.static(path.resolve(env.storageDir, '../../web/public/avatars')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/student', studentRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ message });
});

app.listen(env.port, env.host, () => {
  console.log(`API listening on ${env.host}:${env.port} (reachable at http://localhost:${env.port} and http://<this-machine-LAN-IP>:${env.port})`);
  console.log(`Allowed CORS origins: ${env.corsOrigins.join(', ')}`);
});
