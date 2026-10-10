SELECT json_build_object(
  'roles', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        r.id,
        r."venueId",
        r.name,
        r.color,
        r.responsibilities,
        r."hourlyRate",
        (r.permissions::jsonb <> '{}'::jsonb) AS "hasPermissions",
        r."potPayoutMode",
        r."contractorSharesPot",
        to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM roles r
    ) t
  ),
  'memberships', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        m.id,
        m."userId",
        m."venueId",
        m.role,
        m."roleId",
        to_char(m."hireDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "hireDate",
        m.status,
        m.nickname,
        m."hourlyRate",
        m."tipPooled",
        m."temporaryRole",
        to_char(m."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        coalesce(
          (SELECT json_agg(a."roleId" ORDER BY a."createdAt", a.id) FROM membership_role_assignments a WHERE a."membershipId" = m.id),
          '[]'::json
        ) AS "additionalRoleIds"
      FROM memberships m
    ) t
  )
);
