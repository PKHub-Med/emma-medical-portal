import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentHospitalScope } from '../portal-hospitals/current-hospital-scope.service';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hospitalScope: CurrentHospitalScope,
  ) {}

  async list(userId: string, sessionId: string) {
    const hospital = await this.hospitalScope.resolve(userId, sessionId);
    try {
      const items = await this.prisma.department.findMany({
        where: { hospitalId: hospital.id, active: true },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return { items };
    } catch {
      throw new ServiceUnavailableException(
        'Nie udało się pobrać listy oddziałów.',
      );
    }
  }
}
