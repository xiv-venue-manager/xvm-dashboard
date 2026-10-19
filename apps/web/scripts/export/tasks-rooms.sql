SELECT json_build_object(
  'tasks', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        k.id,
        k."venueId",
        k."assignedTo",
        k."assignedRoleId",
        k.title,
        k.description,
        k.status,
        k.priority,
        k.category,
        to_char(k."dueDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "dueDate",
        to_char(k."completedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "completedAt",
        k."completedBy",
        to_char(k."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(k."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM tasks k
    ) t
  ),
  'rooms', (
    SELECT coalesce(json_agg(t ORDER BY t."updatedAt", t.id), '[]'::json)
    FROM (
      SELECT
        r.id,
        r."venueId",
        r.name,
        r."isOccupied",
        r.note,
        to_char(r."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
        r."updatedById",
        r.disabled,
        r."froggeRoomId"::text AS "froggeRoomId",
        r."imageUrl",
        r.locked,
        r."ownerDiscordId",
        r."roomNumber"
      FROM rooms r
    ) t
  )
);
