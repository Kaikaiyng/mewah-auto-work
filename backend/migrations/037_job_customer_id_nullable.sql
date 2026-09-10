-- Migration 037: Make job.customer_id nullable
-- Walk-in and workshop intake work orders are created for fleet vehicles directly and may not have an individual customer contact account.

SET @column_exists = EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'customer_id'
);

SET @alter_sql = IF(
  @column_exists = 1,
  'ALTER TABLE `job` MODIFY COLUMN `customer_id` INT NULL DEFAULT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
