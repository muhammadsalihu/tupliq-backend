-- Tupliq Agent: agent workflows, quota, billing, password reset.

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('Running', 'Succeeded', 'Failed');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('Free', 'Pro');

-- AlterTable: Tupliq Agent profile fields on users
ALTER TABLE "users" ADD COLUMN     "role" TEXT,
ADD COLUMN     "aiPreference" TEXT NOT NULL DEFAULT 'auto';

-- CreateTable
CREATE TABLE "plan_limits" (
    "tier" "PlanTier" NOT NULL,
    "monthlyRunLimit" INTEGER NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("tier")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "customWorkflowId" TEXT,
    "title" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "steps" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'Running',
    "durationMs" INTEGER,
    "consumesQuota" BOOLEAN NOT NULL DEFAULT true,
    "billingPeriod" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_workflows" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "inputFields" JSONB NOT NULL,
    "instructions" TEXT NOT NULL,
    "aiPreference" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_outputs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "entitlement" TEXT NOT NULL DEFAULT 'tupliq_pro',
    "productId" TEXT,
    "store" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "willRenew" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastEvent" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "workflow_runs_userId_createdAt_idx" ON "workflow_runs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "workflow_runs_userId_billingPeriod_consumesQuota_idx" ON "workflow_runs"("userId", "billingPeriod", "consumesQuota");

-- CreateIndex
CREATE INDEX "custom_workflows_userId_updatedAt_idx" ON "custom_workflows"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "saved_outputs_userId_createdAt_idx" ON "saved_outputs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_entitlement_key" ON "subscriptions"("userId", "entitlement");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_customWorkflowId_fkey" FOREIGN KEY ("customWorkflowId") REFERENCES "custom_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_outputs" ADD CONSTRAINT "saved_outputs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_outputs" ADD CONSTRAINT "saved_outputs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed configurable plan limits (editable at runtime; env vars are fallbacks)
INSERT INTO "plan_limits" ("tier", "monthlyRunLimit") VALUES ('Free', 10), ('Pro', 200)
ON CONFLICT ("tier") DO NOTHING;
