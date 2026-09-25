import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { verifyToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

export type AuthedRequest = Request & {
  auth?: {
    userId: string;
    role: UserRole;
    name: string;
  };
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireRole(role: UserRole) {
  return async function roleMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
    await requireAuth(req, res, async () => {
      if (req.auth?.role !== role) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      next();
    });
  };
}
