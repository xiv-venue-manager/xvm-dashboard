SELECT COALESCE(json_agg(t), '[]'::json)
FROM (
  SELECT a."providerAccountId" AS discord_id,
         u.name AS display_name,
         s.label,
         s.fields,
         s."templateId" AS template_id,
         s."separatorId" AS separator_id,
         s."decorId" AS decor_id
  FROM shout_templates s
  JOIN users u ON u.id = s."userId"
  LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'
  ORDER BY s."userId", s."createdAt", s.id
) t;
