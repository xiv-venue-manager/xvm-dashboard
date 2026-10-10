BEGIN;

DROP TABLE "xvm_api_credentials";

DROP INDEX "venues_xvmApiVenueId_key";

ALTER TABLE "venues"
  DROP COLUMN "xvmApiVenueId",
  DROP COLUMN "xvmApiVenueLinkedAt",
  DROP COLUMN "xvmApiVenueLinkedBy";

ALTER TABLE "services" DROP COLUMN "xvmApiServiceId";

COMMIT;
