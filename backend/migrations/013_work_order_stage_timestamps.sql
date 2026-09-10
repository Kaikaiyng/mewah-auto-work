-- Preserve the exact time when Parts Ready and Under Repair begin.
-- Non-destructive and safe to run more than once.

SET @job_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'job'
);

SET @add_parts_ready_at = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_ready_at'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_ready_at` DATETIME NULL',
  'SELECT 1'
);
PREPARE add_parts_ready_at_statement FROM @add_parts_ready_at;
EXECUTE add_parts_ready_at_statement;
DEALLOCATE PREPARE add_parts_ready_at_statement;

SET @add_under_repair_at = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'under_repair_at'
  ),
  'ALTER TABLE `job` ADD COLUMN `under_repair_at` DATETIME NULL',
  'SELECT 1'
);
PREPARE add_under_repair_at_statement FROM @add_under_repair_at;
EXECUTE add_under_repair_at_statement;
DEALLOCATE PREPARE add_under_repair_at_statement;

SELECT IF(@job_exists = 1, 'Work order stage timestamps are ready.', 'job table not found.') AS migration_result;
