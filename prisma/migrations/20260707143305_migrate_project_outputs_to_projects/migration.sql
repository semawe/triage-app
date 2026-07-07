-- Convertit les outputs de réunion de type « project » (texte libre) en
-- entités Project rattachées à l'espace de leur réunion d'origine.
-- Les outputs restent en place (visibles dans les comptes-rendus) ; id
-- déterministe ('migr_' + id de l'output) pour rendre l'opération idempotente.
INSERT INTO "Project" (id, "spaceId", name, description, status, "createdAt", "updatedAt")
SELECT
  'migr_' || o.id,
  m."spaceId",
  CASE
    WHEN length(trim(o.content)) > 120 THEN left(trim(o.content), 117) || '…'
    ELSE trim(o.content)
  END,
  CASE
    WHEN length(trim(o.content)) > 120 THEN trim(o.content)
    ELSE NULL
  END,
  CASE WHEN o."isDone" THEN 'done'::"ProjectStatus" ELSE 'active'::"ProjectStatus" END,
  o."createdAt",
  now()
FROM "Output" o
JOIN "AgendaItem" ai ON ai.id = o."itemId"
JOIN "Meeting" m ON m.id = ai."meetingId"
WHERE o.type = 'project'
  AND trim(o.content) <> ''
ON CONFLICT (id) DO NOTHING;
