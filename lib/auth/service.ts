/**
 * Auth service — signup/login over the foundation tables (users, workspaces,
 * workspace_members). Signup creates the user, a workspace, and an owner
 * membership atomically. Passwords are bcrypt-hashed.
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../db/client';
import type { Session } from './session';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function signupUser(email: string, password: string, fullName?: string): Promise<Session> {
  const normEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normEmail } });
  if (existing) throw new AuthError('An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 10);
  const { user, workspace } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: normEmail, fullName: fullName ?? null, passwordHash } });
    const workspace = await tx.workspace.create({ data: { name: fullName ? `${fullName}'s workspace` : `${normEmail}'s workspace` } });
    await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'owner' } });
    return { user, workspace };
  });
  return { userId: user.id, workspaceId: workspace.id, email: normEmail };
}

export async function loginUser(email: string, password: string): Promise<Session> {
  const normEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normEmail } });
  if (!user || !user.passwordHash) throw new AuthError('Invalid email or password.');
  const okPw = await bcrypt.compare(password, user.passwordHash);
  if (!okPw) throw new AuthError('Invalid email or password.');

  const member = await prisma.workspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  if (!member) throw new AuthError('No workspace is associated with this account.');
  return { userId: user.id, workspaceId: member.workspaceId, email: normEmail };
}
