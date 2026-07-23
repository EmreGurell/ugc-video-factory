// Faz 3 backfill: kredi sistemi eklenmeden önce oluşturulmuş organizasyonlar
// active_plan_id=null, credits_remaining=0 ile kalır — bu script onları "free"
// plana atar ki mevcut kullanıcılar bir sonraki job'da 402 ile kilitlenmesin.
// seed-plans.ts'den SONRA çalıştırılmalı.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const freePlan = await prisma.plan.findUnique({ where: { key: 'free' } });
  if (!freePlan) {
    throw new Error('"free" planı bulunamadı — önce seed-plans.ts çalıştırılmalı');
  }

  const orgs = await prisma.organization.findMany({ where: { active_plan_id: null } });
  console.log(`${orgs.length} organizasyon (plansız) bulundu.`);

  for (const org of orgs) {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        active_plan_id: freePlan.key,
        credits_remaining: freePlan.monthly_credit_allowance,
        credits_period_start: new Date(),
      },
    });
    console.log(`${org.id} (${org.name}) → free plan, ${freePlan.monthly_credit_allowance} kredi`);
  }

  console.log('Bitti.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
