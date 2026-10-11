SELECT json_build_object(
  'venues', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        v.id,
        v.name,
        v.slug,
        v.description,
        v."logoUrl",
        v."bannerUrl",
        v."galleryImages",
        v."dataCenter",
        v.world,
        v.district,
        v.ward,
        v.plot,
        v.apartment,
        v."currencyName",
        v.settings,
        v."venueType",
        v."partakeTeamId",
        v."ffxivVenueId",
        to_char(v."ffxivVenueLinkedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "ffxivVenueLinkedAt",
        v."ffxivVenueLinkedBy",
        v."froggeVenueId",
        v."discordServerId",
        v."isActive",
        to_char(v."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(v."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
        (SELECT count(*) FROM memberships m WHERE m."venueId" = v.id AND m.status = 'active' AND m.role = 'OWNER')::int AS "ownerCount",
        (
          EXISTS (SELECT 1 FROM events x WHERE x."venueId" = v.id)
          OR EXISTS (SELECT 1 FROM shifts x WHERE x."venueId" = v.id)
          OR EXISTS (SELECT 1 FROM transactions x WHERE x."venueId" = v.id)
          OR EXISTS (SELECT 1 FROM memberships x WHERE x."venueId" = v.id AND x.status = 'active')
        ) AS "hasContent"
      FROM venues v
    ) t
  )
);
