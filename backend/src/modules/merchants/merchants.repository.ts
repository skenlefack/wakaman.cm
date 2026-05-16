/**
 * Merchants module — Repository (Prisma)
 */

import type { PrismaClient, Merchant, MerchantUser, MerchantHours, User } from '@prisma/client';
import type { CreateMerchantBodyType, UpdateMerchantBodyType, ListMerchantsQueryType, AdminListMerchantsQueryType } from './merchants.schemas.js';

const MERCHANT_PUBLIC_SELECT = {
  id: true,
  businessName: true,
  type: true,
  status: true,
  description: true,
  logoUrl: true,
  coverUrl: true,
  addressLabel: true,
  city: true,
  district: true,
  landmark: true,
  latitude: true,
  longitude: true,
  phonePrimary: true,
  phoneSecondary: true,
  email: true,
  commissionRate: true,
  averagePreparationMinutes: true,
  minimumOrderFcfa: true,
  acceptsCash: true,
  acceptsMomo: true,
  averageRating: true,
  totalOrders: true,
  totalRevenueFcfa: true,
  legalName: true,
  registrationNumber: true,
  taxId: true,
  momoNumber: true,
  momoOperator: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export class MerchantsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ============================================================
  // MERCHANTS
  // ============================================================

  async createWithOwner(data: CreateMerchantBodyType, ownerUserId: string): Promise<Merchant> {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          businessName: data.businessName,
          type: data.type,
          description: data.description,
          logoUrl: data.logoUrl,
          coverUrl: data.coverUrl,
          addressLabel: data.addressLabel,
          city: data.city,
          district: data.district,
          landmark: data.landmark,
          latitude: data.latitude,
          longitude: data.longitude,
          phonePrimary: data.phonePrimary,
          phoneSecondary: data.phoneSecondary,
          email: data.email,
          minimumOrderFcfa: data.minimumOrderFcfa ?? 0,
          averagePreparationMinutes: data.averagePreparationMinutes ?? 20,
          acceptsCash: data.acceptsCash ?? true,
          acceptsMomo: data.acceptsMomo ?? true,
        },
        select: MERCHANT_PUBLIC_SELECT,
      });
      await tx.merchantUser.create({
        data: { merchantId: merchant.id, userId: ownerUserId, role: 'OWNER' },
      });
      return merchant as unknown as Merchant;
    });
  }

  async findById(id: string): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: { id },
      select: MERCHANT_PUBLIC_SELECT,
    }) as unknown as Promise<Merchant | null>;
  }

  async findActiveById(id: string): Promise<Merchant | null> {
    return this.prisma.merchant.findFirst({
      where: { id, status: 'ACTIVE', deletedAt: null },
      select: MERCHANT_PUBLIC_SELECT,
    }) as unknown as Promise<Merchant | null>;
  }

  async update(id: string, data: UpdateMerchantBodyType): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data,
      select: MERCHANT_PUBLIC_SELECT,
    }) as unknown as Merchant;
  }

  async updateStatus(id: string, status: string): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: { status: status as any },
      select: MERCHANT_PUBLIC_SELECT,
    }) as unknown as Merchant;
  }

  async listPublic(query: ListMerchantsQueryType): Promise<{ items: Merchant[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { status: 'ACTIVE', deletedAt: null };

    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.type) where.type = query.type;
    if (query.search) where.businessName = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        select: MERCHANT_PUBLIC_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return { items: items as unknown as Merchant[], total };
  }

  async listAdmin(query: AdminListMerchantsQueryType): Promise<{ items: Merchant[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { deletedAt: null };

    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) where.businessName = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        select: MERCHANT_PUBLIC_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return { items: items as unknown as Merchant[], total };
  }

  // ============================================================
  // MERCHANT USERS (team)
  // ============================================================

  async findMembership(userId: string, merchantId: string): Promise<MerchantUser | null> {
    return this.prisma.merchantUser.findUnique({
      where: { userId_merchantId: { userId, merchantId } },
    });
  }

  async addMember(merchantId: string, userId: string, role: string): Promise<MerchantUser> {
    return this.prisma.merchantUser.create({
      data: { merchantId, userId, role },
    });
  }

  async removeMember(userId: string, merchantId: string): Promise<void> {
    await this.prisma.merchantUser.delete({
      where: { userId_merchantId: { userId, merchantId } },
    });
  }

  async listTeam(merchantId: string): Promise<(MerchantUser & { user: Pick<User, 'id' | 'phone' | 'firstName' | 'lastName'> })[]> {
    return this.prisma.merchantUser.findMany({
      where: { merchantId },
      include: { user: { select: { id: true, phone: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    }) as any;
  }

  // ============================================================
  // HOURS
  // ============================================================

  async getHours(merchantId: string): Promise<MerchantHours[]> {
    return this.prisma.merchantHours.findMany({
      where: { merchantId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async replaceHours(merchantId: string, hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }[]): Promise<MerchantHours[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.merchantHours.deleteMany({ where: { merchantId } });
      await tx.merchantHours.createMany({
        data: hours.map((h) => ({
          merchantId,
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed ?? false,
        })),
      });
      return tx.merchantHours.findMany({
        where: { merchantId },
        orderBy: { dayOfWeek: 'asc' },
      });
    });
  }
}
