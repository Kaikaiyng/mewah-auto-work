-- Complete booking persistence for existing MAW databases.
-- Apply after taking a backup. This migration is non-destructive and idempotent.
-- It supports the legacy customer_appointment table and the newer bookings table.

SET @booking_table = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'customer_appointment'
    ) THEN 'customer_appointment'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'bookings'
    ) THEN 'bookings'
    ELSE NULL
  END
);

SET @add_booking_number = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('appointment_no', 'booking_number', 'booking_no')
  ),
  CONCAT(
    'ALTER TABLE `', @booking_table, '` ADD COLUMN `',
    IF(@booking_table = 'customer_appointment', 'appointment_no', 'booking_number'),
    '` VARCHAR(50) NULL'
  ),
  'SELECT 1'
);
PREPARE add_booking_number_statement FROM @add_booking_number;
EXECUTE add_booking_number_statement;
DEALLOCATE PREPARE add_booking_number_statement;

SET @add_customer_id = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('customer_id', 'user_id', 'driver_id')
  ),
  CONCAT(
    'ALTER TABLE `', @booking_table, '` ADD COLUMN `',
    IF(@booking_table = 'customer_appointment', 'customer_id', 'user_id'),
    '` INT NULL'
  ),
  'SELECT 1'
);
PREPARE add_customer_id_statement FROM @add_customer_id;
EXECUTE add_customer_id_statement;
DEALLOCATE PREPARE add_customer_id_statement;

SET @add_company_id = IF(
  @booking_table = 'customer_appointment'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name = 'company_id'
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `company_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_company_id_statement FROM @add_company_id;
EXECUTE add_company_id_statement;
DEALLOCATE PREPARE add_company_id_statement;

SET @add_vehicle_id = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name = 'vehicle_id'
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `vehicle_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_vehicle_id_statement FROM @add_vehicle_id;
EXECUTE add_vehicle_id_statement;
DEALLOCATE PREPARE add_vehicle_id_statement;

SET @add_vehicle_label = IF(
  @booking_table = 'customer_appointment'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('vehicle', 'vehicle_no', 'reg_no', 'plate_no')
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `vehicle` VARCHAR(100) NULL'),
  'SELECT 1'
);
PREPARE add_vehicle_label_statement FROM @add_vehicle_label;
EXECUTE add_vehicle_label_statement;
DEALLOCATE PREPARE add_vehicle_label_statement;

SET @add_service = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('service', 'service_type', 'services', 'title')
  ),
  CONCAT(
    'ALTER TABLE `', @booking_table, '` ADD COLUMN `',
    IF(@booking_table = 'customer_appointment', 'service', 'service_type'),
    '` VARCHAR(150) NULL'
  ),
  'SELECT 1'
);
PREPARE add_service_statement FROM @add_service;
EXECUTE add_service_statement;
DEALLOCATE PREPARE add_service_statement;

SET @add_appointment_at = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('appointment_at', 'appointment_date', 'service_date', 'date')
  ),
  CONCAT(
    'ALTER TABLE `', @booking_table, '` ADD COLUMN `',
    IF(@booking_table = 'customer_appointment', 'appointment_at', 'service_date'),
    '` DATETIME NULL'
  ),
  'SELECT 1'
);
PREPARE add_appointment_at_statement FROM @add_appointment_at;
EXECUTE add_appointment_at_statement;
DEALLOCATE PREPARE add_appointment_at_statement;

SET @add_location = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('location', 'service_centre', 'branch')
  ),
  CONCAT(
    'ALTER TABLE `', @booking_table, '` ADD COLUMN `',
    IF(@booking_table = 'customer_appointment', 'location', 'service_centre'),
    '` VARCHAR(255) NULL'
  ),
  'SELECT 1'
);
PREPARE add_location_statement FROM @add_location;
EXECUTE add_location_statement;
DEALLOCATE PREPARE add_location_statement;

SET @add_status = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name = 'status'
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT ''pending'''),
  'SELECT 1'
);
PREPARE add_status_statement FROM @add_status;
EXECUTE add_status_statement;
DEALLOCATE PREPARE add_status_statement;

SET @add_staff_id = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('staff_id', 'technician_id', 'assigned_staff_id')
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `staff_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_staff_id_statement FROM @add_staff_id;
EXECUTE add_staff_id_statement;
DEALLOCATE PREPARE add_staff_id_statement;

SET @add_technician = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('technician', 'staff_name')
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `technician` VARCHAR(150) NULL'),
  'SELECT 1'
);
PREPARE add_technician_statement FROM @add_technician;
EXECUTE add_technician_statement;
DEALLOCATE PREPARE add_technician_statement;

SET @add_customer_notes = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('notes', 'remark')
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `notes` TEXT NULL'),
  'SELECT 1'
);
PREPARE add_customer_notes_statement FROM @add_customer_notes;
EXECUTE add_customer_notes_statement;
DEALLOCATE PREPARE add_customer_notes_statement;

SET @add_reported_problem = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('reported_problem', 'complaint')
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `reported_problem` TEXT NULL'),
  'SELECT 1'
);
PREPARE add_reported_problem_statement FROM @add_reported_problem;
EXECUTE add_reported_problem_statement;
DEALLOCATE PREPARE add_reported_problem_statement;

SET @add_technician_notes = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name IN ('technician_notes', 'mechanic_notes')
  ),
  CONCAT(
    'ALTER TABLE `', @booking_table, '` ADD COLUMN `',
    IF(@booking_table = 'customer_appointment', 'technician_notes', 'mechanic_notes'),
    '` TEXT NULL'
  ),
  'SELECT 1'
);
PREPARE add_technician_notes_statement FROM @add_technician_notes;
EXECUTE add_technician_notes_statement;
DEALLOCATE PREPARE add_technician_notes_statement;

SELECT @booking_table AS migrated_booking_table;
