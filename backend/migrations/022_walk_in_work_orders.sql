-- Add structured walk-in intake details directly to work orders.
-- Walk-ins create a checked-in job and never create a booking record.

SET @add_intake_type = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'intake_type'),
  'ALTER TABLE `job` ADD COLUMN `intake_type` VARCHAR(20) NOT NULL DEFAULT ''booking''',
  'SELECT 1'
);
PREPARE statement FROM @add_intake_type; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_request_channel = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'request_channel'),
  'ALTER TABLE `job` ADD COLUMN `request_channel` VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_request_channel; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_requested_by = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'requested_by_company_user_id'),
  'ALTER TABLE `job` ADD COLUMN `requested_by_company_user_id` INT NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_requested_by; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_brought_by = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'brought_by_driver_id'),
  'ALTER TABLE `job` ADD COLUMN `brought_by_driver_id` INT NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_brought_by; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_foreman = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'foreman_id'),
  'ALTER TABLE `job` ADD COLUMN `foreman_id` INT NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_foreman; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_checkin_mileage = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'checkin_mileage'),
  'ALTER TABLE `job` ADD COLUMN `checkin_mileage` INT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_checkin_mileage; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_walkin_driver_index = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'job' AND index_name = 'idx_job_brought_by_driver'),
  'ALTER TABLE `job` ADD INDEX `idx_job_brought_by_driver` (`brought_by_driver_id`)',
  'SELECT 1'
);
PREPARE statement FROM @add_walkin_driver_index; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_walkin_foreman_index = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'job' AND index_name = 'idx_job_foreman'),
  'ALTER TABLE `job` ADD INDEX `idx_job_foreman` (`foreman_id`)',
  'SELECT 1'
);
PREPARE statement FROM @add_walkin_foreman_index; EXECUTE statement; DEALLOCATE PREPARE statement;

UPDATE `job`
SET `intake_type` = CASE WHEN `source_booking_id` IS NULL THEN 'manual' ELSE 'booking' END;

SELECT 'Walk-in work-order fields are ready.' AS migration_result;
