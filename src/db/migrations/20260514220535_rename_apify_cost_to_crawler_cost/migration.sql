-- RenameColumn (NOT drop+create — preserves historical Decimal cost values)
ALTER TABLE "content_runs" RENAME COLUMN "apifyCostUsd" TO "crawlerCostUsd";
