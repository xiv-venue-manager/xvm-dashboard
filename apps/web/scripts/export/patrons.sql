SELECT json_build_object(
  'patrons', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        p.id,
        p."venueId",
        p."characterName",
        p.world,
        p."isBanned",
        p."banReason",
        to_char(p."bannedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "bannedAt",
        p."bannedById",
        to_char(p."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM patrons p
    ) t
  ),
  'logs', (
    SELECT coalesce(json_agg(t ORDER BY t.timestamp, t.id), '[]'::json)
    FROM (
      SELECT
        l.id,
        l."venueId",
        l."eventId",
        l."characterName",
        l.world,
        l.action,
        l."countChange",
        l."loggedBy",
        to_char(l.timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp",
        to_char(l."loggedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "loggedAt",
        l."wasWorking",
        l."workingUserId",
        to_char(l."reclassifiedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reclassifiedAt",
        l."reclassifiedById",
        l."reclassifyReason"
      FROM patron_logs l
    ) t
  )
);
