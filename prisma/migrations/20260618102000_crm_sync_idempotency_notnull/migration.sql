/*
  Warnings:

  - Made the column `correlation_id` on table `sync_jobs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sync_job_id` on table `sync_log` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "sync_jobs" ALTER COLUMN "correlation_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sync_log" ALTER COLUMN "sync_job_id" SET NOT NULL;
