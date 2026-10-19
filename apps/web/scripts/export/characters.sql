SELECT json_build_object(
  'characters', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        c.id,
        c."userId",
        c."characterName",
        c.world,
        c."isPrimary",
        to_char(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM user_characters c
    ) t
  )
);
