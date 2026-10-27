/**
 * Platform admin is decided by xvm-api now: `people.is_platform_admin`, which the dashboard reads as
 * the `platform_admin` scope on the person's credential. This script used to set the dashboard's own
 * `User.isAdmin`, which nothing reads any more, so it prints the SQL to run on xvm-api's database.
 * Usage: npx tsx scripts/make-admin.ts <discord_id>
 */

const discordId = process.argv[2]

if (!discordId || !/^\d{17,20}$/.test(discordId)) {
  console.error("Usage: npx tsx scripts/make-admin.ts <discord_id>")
  console.error("The Discord id is the numeric user id, 17 to 20 digits.")
  process.exit(1)
}

const person = `(SELECT person_id FROM person_accounts WHERE provider = 'discord' AND external_id = '${discordId}')`

console.log(`Nothing was changed. Platform admin lives in xvm-api now, not in the dashboard's database.

Run this against xvm-api's Postgres database:

  UPDATE people SET is_platform_admin = true WHERE id = ${person};
  UPDATE credentials SET revoked_at = now()
    WHERE client = 'dashboard' AND revoked_at IS NULL AND person_id = ${person}
      AND (expires_at IS NULL OR expires_at > now());

xvm-api fixes the scope when it mints a credential, so revoking their dashboard credential is what makes
the change apply on their next request instead of their next sign-in. To remove an admin, run the same
two statements with is_platform_admin = false.`)

process.exit(1)
