-- Promo codes for Pro access (manual grants, beta users, hackathon winners)
-- Identifiers are quoted camelCase to match the Prisma models verbatim.
CREATE TABLE IF NOT EXISTS promo_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
  "redeemedCount"  INTEGER NOT NULL DEFAULT 0,
  "durationDays"   INTEGER NOT NULL DEFAULT 30,
  active     BOOLEAN NOT NULL DEFAULT true,
  "expiresAt"  TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "codeId"      UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  "userId"      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "redeemedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("codeId", "userId")
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions("userId");
