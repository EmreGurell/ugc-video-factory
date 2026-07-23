// Faz 2 backfill: mevcut refresh_token satırlarının organization_id'sini
// kullanıcının varsayılan (en eski) organizasyonuna bağlar.
// organization_id NOT NULL yapılmadan önce, tam olarak bir kere çalıştırılır.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tokens = await prisma.refreshToken.findMany({ select: { id: true, user_id: true } });
  console.log(`${tokens.length} refresh token kontrol edilecek.`);

  for (const token of tokens) {
    const membership = await prisma.membership.findFirst({
      where: { user_id: token.user_id },
      orderBy: { created_at: 'asc' },
    });
    if (!membership) {
      console.log(`Atlanıyor (membership yok): user_id=${token.user_id}`);
      continue;
    }
    await prisma.refreshToken.update({
      where: { id: token.id },
      data: { organization_id: membership.organization_id },
    });
  }

  console.log('Bitti.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
