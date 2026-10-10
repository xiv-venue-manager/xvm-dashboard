SELECT json_build_object(
  'entries', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        e.id,
        e."venueId",
        e.day,
        e."startHour",
        e."startMin",
        e."endHour",
        e."endMin",
        e."crossesMidnight",
        e.interval,
        e."weekOfMonth",
        to_char(e.commencing, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS commencing,
        e.label,
        to_char(e."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM venue_schedule_entries e
    ) t
  ),
  'syncedVenues', (
    SELECT coalesce(json_agg(s."venueId" ORDER BY s."venueId"), '[]'::json)
    FROM venue_schedules s
    WHERE s.source = 'ffxivvenues'
  )
);
