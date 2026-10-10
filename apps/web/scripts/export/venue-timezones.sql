SELECT json_build_object(
  'venues', (
    SELECT coalesce(json_agg(t ORDER BY t.name, t.id), '[]'::json)
    FROM (
      SELECT
        v.id,
        v.name,
        v.slug,
        v."dataCenter",
        v.world,
        v."isActive",
        coalesce(
          (SELECT json_agg(json_build_object('timezone', z.timezone, 'count', z.n) ORDER BY z.n DESC, z.timezone)
           FROM (SELECT e.timezone, count(*) AS n FROM events e WHERE e."venueId" = v.id GROUP BY e.timezone) z),
          '[]'::json
        ) AS timezones
      FROM venues v
    ) t
  )
);
