import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { EmmaAdminGuard } from '../src/admin-hospitals/emma-admin.guard';
import {
  HospitalCommunicationService,
  buildConfiguration,
} from '../src/admin-hospitals/hospital-communication.service';
import type { AuditService } from '../src/audit/audit.service';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import type { PrismaService } from '../src/prisma/prisma.service';

const hospitalId = '11111111-1111-4111-8111-111111111111';
const otherHospitalId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-07-28T20:00:00.000Z');
const hospital = { id: hospitalId, name: 'Szpital Testowy', active: true };
const contact = {
  id: contactId,
  hospitalId,
  name: 'Jan Kowalski',
  email: 'jan@szpital.pl',
  phone: null,
  jobTitle: null,
  active: true,
  linkedUserId: null,
  linkedUser: null,
  createdAt: now,
  updatedAt: now,
};
const admin: AuthenticatedUser = {
  id: 'admin',
  email: 'admin@emma.pl',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

describe('Hospital contacts and communication', () => {
  const mocks = makePrisma();

  beforeEach(() => {
    jest.clearAllMocks();
    mocks.hospital.findUnique.mockResolvedValue(hospital);
    mocks.transaction.mockImplementation((argument: unknown) =>
      typeof argument === 'function'
        ? argument(mocks.client)
        : Promise.all(argument as Promise<unknown>[]),
    );
  });

  it('creates a normalized contact belonging to the selected hospital', async () => {
    mocks.contact.create.mockImplementation(({ data }: { data: object }) => ({
      ...contact,
      ...data,
    }));
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await service.createContact(hospitalId, {
      name: ' Jan Kowalski ',
      email: ' JAN@SZPITAL.PL ',
      phone: null,
      jobTitle: null,
    });
    expect(mocks.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hospitalId,
          email: 'jan@szpital.pl',
          active: true,
          linkedUserId: null,
        }),
      }),
    );
  });

  it('rejects the same e-mail twice in one hospital', async () => {
    mocks.contact.create.mockRejectedValue({ code: 'P2002' });
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await expect(
      service.createContact(hospitalId, {
        name: 'Jan',
        email: contact.email,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows the same e-mail in another hospital', async () => {
    mocks.hospital.findUnique.mockResolvedValue({
      ...hospital,
      id: otherHospitalId,
    });
    mocks.contact.create.mockImplementation(({ data }: { data: object }) => ({
      ...contact,
      id: '55555555-5555-4555-8555-555555555555',
      ...data,
    }));
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await expect(
      service.createContact(otherHospitalId, {
        name: 'Jan',
        email: contact.email,
      }),
    ).resolves.toMatchObject({ email: contact.email });
  });

  it('rejects a recipient from another hospital', async () => {
    mocks.contact.findMany.mockResolvedValue([
      { id: contactId, hospitalId: otherHospitalId, active: true },
    ]);
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await expect(
      service.updateCommunication(hospitalId, {
        enabled: true,
        primaryContactId: null,
        recipientContactIds: [contactId],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an inactive recipient', async () => {
    mocks.contact.findMany.mockResolvedValue([
      { id: contactId, hospitalId, active: false },
    ]);
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await expect(
      service.updateCommunication(hospitalId, {
        enabled: true,
        primaryContactId: null,
        recipientContactIds: [contactId],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('removes a deactivated contact from recipients and clears primaryContactId', async () => {
    mocks.contact.findFirst.mockResolvedValue(contact);
    mocks.contact.update.mockResolvedValue({ ...contact, active: false });
    mocks.communicationSettings.findUnique.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      primaryContactId: contactId,
    });
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await service.updateContact(hospitalId, contactId, { active: false });
    expect(mocks.communicationRecipient.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ contactId }),
    });
    expect(mocks.communicationSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { primaryContactId: null } }),
    );
  });

  it('returns disabled safe defaults when settings do not exist', async () => {
    mocks.communicationSettings.findUnique.mockResolvedValue(null);
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
    );
    await expect(service.getCommunication(hospitalId)).resolves.toMatchObject({
      enabled: false,
      primaryContact: null,
      recipients: [],
      configurationComplete: false,
    });
  });

  it('calculates configurationComplete only for active, enabled, valid primary contact', () => {
    expect(buildConfiguration(hospital, true, contact, []))
      .toMatchObject({ configurationComplete: true });
    expect(buildConfiguration(hospital, false, contact, []))
      .toMatchObject({ configurationComplete: false });
    expect(buildConfiguration(hospital, true, null, []))
      .toMatchObject({
        configurationComplete: false,
        configurationWarnings: expect.arrayContaining([
          'Nie wskazano kontaktu głównego.',
        ]),
      });
  });

  it('returns 403 to USER and allows EMMA_ADMIN', () => {
    expect(new EmmaAdminGuard().canActivate(contextFor(admin))).toBe(true);
    expect(() =>
      new EmmaAdminGuard().canActivate(
        contextFor({ ...admin, systemRole: 'USER' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('writes an audit event when settings change', async () => {
    const record = jest.fn().mockResolvedValue({});
    mocks.contact.findMany.mockResolvedValue([]);
    mocks.communicationSettings.findUnique.mockResolvedValue(null);
    mocks.communicationSettings.upsert.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
    });
    const service = new HospitalCommunicationService(
      mocks.client as unknown as PrismaService,
      { record } as unknown as AuditService,
    );
    jest.spyOn(service, 'getCommunication').mockResolvedValue(
      buildConfiguration(hospital, false, null, []),
    );
    await service.updateCommunication(
      hospitalId,
      {
        enabled: false,
        primaryContactId: null,
        recipientContactIds: [],
      },
      admin.id,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMMUNICATION_SETTINGS_UPDATED',
        metadata: {
          enabled: false,
          recipientCount: 0,
          primaryContactChanged: true,
        },
      }),
      mocks.client,
    );
  });
});

function makePrisma() {
  const hospitalModel = { findUnique: jest.fn() };
  const contactModel = {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const settingsModel = {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  };
  const recipientModel = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const client = {
    hospital: hospitalModel,
    contact: contactModel,
    user: { findUnique: jest.fn() },
    communicationSettings: settingsModel,
    communicationRecipient: recipientModel,
    $transaction: jest.fn(),
  };
  return {
    client,
    hospital: hospitalModel,
    contact: contactModel,
    communicationSettings: settingsModel,
    communicationRecipient: recipientModel,
    transaction: client.$transaction,
  };
}

function contextFor(user: AuthenticatedUser): ExecutionContext {
  const request = { currentUser: user } as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
