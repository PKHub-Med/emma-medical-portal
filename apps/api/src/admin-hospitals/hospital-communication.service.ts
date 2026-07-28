import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { AuditOutcome } from '../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit.types';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CommunicationConfiguration,
  ContactItem,
  ContactsPage,
  ContactsQuery,
} from './hospital-communication.types';

const contactSelection = {
  id: true,
  name: true,
  email: true,
  phone: true,
  jobTitle: true,
  active: true,
  linkedUser: { select: { id: true, email: true } },
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedContact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  active: boolean;
  linkedUser: { id: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class HospitalCommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async listContacts(
    hospitalId: string,
    query: ContactsQuery,
  ): Promise<ContactsPage> {
    validateUuid(hospitalId, 'szpitala');
    await this.requireHospital(hospitalId);
    const page = positiveInteger(query.page, 'page', 1);
    const pageSize = positiveInteger(query.pageSize, 'pageSize', 25, 100);
    const active = optionalBoolean(query.active, 'active');
    const linked = optionalBoolean(query.linked, 'linked');
    const search = query.search?.trim();
    if (search && search.length > 200) {
      throw new BadRequestException(
        'Wyszukiwana fraza może mieć maksymalnie 200 znaków.',
      );
    }
    const where: Prisma.ContactWhereInput = {
      hospitalId,
      ...(active === undefined ? {} : { active }),
      ...(linked === undefined
        ? {}
        : { linkedUserId: linked ? { not: null } : null }),
      ...(search
        ? {
            OR: ['name', 'email', 'phone', 'jobTitle'].map((field) => ({
              [field]: { contains: search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        select: contactSelection,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return {
      items: (items as SelectedContact[]).map(toContactItem),
      page,
      pageSize,
      totalCount,
    };
  }

  async createContact(
    hospitalId: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<ContactItem> {
    validateUuid(hospitalId, 'szpitala');
    await this.requireHospital(hospitalId);
    const data = parseCreateContact(body);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: { hospitalId, ...data, active: true, linkedUserId: null },
          select: contactSelection,
        });
        if (this.auditService && actorId) {
          await this.auditService.record(
            {
              actorId,
              action: 'CONTACT_CREATED',
              outcome: AuditOutcome.SUCCESS,
              entityType: 'CONTACT',
              entityId: contact.id,
              hospitalId,
              metadata: {
                contactId: contact.id,
                changedFields: ['name', 'email', 'phone', 'jobTitle', 'active'],
              },
              ...requestContext,
            },
            tx,
          );
        }
        return contact;
      });
      return toContactItem(created as SelectedContact);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(
          'Kontakt z tym adresem e-mail już istnieje w tym szpitalu.',
        );
      }
      throw error;
    }
  }

  async updateContact(
    hospitalId: string,
    contactId: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<ContactItem> {
    validateUuid(hospitalId, 'szpitala');
    validateUuid(contactId, 'kontaktu');
    const data = parseUpdateContact(body);
    const existing = await this.prisma.contact.findFirst({
      where: { id: contactId, hospitalId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        jobTitle: true,
        active: true,
        linkedUserId: true,
      },
    });
    if (!existing) throw new NotFoundException('Nie znaleziono kontaktu.');
    if (data.linkedUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: data.linkedUserId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) {
        throw new BadRequestException(
          'Nie można powiązać kontaktu z tym użytkownikiem.',
        );
      }
    }
    const changedFields = Object.keys(data).filter(
      (field) =>
        data[field as keyof typeof data] !==
        existing[field as keyof typeof existing],
    );
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.update({
          where: { id: contactId },
          data,
          select: contactSelection,
        });
        if (existing.active && data.active === false) {
          const settings = await tx.communicationSettings.findUnique({
            where: { hospitalId },
            select: { id: true, primaryContactId: true },
          });
          if (settings) {
            await tx.communicationRecipient.deleteMany({
              where: {
                communicationSettingsId: settings.id,
                contactId,
              },
            });
            if (settings.primaryContactId === contactId) {
              await tx.communicationSettings.update({
                where: { id: settings.id },
                data: { primaryContactId: null },
              });
            }
          }
        }
        if (this.auditService && actorId && changedFields.length) {
          const action =
            existing.active && data.active === false
              ? 'CONTACT_DEACTIVATED'
              : existing.linkedUserId !== data.linkedUserId &&
                  data.linkedUserId
                ? 'CONTACT_LINKED_TO_USER'
                : 'CONTACT_UPDATED';
          await this.auditService.record(
            {
              actorId,
              action,
              outcome: AuditOutcome.SUCCESS,
              entityType: 'CONTACT',
              entityId: contactId,
              hospitalId,
              metadata: { contactId, changedFields },
              ...requestContext,
            },
            tx,
          );
        }
        return contact;
      });
      return toContactItem(updated as SelectedContact);
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException(
          'Kontakt z tym adresem e-mail już istnieje w tym szpitalu.',
        );
      }
      throw error;
    }
  }

  async getCommunication(
    hospitalId: string,
  ): Promise<CommunicationConfiguration> {
    validateUuid(hospitalId, 'szpitala');
    const hospital = await this.requireHospital(hospitalId);
    const settings = await this.prisma.communicationSettings.findUnique({
      where: { hospitalId },
      select: {
        enabled: true,
        primaryContact: { select: contactSelection },
        recipients: {
          select: { contact: { select: contactSelection } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return buildConfiguration(
      hospital,
      settings?.enabled ?? false,
      (settings?.primaryContact as SelectedContact | null) ?? null,
      (settings?.recipients ?? []).map(
        (recipient) => recipient.contact as SelectedContact,
      ),
    );
  }

  async updateCommunication(
    hospitalId: string,
    body: unknown,
    actorId?: string,
    requestContext: AuditRequestContext = {},
  ): Promise<CommunicationConfiguration> {
    validateUuid(hospitalId, 'szpitala');
    const hospital = await this.requireHospital(hospitalId);
    const data = parseCommunicationBody(body);
    const ids = [
      ...(data.primaryContactId ? [data.primaryContactId] : []),
      ...data.recipientContactIds,
    ];
    const contacts = ids.length
      ? await this.prisma.contact.findMany({
          where: { id: { in: [...new Set(ids)] } },
          select: { id: true, hospitalId: true, active: true },
        })
      : [];
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    for (const id of ids) {
      const contact = byId.get(id);
      if (!contact || contact.hospitalId !== hospitalId) {
        throw new BadRequestException(
          'Wskazany kontakt nie należy do tego szpitala.',
        );
      }
      if (!contact.active) {
        throw new BadRequestException('Wskazany kontakt jest nieaktywny.');
      }
    }
    const previous = await this.prisma.communicationSettings.findUnique({
      where: { hospitalId },
      select: { primaryContactId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      const settings = await tx.communicationSettings.upsert({
        where: { hospitalId },
        create: {
          hospitalId,
          enabled: data.enabled,
          primaryContactId: data.primaryContactId,
        },
        update: {
          enabled: data.enabled,
          primaryContactId: data.primaryContactId,
        },
        select: { id: true },
      });
      await tx.communicationRecipient.deleteMany({
        where: { communicationSettingsId: settings.id },
      });
      if (data.recipientContactIds.length) {
        await tx.communicationRecipient.createMany({
          data: data.recipientContactIds.map((contactId) => ({
            communicationSettingsId: settings.id,
            contactId,
          })),
        });
      }
      if (this.auditService && actorId) {
        await this.auditService.record(
          {
            actorId,
            action: 'COMMUNICATION_SETTINGS_UPDATED',
            outcome: AuditOutcome.SUCCESS,
            entityType: 'COMMUNICATION_SETTINGS',
            entityId: settings.id,
            hospitalId,
            metadata: {
              enabled: data.enabled,
              recipientCount: data.recipientContactIds.length,
              primaryContactChanged:
                previous?.primaryContactId !== data.primaryContactId,
            },
            ...requestContext,
          },
          tx,
        );
      }
    });
    return this.getCommunication(hospital.id);
  }

  private async requireHospital(
    hospitalId: string,
  ): Promise<{ id: string; name: string; active: boolean }> {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true, name: true, active: true },
    });
    if (!hospital) throw new NotFoundException('Nie znaleziono szpitala.');
    return hospital;
  }
}

export function buildConfiguration(
  hospital: { id: string; name: string; active: boolean },
  enabled: boolean,
  primaryContact: SelectedContact | null,
  recipients: SelectedContact[],
): CommunicationConfiguration {
  const warnings: string[] = [];
  if (!hospital.active) warnings.push('Szpital jest nieaktywny.');
  if (!primaryContact) warnings.push('Nie wskazano kontaktu głównego.');
  else if (!primaryContact.active)
    warnings.push('Kontakt główny jest nieaktywny.');
  else if (!isEmail(primaryContact.email))
    warnings.push('Kontakt główny ma nieprawidłowy adres e-mail.');
  const configurationComplete =
    hospital.active &&
    enabled &&
    Boolean(
      primaryContact?.active && isEmail(primaryContact.email),
    );
  return {
    hospital: { id: hospital.id, name: hospital.name },
    enabled,
    primaryContact: primaryContact
      ? toContactItem(primaryContact)
      : null,
    recipients: recipients.map(toContactItem),
    configurationComplete,
    configurationWarnings: warnings,
  };
}

function toContactItem(contact: SelectedContact): ContactItem {
  return { ...contact };
}

function parseCreateContact(body: unknown) {
  const record = recordBody(body, ['name', 'email', 'phone', 'jobTitle']);
  return {
    name: requiredText(record.name, 'Imię i nazwisko', 200),
    email: emailValue(record.email),
    phone: optionalText(record.phone, 'Telefon', 100),
    jobTitle: optionalText(record.jobTitle, 'Stanowisko', 200),
  };
}

function parseUpdateContact(body: unknown) {
  const record = recordBody(body, [
    'name',
    'email',
    'phone',
    'jobTitle',
    'active',
    'linkedUserId',
  ]);
  if (!Object.keys(record).length) {
    throw new BadRequestException('Nie podano pól do zmiany.');
  }
  return {
    ...(record.name === undefined
      ? {}
      : { name: requiredText(record.name, 'Imię i nazwisko', 200) }),
    ...(record.email === undefined
      ? {}
      : { email: emailValue(record.email) }),
    ...(record.phone === undefined
      ? {}
      : { phone: optionalText(record.phone, 'Telefon', 100) }),
    ...(record.jobTitle === undefined
      ? {}
      : { jobTitle: optionalText(record.jobTitle, 'Stanowisko', 200) }),
    ...(record.active === undefined
      ? {}
      : { active: booleanValue(record.active, 'active') }),
    ...(record.linkedUserId === undefined
      ? {}
      : {
          linkedUserId:
            record.linkedUserId === null
              ? null
              : uuidValue(record.linkedUserId, 'użytkownika'),
        }),
  };
}

function parseCommunicationBody(body: unknown) {
  const record = recordBody(body, [
    'enabled',
    'primaryContactId',
    'recipientContactIds',
  ]);
  const enabled = booleanValue(record.enabled, 'enabled');
  const primaryContactId =
    record.primaryContactId === null
      ? null
      : uuidValue(record.primaryContactId, 'kontaktu głównego');
  if (!Array.isArray(record.recipientContactIds)) {
    throw new BadRequestException(
      'Lista dodatkowych odbiorców jest nieprawidłowa.',
    );
  }
  const recipientContactIds = [
    ...new Set(
      record.recipientContactIds.map((id) =>
        uuidValue(id, 'odbiorcy'),
      ),
    ),
  ];
  return { enabled, primaryContactId, recipientContactIds };
}

function recordBody(body: unknown, allowed: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Nieprawidłowy format danych wejściowych.');
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new BadRequestException('Dane zawierają niedozwolone pola.');
  }
  return record;
}

function requiredText(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${label} jest wymagane.`);
  }
  const text = value.trim();
  if (text.length > maximum) {
    throw new BadRequestException(`${label} ma zbyt wiele znaków.`);
  }
  return text;
}

function optionalText(value: unknown, label: string, maximum: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} ma nieprawidłową wartość.`);
  }
  const text = value.trim();
  if (text.length > maximum) {
    throw new BadRequestException(`${label} ma zbyt wiele znaków.`);
  }
  return text || null;
}

function emailValue(value: unknown) {
  if (typeof value !== 'string') {
    throw new BadRequestException('Adres e-mail jest wymagany.');
  }
  const email = value.trim().toLowerCase();
  if (!isEmail(email)) {
    throw new BadRequestException('Adres e-mail jest nieprawidłowy.');
  }
  return email;
}

function isEmail(email: string) {
  return (
    email.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function booleanValue(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`Pole ${field} musi być typu boolean.`);
  }
  return value;
}

function optionalBoolean(value: string | undefined, field: string) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException(
    `Parametr ${field} musi mieć wartość true albo false.`,
  );
}

function positiveInteger(
  value: string | undefined,
  field: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new BadRequestException(`Parametr ${field} jest nieprawidłowy.`);
  }
  return parsed;
}

function uuidValue(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new BadRequestException(`Identyfikator ${label} jest nieprawidłowy.`);
  }
  validateUuid(value, label);
  return value;
}

function validateUuid(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(
      `Identyfikator ${label} jest nieprawidłowy.`,
    );
  }
}

function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
