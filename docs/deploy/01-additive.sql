BEGIN;

ALTER TABLE "services" ADD COLUMN "xvmApiServiceId" INTEGER;

ALTER TABLE "venues"
  ADD COLUMN "xvmApiVenueId" TEXT,
  ADD COLUMN "xvmApiVenueLinkedAt" TIMESTAMP(3),
  ADD COLUMN "xvmApiVenueLinkedBy" TEXT;

CREATE TABLE "xvm_api_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "credentialId" INTEGER NOT NULL,
    "personId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xvm_api_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xvm_api_credentials_userId_key" ON "xvm_api_credentials"("userId");

CREATE UNIQUE INDEX "venues_xvmApiVenueId_key" ON "venues"("xvmApiVenueId");

ALTER TABLE "xvm_api_credentials" ADD CONSTRAINT "xvm_api_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
