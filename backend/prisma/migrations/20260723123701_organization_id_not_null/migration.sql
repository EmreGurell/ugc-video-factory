/*
  Warnings:

  - Made the column `organization_id` on table `jobs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organization_id` on table `reference_photos` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "organization_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "reference_photos" ALTER COLUMN "organization_id" SET NOT NULL;
