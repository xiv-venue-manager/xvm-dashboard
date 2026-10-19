SELECT json_build_object(
  'shifts', (
    SELECT coalesce(json_agg(t ORDER BY t."scheduledStart", t.id), '[]'::json)
    FROM (
      SELECT
        s.id,
        s."venueId",
        s."membershipId",
        s."roleId",
        s."eventId",
        s."payrollEntryId",
        to_char(s."scheduledStart", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "scheduledStart",
        to_char(s."scheduledEnd", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "scheduledEnd",
        to_char(s."actualStart", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "actualStart",
        to_char(s."actualEnd", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "actualEnd",
        s.status,
        s.notes,
        s."recurrenceRule",
        s."parentShiftId",
        s."slotGroupId",
        to_char(s.reminded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "remindedAt",
        to_char(s."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(s."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM shifts s
    ) t
  ),
  'audits', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        a.id,
        a."shiftId",
        a.action,
        a."actorUserId",
        a.source,
        to_char(a."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM shift_audit_logs a
    ) t
  )
);
