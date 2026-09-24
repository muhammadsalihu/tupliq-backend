-- CreateEnum (if not exists)

-- CreateTable
CREATE TABLE "user_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "instanceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "template" TEXT NOT NULL DEFAULT 'agent37-hermes',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_instances_userId_key" ON "user_instances"("userId");
CREATE UNIQUE INDEX "user_instances_instanceId_key" ON "user_instances"("instanceId");
CREATE INDEX "user_instances_userId_idx" ON "user_instances"("userId");

-- AddForeignKey
ALTER TABLE "user_instances" ADD CONSTRAINT "user_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
