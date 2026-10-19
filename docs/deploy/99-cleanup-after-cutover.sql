BEGIN;

ALTER TABLE "device_tokens" DROP CONSTRAINT "device_tokens_userId_fkey";
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_userId_fkey";
ALTER TABLE "patrons" DROP CONSTRAINT "patrons_vipSetById_fkey";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_userId_fkey";
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_updatedById_fkey";
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_venueId_fkey";

DROP INDEX "patrons_venueId_isVip_idx";

ALTER TABLE "patrons"
  DROP COLUMN "isVip",
  DROP COLUMN "vipSetAt",
  DROP COLUMN "vipSetById";

ALTER TABLE "venues" DROP COLUMN "location";

DROP TABLE "device_tokens";
DROP TABLE "notification_preferences";
DROP TABLE "refresh_tokens";
DROP TABLE "rooms";

COMMIT;
