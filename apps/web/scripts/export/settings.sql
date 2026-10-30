SELECT json_build_object(
  'venues', (
    SELECT coalesce(json_agg(t ORDER BY t.id), '[]'::json)
    FROM (SELECT v.id FROM venues v) t
  ),
  'pot', (
    SELECT coalesce(json_agg(t ORDER BY t."venueId"), '[]'::json)
    FROM (
      SELECT
        p."venueId",
        p.enabled,
        p."taxPercent",
        p."includeSalesInPot",
        p."defaultTipPooled",
        to_char(p."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM venue_pot_settings p
    ) t
  ),
  'inventory', (
    SELECT coalesce(json_agg(t ORDER BY t."venueId"), '[]'::json)
    FROM (
      SELECT i."venueId", i.enabled
      FROM venue_inventory_settings i
    ) t
  )
);
