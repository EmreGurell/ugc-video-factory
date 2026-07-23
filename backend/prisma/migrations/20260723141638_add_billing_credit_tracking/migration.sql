-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "actual_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "credits_charged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "credits_refunded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plans" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_credit_allowance" INTEGER NOT NULL,
    "price_usd" DOUBLE PRECISION,
    "revenuecat_product_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "provider_cost_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "unit_cost_usd" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_cost_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_cost_events_organization_id_idx" ON "provider_cost_events"("organization_id");

-- CreateIndex
CREATE INDEX "provider_cost_events_job_id_idx" ON "provider_cost_events"("job_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_active_plan_id_fkey" FOREIGN KEY ("active_plan_id") REFERENCES "plans"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_cost_events" ADD CONSTRAINT "provider_cost_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_cost_events" ADD CONSTRAINT "provider_cost_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
