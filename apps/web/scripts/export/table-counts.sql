SELECT json_build_object(
  'takenAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'tables', (
    SELECT json_object_agg(t.name, t.n ORDER BY t.name)
    FROM (
      SELECT
        table_name::text AS name,
        (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) t
  ),
  'metrics', json_build_object(
    'accounts_not_carried', (
      SELECT count(*) FROM accounts a
      WHERE NOT (
        a.provider = 'discord'
        AND a.id = (SELECT b.id FROM accounts b WHERE b."userId" = a."userId" AND b.provider = 'discord' ORDER BY b.id LIMIT 1)
      )
    ),
    'venue_schedules_not_ffxivvenues', (SELECT count(*) FROM venue_schedules WHERE source IS DISTINCT FROM 'ffxivvenues')
  )
);
