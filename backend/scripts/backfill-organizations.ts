// Faz 1 backfill: her mevcut User için kişisel bir Organization + owner
// Membership oluşturur, mevcut Job/ReferencePhoto satırlarını o organizasyona bağlar.
// organization_id NOT NULL yapılmadan önce, tam olarak bir kere çalıştırılır.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`${users.length} kullanıcı bulundu.`);

  for (const user of users) {
    const existingMembership = await prisma.membership.findFirst({ where: { user_id: user.id } });
    if (existingMembership) {
      console.log(`Atlanıyor (zaten üyeliği var): ${user.email}`);
      continue;
    }

    const org = await prisma.organization.create({
      data: { name: `${user.email} (Kişisel)` },
    });
    await prisma.membership.create({
      data: { organization_id: org.id, user_id: user.id, role: 'owner' },
    });

    const { count: jobCount } = await prisma.job.updateMany({
      where: { user_id: user.id },
      data: { organization_id: org.id },
    });
    const { count: refCount } = await prisma.referencePhoto.updateMany({
      where: { user_id: user.id },
      data: { organization_id: org.id },
    });

    console.log(`${user.email} → org ${org.id} (${jobCount} job, ${refCount} referans taşındı)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
