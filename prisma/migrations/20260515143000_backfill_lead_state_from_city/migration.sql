WITH state_map(alias, abbr) AS (
  VALUES
    ('al', 'AL'),
    ('alabama', 'AL'),
    ('ak', 'AK'),
    ('alaska', 'AK'),
    ('az', 'AZ'),
    ('arizona', 'AZ'),
    ('ar', 'AR'),
    ('arkansas', 'AR'),
    ('ca', 'CA'),
    ('california', 'CA'),
    ('co', 'CO'),
    ('colorado', 'CO'),
    ('ct', 'CT'),
    ('connecticut', 'CT'),
    ('de', 'DE'),
    ('delaware', 'DE'),
    ('fl', 'FL'),
    ('florida', 'FL'),
    ('ga', 'GA'),
    ('georgia', 'GA'),
    ('hi', 'HI'),
    ('hawaii', 'HI'),
    ('id', 'ID'),
    ('idaho', 'ID'),
    ('il', 'IL'),
    ('illinois', 'IL'),
    ('in', 'IN'),
    ('indiana', 'IN'),
    ('ia', 'IA'),
    ('iowa', 'IA'),
    ('ks', 'KS'),
    ('kansas', 'KS'),
    ('ky', 'KY'),
    ('kentucky', 'KY'),
    ('la', 'LA'),
    ('louisiana', 'LA'),
    ('me', 'ME'),
    ('maine', 'ME'),
    ('md', 'MD'),
    ('maryland', 'MD'),
    ('ma', 'MA'),
    ('massachusetts', 'MA'),
    ('mi', 'MI'),
    ('michigan', 'MI'),
    ('mn', 'MN'),
    ('minnesota', 'MN'),
    ('ms', 'MS'),
    ('mississippi', 'MS'),
    ('mo', 'MO'),
    ('missouri', 'MO'),
    ('mt', 'MT'),
    ('montana', 'MT'),
    ('ne', 'NE'),
    ('nebraska', 'NE'),
    ('nv', 'NV'),
    ('nevada', 'NV'),
    ('nh', 'NH'),
    ('new hampshire', 'NH'),
    ('nj', 'NJ'),
    ('new jersey', 'NJ'),
    ('nm', 'NM'),
    ('new mexico', 'NM'),
    ('ny', 'NY'),
    ('new york', 'NY'),
    ('nc', 'NC'),
    ('north carolina', 'NC'),
    ('nd', 'ND'),
    ('north dakota', 'ND'),
    ('oh', 'OH'),
    ('ohio', 'OH'),
    ('ok', 'OK'),
    ('oklahoma', 'OK'),
    ('or', 'OR'),
    ('oregon', 'OR'),
    ('pa', 'PA'),
    ('pennsylvania', 'PA'),
    ('ri', 'RI'),
    ('rhode island', 'RI'),
    ('sc', 'SC'),
    ('south carolina', 'SC'),
    ('sd', 'SD'),
    ('south dakota', 'SD'),
    ('tn', 'TN'),
    ('tennessee', 'TN'),
    ('tx', 'TX'),
    ('texas', 'TX'),
    ('ut', 'UT'),
    ('utah', 'UT'),
    ('vt', 'VT'),
    ('vermont', 'VT'),
    ('va', 'VA'),
    ('virginia', 'VA'),
    ('wa', 'WA'),
    ('washington', 'WA'),
    ('wv', 'WV'),
    ('west virginia', 'WV'),
    ('wi', 'WI'),
    ('wisconsin', 'WI'),
    ('wy', 'WY'),
    ('wyoming', 'WY'),
    ('dc', 'DC'),
    ('district of columbia', 'DC')
),
comma_matches AS (
  SELECT
    l.id,
    NULLIF(trim(match_parts[1]), '') AS city,
    sm.abbr AS state,
    ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY length(sm.alias) DESC) AS rn
  FROM "Lead" l
  CROSS JOIN LATERAL regexp_match(trim(l.city), '^(.*?),\s*([A-Za-z .]+)$') AS match_parts
  JOIN state_map sm
    ON lower(regexp_replace(trim(match_parts[2]), '\.', '', 'g')) = sm.alias
  WHERE l.state IS NULL
    AND l.city IS NOT NULL
),
suffix_matches AS (
  SELECT
    l.id,
    NULLIF(
      trim(
        regexp_replace(
          trim(l.city),
          '\s+' || replace(sm.alias, ' ', '\s+') || '$',
          '',
          'i'
        )
      ),
      ''
    ) AS city,
    sm.abbr AS state,
    ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY length(sm.alias) DESC) AS rn
  FROM "Lead" l
  JOIN state_map sm
    ON lower(regexp_replace(trim(l.city), '\.', '', 'g')) ~ ('\s' || replace(sm.alias, ' ', '\s+') || '$')
  WHERE l.state IS NULL
    AND l.city IS NOT NULL
    AND trim(l.city) !~ ','
),
backfill AS (
  SELECT id, city, state
  FROM comma_matches
  WHERE rn = 1

  UNION ALL

  SELECT id, city, state
  FROM suffix_matches
  WHERE rn = 1
)
UPDATE "Lead" l
SET
  city = backfill.city,
  state = backfill.state
FROM backfill
WHERE l.id = backfill.id
  AND backfill.city IS NOT NULL
  AND backfill.state IS NOT NULL;
