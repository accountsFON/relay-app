-- Revisions workspace redesign: the RevisionPlan dispatch feature is removed.
DROP TABLE IF EXISTS "revision_items";
DROP TABLE IF EXISTS "revision_plans";
DROP TYPE IF EXISTS "RevisionItemType";
DROP TYPE IF EXISTS "RevisionItemStatus";
