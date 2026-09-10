-- Migration 032: Preset AutoCount Integration Columns and Table for Vehicles
-- Prepared for AutoCount Project / Vehicle / Asset sync program

SET @vehicles_tbl = (SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vehicles' LIMIT 1);
SET @cust_vehicles_tbl = (SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'customer_vehicle' LIMIT 1);

-- 1. Add autocount_project_no to vehicles table
SET @sql = IF(@vehicles_tbl IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vehicles' AND column_name = 'autocount_project_no'
), 'ALTER TABLE `vehicles` ADD COLUMN `autocount_project_no` VARCHAR(60) NULL AFTER `reg_no`', 'SELECT 1');
PREPARE s1 FROM @sql; EXECUTE s1; DEALLOCATE PREPARE s1;

-- 2. Add autocount_sync_at to vehicles table
SET @sql = IF(@vehicles_tbl IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vehicles' AND column_name = 'autocount_sync_at'
), 'ALTER TABLE `vehicles` ADD COLUMN `autocount_sync_at` DATETIME NULL AFTER `autocount_project_no`', 'SELECT 1');
PREPARE s2 FROM @sql; EXECUTE s2; DEALLOCATE PREPARE s2;

-- 3. Add autocount_project_no to customer_vehicle table if present
SET @sql = IF(@cust_vehicles_tbl IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customer_vehicle' AND column_name = 'autocount_project_no'
), 'ALTER TABLE `customer_vehicle` ADD COLUMN `autocount_project_no` VARCHAR(60) NULL AFTER `reg_no`', 'SELECT 1');
PREPARE s3 FROM @sql; EXECUTE s3; DEALLOCATE PREPARE s3;

-- 4. Add autocount_sync_at to customer_vehicle table if present
SET @sql = IF(@cust_vehicles_tbl IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customer_vehicle' AND column_name = 'autocount_sync_at'
), 'ALTER TABLE `customer_vehicle` ADD COLUMN `autocount_sync_at` DATETIME NULL AFTER `autocount_project_no`', 'SELECT 1');
PREPARE s4 FROM @sql; EXECUTE s4; DEALLOCATE PREPARE s4;

-- 5. AutoCount Project Master table (pre-created for read-only sync / mapping of AutoCount projects/vehicles)
CREATE TABLE IF NOT EXISTS `autocount_project` (
  `project_no` VARCHAR(60) NOT NULL,
  `description` VARCHAR(255) NULL,
  `debtor_code` VARCHAR(40) NULL,
  `is_active` CHAR(1) DEFAULT 'T',
  `last_sync_at` DATETIME NULL,
  PRIMARY KEY (`project_no`),
  KEY `idx_autocount_project_debtor` (`debtor_code`),
  KEY `idx_autocount_project_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'AutoCount vehicle preset migration 032 applied successfully.' AS migration_result;
