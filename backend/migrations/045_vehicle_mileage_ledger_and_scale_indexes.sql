-- 045_vehicle_mileage_ledger_and_scale_indexes.sql
-- Creates immutable vehicle mileage audit ledger and adds performance indexes for 1,000+ vehicle scale.

CREATE TABLE IF NOT EXISTS `vehicle_mileage_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vehicle_id` INT NOT NULL,
  `mileage` INT UNSIGNED NOT NULL,
  `delta` INT NULL DEFAULT 0,
  `source` VARCHAR(40) NOT NULL DEFAULT 'work_order_checkin',
  `reference_id` INT UNSIGNED NULL,
  `reference_no` VARCHAR(64) NULL,
  `recorded_by` INT NULL,
  `recorded_by_name` VARCHAR(100) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_vml_vehicle_created` (`vehicle_id`, `created_at` DESC),
  INDEX `idx_vml_mileage` (`mileage`),
  INDEX `idx_vml_source_ref` (`source`, `reference_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill initial mileage log from existing work orders where checkin_mileage > 0
INSERT INTO `vehicle_mileage_log` (`vehicle_id`, `mileage`, `source`, `reference_id`, `reference_no`, `notes`, `created_at`)
SELECT 
    j.vehicle_id,
    CAST(j.checkin_mileage AS UNSIGNED),
    'work_order_checkin',
    j.id,
    j.work_order_no,
    COALESCE(j.actual_issue, j.reported_problem, 'Workshop Service Check-in'),
    COALESCE(j.checkin_at, j.created_at, NOW())
FROM job j
WHERE j.vehicle_id > 0 AND j.checkin_mileage > 0
  AND NOT EXISTS (
    SELECT 1 FROM `vehicle_mileage_log` vml 
    WHERE vml.reference_id = j.id AND vml.source = 'work_order_checkin'
  )
ORDER BY j.vehicle_id ASC, COALESCE(j.checkin_at, j.created_at) ASC, j.id ASC;

-- Update delta for backfilled rows
UPDATE vehicle_mileage_log curr
LEFT JOIN (
    SELECT id, vehicle_id, mileage, created_at
    FROM vehicle_mileage_log
) prev ON prev.vehicle_id = curr.vehicle_id 
      AND prev.created_at < curr.created_at
      AND prev.id != curr.id
SET curr.delta = curr.mileage - COALESCE(prev.mileage, curr.mileage)
WHERE curr.delta = 0 OR curr.delta IS NULL;

-- Indexes for 1,000+ vehicle performance on customer_vehicle
SET @cv_tbl = 'customer_vehicle';

SET @idx_cv1 = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @cv_tbl AND index_name = 'idx_cv_company_id'),
  CONCAT('ALTER TABLE `', @cv_tbl, '` ADD INDEX `idx_cv_company_id` (`company_id`)'),
  'SELECT 1'
);
PREPARE stmt_cv1 FROM @idx_cv1; EXECUTE stmt_cv1; DEALLOCATE PREPARE stmt_cv1;

SET @idx_cv2 = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @cv_tbl AND index_name = 'idx_cv_reg_no'),
  CONCAT('ALTER TABLE `', @cv_tbl, '` ADD INDEX `idx_cv_reg_no` (`registration_no`)'),
  'SELECT 1'
);
PREPARE stmt_cv2 FROM @idx_cv2; EXECUTE stmt_cv2; DEALLOCATE PREPARE stmt_cv2;

SET @idx_cv3 = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @cv_tbl AND index_name = 'idx_cv_mileage'),
  CONCAT('ALTER TABLE `', @cv_tbl, '` ADD INDEX `idx_cv_mileage` (`mileage`)'),
  'SELECT 1'
);
PREPARE stmt_cv3 FROM @idx_cv3; EXECUTE stmt_cv3; DEALLOCATE PREPARE stmt_cv3;

SET @idx_cv4 = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @cv_tbl AND index_name = 'idx_cv_next_service'),
  CONCAT('ALTER TABLE `', @cv_tbl, '` ADD INDEX `idx_cv_next_service` (`next_service_mileage`, `next_service_date`)'),
  'SELECT 1'
);
PREPARE stmt_cv4 FROM @idx_cv4; EXECUTE stmt_cv4; DEALLOCATE PREPARE stmt_cv4;

-- Indexes for 1,000+ vehicle performance on job table
SET @job_tbl = 'job';

SET @idx_job1 = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @job_tbl AND index_name = 'idx_job_vehicle_mileage'),
  CONCAT('ALTER TABLE `', @job_tbl, '` ADD INDEX `idx_job_vehicle_mileage` (`vehicle_id`, `checkin_mileage`)'),
  'SELECT 1'
);
PREPARE stmt_job1 FROM @idx_job1; EXECUTE stmt_job1; DEALLOCATE PREPARE stmt_job1;

SET @idx_job2 = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @job_tbl AND index_name = 'idx_job_status_active'),
  CONCAT('ALTER TABLE `', @job_tbl, '` ADD INDEX `idx_job_status_active` (`status`, `collected_at`)'),
  'SELECT 1'
);
PREPARE stmt_job2 FROM @idx_job2; EXECUTE stmt_job2; DEALLOCATE PREPARE stmt_job2;
