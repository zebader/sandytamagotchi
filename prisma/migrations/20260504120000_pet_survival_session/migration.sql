-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "isSurrendered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSessionEndAt" TIMESTAMP(3),
ADD COLUMN     "lastSessionEndStats" JSONB;

-- Backfill session anchor so existing pets do not instantly fail neglect on first deploy.
UPDATE "Pet"
SET
  "lastSessionEndAt" = "updatedAt",
  "lastSessionEndStats" = jsonb_build_object(
    'hunger', "hunger",
    'hygiene', "hygiene",
    'fun', "fun",
    'rest', "rest",
    'isSleeping', "isSleeping"
  )
WHERE "lastSessionEndAt" IS NULL;
