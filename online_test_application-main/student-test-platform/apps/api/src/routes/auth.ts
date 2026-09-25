import { Router } from 'express';
import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { signToken, hashPassword, verifyPassword } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

authRouter.get('/avatars', asyncHandler(async (_req, res) => {
  const avatars = await prisma.avatar.findMany({ orderBy: { name: 'asc' } });
  res.json({ avatars });
}));

authRouter.post('/student-signup', asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2),
    password: z.string().min(4),
    course: z.string().min(2),
    mobileNumber: z.string().min(7).max(15),
    avatarId: z.string().optional(),
  });
  const payload = schema.parse(req.body);

  const existingUser = await prisma.user.findUnique({ where: { name: payload.name }, select: { id: true } });
  if (existingUser) {
    return res.status(409).json({ message: 'This name is already in use. Please choose another name.' });
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: payload.name,
        passwordHash: await hashPassword(payload.password),
        role: UserRole.STUDENT,
        course: payload.course,
        mobileNumber: payload.mobileNumber,
        avatarId: payload.avatarId,
      },
      select: { id: true, name: true, role: true, course: true, mobileNumber: true, avatar: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'This name is already in use. Please choose another name.' });
    }
    throw error;
  }

  const token = signToken(user);
  res.status(201).json({ token, user });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    password: z.string().min(4),
  });
  const payload = schema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { name: payload.name },
    include: { avatar: true },
  });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const valid = await verifyPassword(payload.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.isBlocked) {
    return res.status(403).json({ message: 'This account has been blocked. Contact your admin.' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      course: user.course,
      mobileNumber: user.mobileNumber,
      avatar: user.avatar,
    },
  });
}));

authRouter.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(4).optional(),
  });
  const payload = schema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!existing) {
    return res.status(404).json({ message: 'User not found' });
  }

  const valid = await verifyPassword(payload.currentPassword, existing.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  if (payload.name && payload.name !== existing.name) {
    const nameTaken = await prisma.user.findUnique({ where: { name: payload.name } });
    if (nameTaken) {
      return res.status(409).json({ message: 'That name is already taken' });
    }
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: payload.name ?? existing.name,
      passwordHash: payload.newPassword ? await hashPassword(payload.newPassword) : existing.passwordHash,
    },
    include: { avatar: true },
  });

  res.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      course: user.course,
      mobileNumber: user.mobileNumber,
      avatar: user.avatar,
    },
  });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { avatar: true },
  });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      course: user.course,
      mobileNumber: user.mobileNumber,
      avatar: user.avatar,
    },
  });
}));
