-- Link confirmed bookings to work orders and preserve the customer booking snapshot.
-- Non-destructive and safe to run more than once.

SET @job_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'job'
);

SET @add_work_order_no = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'work_order_no'
  ),
  'ALTER TABLE `job` ADD COLUMN `work_order_no` VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE add_work_order_no_statement FROM @add_work_order_no;
EXECUTE add_work_order_no_statement;
DEALLOCATE PREPARE add_work_order_no_statement;

SET @add_source_booking_id = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'source_booking_id'
  ),
  'ALTER TABLE `job` ADD COLUMN `source_booking_id` BIGINT NULL',
  'SELECT 1'
);
PREPARE add_source_booking_id_statement FROM @add_source_booking_id;
EXECUTE add_source_booking_id_statement;
DEALLOCATE PREPARE add_source_booking_id_statement;

SET @add_priority = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'priority'
  ),
  'ALTER TABLE `job` ADD COLUMN `priority` VARCHAR(20) NOT NULL DEFAULT ''Normal''',
  'SELECT 1'
);
PREPARE add_priority_statement FROM @add_priority;
EXECUTE add_priority_statement;
DEALLOCATE PREPARE add_priority_statement;

SET @add_bay = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'bay'
  ),
  'ALTER TABLE `job` ADD COLUMN `bay` VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE add_bay_statement FROM @add_bay;
EXECUTE add_bay_statement;
DEALLOCATE PREPARE add_bay_statement;

SET @add_created_by = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'created_by'
  ),
  'ALTER TABLE `job` ADD COLUMN `created_by` INT NULL',
  'SELECT 1'
);
PREPARE add_created_by_statement FROM @add_created_by;
EXECUTE add_created_by_statement;
DEALLOCATE PREPARE add_created_by_statement;

SET @add_service_type = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'service_type'
  ),
  'ALTER TABLE `job` ADD COLUMN `service_type` VARCHAR(150) NULL',
  'SELECT 1'
);
PREPARE add_service_type_statement FROM @add_service_type;
EXECUTE add_service_type_statement;
DEALLOCATE PREPARE add_service_type_statement;

SET @add_service_centre = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'service_centre'
  ),
  'ALTER TABLE `job` ADD COLUMN `service_centre` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE add_service_centre_statement FROM @add_service_centre;
EXECUTE add_service_centre_statement;
DEALLOCATE PREPARE add_service_centre_statement;

SET @add_reported_problem = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'reported_problem'
  ),
  'ALTER TABLE `job` ADD COLUMN `reported_problem` TEXT NULL',
  'SELECT 1'
);
PREPARE add_reported_problem_statement FROM @add_reported_problem;
EXECUTE add_reported_problem_statement;
DEALLOCATE PREPARE add_reported_problem_statement;

SET @add_customer_notes = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'customer_notes'
  ),
  'ALTER TABLE `job` ADD COLUMN `customer_notes` TEXT NULL',
  'SELECT 1'
);
PREPARE add_customer_notes_statement FROM @add_customer_notes;
EXECUTE add_customer_notes_statement;
DEALLOCATE PREPARE add_customer_notes_statement;

SET @add_source_booking_index = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'job'
      AND column_name = 'source_booking_id'
  ),
  'CREATE UNIQUE INDEX `uq_job_source_booking_id` ON `job` (`source_booking_id`)',
  'SELECT 1'
);
PREPARE add_source_booking_index_statement FROM @add_source_booking_index;
EXECUTE add_source_booking_index_statement;
DEALLOCATE PREPARE add_source_booking_index_statement;

SELECT IF(@job_exists = 1, 'job', NULL) AS migrated_work_order_table;
