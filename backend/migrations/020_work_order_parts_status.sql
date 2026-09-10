-- Add Admin-controlled parts tracking to work orders.
-- Non-destructive and safe to run more than once.

SET @job_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'job'
);

SET @add_parts_status = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_status'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_status` VARCHAR(32) NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_parts_status;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_parts_expected_date = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_expected_date'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_expected_date` DATE NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_parts_expected_date;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_parts_reference = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_reference'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_reference` VARCHAR(120) NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_parts_reference;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_parts_notes = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_notes'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_notes` TEXT NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_parts_notes;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_parts_status_updated_at = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_status_updated_at'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_status_updated_at` DATETIME NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_parts_status_updated_at;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_parts_status_updated_by = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_status_updated_by'
  ),
  'ALTER TABLE `job` ADD COLUMN `parts_status_updated_by` INT NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_parts_status_updated_by;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @migrate_legacy_parts_ready = IF(
  @job_exists = 1 AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'parts_ready_at'
  ),
  'UPDATE `job`
   SET `parts_status` = ''parts_ready'',
       `parts_status_updated_at` = COALESCE(`parts_status_updated_at`, `parts_ready_at`)
   WHERE (`parts_status` IS NULL OR `parts_status` = '''')
     AND `parts_ready_at` IS NOT NULL',
  'SELECT 1'
);
PREPARE statement FROM @migrate_legacy_parts_ready;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SELECT IF(@job_exists = 1, 'Work order parts tracking is ready.', 'job table not found.') AS migration_result;
