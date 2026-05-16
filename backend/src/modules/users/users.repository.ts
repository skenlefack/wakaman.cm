/**
 * Users module — Repository (Prisma)
 *
 * Data access for user profiles. Auth-related user creation
 * lives in AuthRepository — this handles post-auth CRUD.
 */

import type { PrismaClient, User } from '@prisma/client';
import type { UpdateMyProfileBodyType, ListUsersQueryType } from './users.schemas.js';

const USER_SELECT = {
  id: true,
  phone: true,
  email: true,
  type: true,
  status: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  language: true,
  phoneVerifiedAt: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    }) as Promise<User | null>;
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    }) as Promise<User | null>;
  }

  async updateProfile(id: string, data: UpdateMyProfileBodyType): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    }) as Promise<User>;
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: USER_SELECT,
    }) as Promise<User>;
  }

  async listUsers(query: ListUsersQueryType): Promise<{ items: User[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { deletedAt: null };

    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: items as User[], total };
  }
}
