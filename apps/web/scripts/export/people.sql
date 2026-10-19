SELECT json_build_object(
  'users', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        u.id,
        u.name,
        u."displayName",
        u."discordId",
        (SELECT a."providerAccountId" FROM accounts a WHERE a."userId" = u.id AND a.provider = 'discord' ORDER BY a.id LIMIT 1) AS "discordAccountId",
        u.email,
        u."isAdmin",
        to_char(u."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        (
          EXISTS (SELECT 1 FROM memberships x WHERE x."userId" = u.id)
          OR EXISTS (SELECT 1 FROM user_characters x WHERE x."userId" = u.id)
          OR EXISTS (SELECT 1 FROM events x WHERE x."createdById" = u.id)
          OR EXISTS (SELECT 1 FROM event_templates x WHERE x."createdById" = u.id)
          OR EXISTS (SELECT 1 FROM feedback x WHERE x."userId" = u.id OR x."reviewedBy" = u.id)
          OR EXISTS (SELECT 1 FROM patron_logs x WHERE x."loggedBy" = u.id OR x."workingUserId" = u.id OR x."reclassifiedById" = u.id)
          OR EXISTS (SELECT 1 FROM patrons x WHERE x."bannedById" = u.id)
          OR EXISTS (SELECT 1 FROM payroll_entries x WHERE x."paidBy" = u.id)
          OR EXISTS (SELECT 1 FROM pot_distributions x WHERE x."generatedById" = u.id)
          OR EXISTS (SELECT 1 FROM shift_audit_logs x WHERE x."actorUserId" = u.id)
          OR EXISTS (SELECT 1 FROM shout_templates x WHERE x."userId" = u.id)
          OR EXISTS (SELECT 1 FROM tasks x WHERE x."assignedTo" = u.id OR x."completedBy" = u.id)
          OR EXISTS (SELECT 1 FROM transactions x WHERE x."staffId" = u.id)
          OR EXISTS (SELECT 1 FROM venue_follows x WHERE x."userId" = u.id)
          OR EXISTS (SELECT 1 FROM announcements x WHERE x."createdBy" = u.id)
        ) AS "hasReferences"
      FROM users u
    ) t
  ),
  'payees', (
    SELECT coalesce(json_agg(n ORDER BY n), '[]'::json)
    FROM (
      SELECT DISTINCT trim("manualEntryName") AS n
      FROM payroll_entries
      WHERE "isManualEntry" AND trim(coalesce("manualEntryName", '')) <> ''
    ) p
  )
);
