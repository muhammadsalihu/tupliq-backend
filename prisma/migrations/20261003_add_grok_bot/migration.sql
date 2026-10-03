-- Add Grok Bot support: bots table, instance_connections table, notifyToken
CREATE TABLE IF NOT EXISTS "bots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#4F46E5',
    "avatar" TEXT,
    "sessions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "groupSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bots_userId_handle_key" UNIQUE ("userId", "handle"),
    CONSTRAINT "bots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bots_userId_idx" ON "bots"("userId");

CREATE TABLE IF NOT EXISTS "instance_connections" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "toolkit" TEXT NOT NULL,
    "account" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instance_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "instance_connections_instanceId_toolkit_key" UNIQUE ("instanceId", "toolkit"),
    CONSTRAINT "instance_connections_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "user_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "user_instances" ADD COLUMN IF NOT EXISTS "notifyToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "user_instances_notifyToken_key" ON "user_instances"("notifyToken");
