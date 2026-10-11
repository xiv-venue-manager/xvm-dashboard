SELECT json_build_object(
  'services', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        s.id,
        s."venueId",
        s.name,
        s.description,
        s.price,
        s.category,
        s."isActive",
        s."linkedItemId",
        s."linkedItemName",
        s."linkedItemIcon",
        s."stockCount",
        to_char(s."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        coalesce(
          (SELECT json_agg(g."A" ORDER BY g."A") FROM "_RoleToService" g WHERE g."B" = s.id),
          '[]'::json
        ) AS "roleIds"
      FROM services s
    ) t
  )
);
