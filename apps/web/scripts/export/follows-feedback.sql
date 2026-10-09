SELECT json_build_object(
  'follows', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        f.id,
        f."userId",
        f."venueId",
        f."visibleToOperators",
        to_char(f."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM venue_follows f
    ) t
  ),
  'feedback', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        b.id,
        b."userId",
        b.category,
        b.status,
        b.subject,
        b.description,
        b.url,
        b."userAgent",
        b.screenshot,
        b."adminNotes",
        b."reviewedBy",
        to_char(b."reviewedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reviewedAt",
        to_char(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(b."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM feedback b
    ) t
  )
);
