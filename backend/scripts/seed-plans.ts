// Sabit plan seviyeleri — RevenueCat ürünleriyle Faz 4'te eşleşecek.
// Kredi = 0.05 USD (bkz. src/billing/credit-costs.ts USD_PER_CREDIT).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  { key: 'free', name: 'Ücretsiz', monthly_credit_allowance: 20, price_usd: 0, revenuecat_product_ids: [] },
  { key: 'starter', name: 'Starter', monthly_credit_allowance: 200, price_usd: 9.99, revenuecat_product_ids: ['starter_monthly'] },
  { key: 'pro', name: 'Pro', monthly_credit_allowance: 600, price_usd: 24.99, revenuecat_product_ids: ['pro_monthly'] },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { key: plan.key }, create: plan, update: plan });
    console.log(`Plan hazır: ${plan.key} (${plan.monthly_credit_allowance} kredi/ay)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
