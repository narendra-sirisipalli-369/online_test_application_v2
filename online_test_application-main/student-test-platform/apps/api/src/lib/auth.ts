import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole, type User } from '@prisma/client';
import { env } from '../config/env.js';

export type AuthPayload = {
  userId: string;
  role: UserRole;
  name: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(user: Pick<User, 'id' | 'name' | 'role'>) {
  const payload: AuthPayload = {
    userId: user.id,
    role: user.role,
    name: user.name,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.jwtSecret) as AuthPayload;
}
