import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationRecipient } from './notifications.types';

@Injectable()
export class NotificationRecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(hospitalId: string): Promise<NotificationRecipient[]> {
    const settings = await this.prisma.communicationSettings.findUnique({
      where: { hospitalId },
      select: {
        enabled: true,
        primaryContact: { select: contactSelection },
        recipients: {
          orderBy: { createdAt: 'asc' },
          select: { contact: { select: contactSelection } },
        },
      },
    });
    if (!settings?.enabled) return [];

    const ordered = [
      settings.primaryContact,
      ...settings.recipients.map(({ contact }) => contact),
    ];
    const unique = new Map<string, NotificationRecipient>();
    for (const contact of ordered) {
      if (
        !contact ||
        contact.hospitalId !== hospitalId ||
        !contact.active ||
        contact.sourceDeletedAt
      ) continue;
      const email = normalizeEmail(contact.email);
      if (!isValidEmail(email) || unique.has(email)) continue;
      unique.set(email, {
        contactId: contact.id,
        email,
        name: contact.name.trim() || null,
      });
    }
    return [...unique.values()];
  }
}

const contactSelection = {
  id: true,
  hospitalId: true,
  name: true,
  email: true,
  active: true,
  sourceDeletedAt: true,
} as const;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
