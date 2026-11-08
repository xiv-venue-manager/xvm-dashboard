BEGIN;

DO $$
DECLARE
  changed integer;
  settled integer;
BEGIN
  CREATE TEMP TABLE wanted (guild text, slug text) ON COMMIT DROP;
  INSERT INTO wanted VALUES
    ('680468209501077553', 'vora-moon-club'),
    ('1548865036699832371', 'alternate-azeroth'),
    ('1102333870013157536', 'its-always-bees'),
    ('992483766306078840', 'frogge-resource-operations');

  UPDATE venues v SET slug = w.slug
  FROM venue_external_links l, wanted w
  WHERE l.venue_id = v.id AND l.provider = 'DiscordGuild' AND l.external_id = w.guild
    AND l.unlinked_at IS NULL AND v.slug <> w.slug;
  GET DIAGNOSTICS changed = ROW_COUNT;

  SELECT count(*) INTO settled
  FROM venues v JOIN venue_external_links l ON l.venue_id = v.id AND l.provider = 'DiscordGuild' AND l.unlinked_at IS NULL
  JOIN wanted w ON w.guild = l.external_id AND w.slug = v.slug;

  IF settled <> 4 THEN
    RAISE EXCEPTION 'expected 4 venues with their agreed slug, found %', settled;
  END IF;
  RAISE NOTICE 'venue slugs changed: %, all 4 in place', changed;
END $$;

COMMIT;
