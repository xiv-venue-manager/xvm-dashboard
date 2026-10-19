SELECT json_build_object(
  'events', (
    SELECT coalesce(json_agg(t ORDER BY t."startTime", t.id), '[]'::json)
    FROM (
      SELECT
        e.id,
        e."venueId",
        e.title,
        e.description,
        e.location,
        e."eventType",
        e.status,
        to_char(e."startTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startTime",
        to_char(e."endTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endTime",
        e.timezone,
        e."recurrenceRule",
        e."parentEventId",
        e."partakeEventId",
        e."discordMessageId",
        e."discordWebhookGroup",
        to_char(e."discordCancelledAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "discordCancelledAt",
        to_char(e."discordReminderSentAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "discordReminderSentAt",
        e."attendanceCount",
        e.revenue,
        e."createdById",
        to_char(e."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(e."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM events e
    ) t
  )
);
