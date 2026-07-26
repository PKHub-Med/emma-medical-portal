import 'dotenv/config';
import { SystemRole, UserStatus } from '../generated/prisma/enums';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument?.slice(prefix.length);
}

async function createAdministrator(): Promise<void> {
  const email = readArgument('email')?.trim().toLowerCase();
  const password = readArgument('password');

  if (!email || !password) {
    throw new Error(
      'Użycie: npm run admin:create -- --email=admin@example.com --password="bezpieczne-haslo"',
    );
  }

  const prisma = new PrismaService();

  try {
    await prisma.$connect();

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new Error('Użytkownik o tym adresie e-mail już istnieje.');
    }

    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        status: UserStatus.ACTIVE,
        systemRole: SystemRole.EMMA_ADMIN,
      },
    });

    console.log(`Utworzono administratora: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

void createAdministrator().catch((error: unknown) => {
  if (
    error instanceof Error &&
    (error.message.startsWith('Użycie:') ||
      error.message ===
        'Użytkownik o tym adresie e-mail już istnieje.')
  ) {
    console.error(error.message);
  } else {
    console.error('Nie udało się utworzyć administratora.');
  }

  process.exitCode = 1;
});
