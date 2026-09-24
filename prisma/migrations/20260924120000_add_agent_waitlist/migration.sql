-- Interest list for the Agent Android app (closed testing), captured from tupliq.com/agent.
-- Standalone table: references nothing in Supabase-managed schemas (auth.users/profiles).
CREATE TABLE IF NOT EXISTS "agent_waitlist_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "goal" TEXT,
    "source" TEXT NOT NULL DEFAULT 'agent-page',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_waitlist_entries_email_key"
    ON "agent_waitlist_entries"("email");

CREATE INDEX IF NOT EXISTS "agent_waitlist_entries_createdAt_idx"
    ON "agent_waitlist_entries"("createdAt");
