/*
  Warnings:

  - Made the column `organization_id` on table `refresh_tokens` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "organization_id" SET NOT NULL;
