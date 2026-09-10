-- Complete vehicle profile persistence for existing MAW databases.
-- Apply to staging first after taking a backup, then verify Add/Edit Vehicle.
-- This migration is non-destructive and supports either customer_vehicle or vehicles.

SET @vehicle_table = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'customer_vehicle'
    ) THEN 'customer_vehicle'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'vehicles'
    ) THEN 'vehicles'
    ELSE NULL
  END
);

SET @add_contact_id = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('customer_id', 'user_id', 'owner_id')
  ),
  CONCAT(
    'ALTER TABLE `', @vehicle_table, '` ADD COLUMN `',
    IF(@vehicle_table = 'customer_vehicle', 'customer_id', 'user_id'),
    '` INT NULL'
  ),
  'SELECT 1'
);
PREPARE add_contact_id_statement FROM @add_contact_id;
EXECUTE add_contact_id_statement;
DEALLOCATE PREPARE add_contact_id_statement;

SET @add_reg_no = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('reg_no', 'registration_no', 'plate_no')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `reg_no` VARCHAR(50) NULL'),
  'SELECT 1'
);
PREPARE add_reg_no_statement FROM @add_reg_no;
EXECUTE add_reg_no_statement;
DEALLOCATE PREPARE add_reg_no_statement;

SET @add_equipment = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('equipment', 'vehicle_type', 'type')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `equipment` VARCHAR(100) NULL'),
  'SELECT 1'
);
PREPARE add_equipment_statement FROM @add_equipment;
EXECUTE add_equipment_statement;
DEALLOCATE PREPARE add_equipment_statement;

SET @add_brand = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('brand', 'make')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `brand` VARCHAR(100) NULL'),
  'SELECT 1'
);
PREPARE add_brand_statement FROM @add_brand;
EXECUTE add_brand_statement;
DEALLOCATE PREPARE add_brand_statement;

SET @add_model = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'model'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `model` VARCHAR(100) NULL'),
  'SELECT 1'
);
PREPARE add_model_statement FROM @add_model;
EXECUTE add_model_statement;
DEALLOCATE PREPARE add_model_statement;

SET @add_year = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'year'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `year` SMALLINT UNSIGNED NULL'),
  'SELECT 1'
);
PREPARE add_year_statement FROM @add_year;
EXECUTE add_year_statement;
DEALLOCATE PREPARE add_year_statement;

SET @add_mileage = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name IN ('mileage', 'current_mileage')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `mileage` INT UNSIGNED NOT NULL DEFAULT 0'),
  'SELECT 1'
);
PREPARE add_mileage_statement FROM @add_mileage;
EXECUTE add_mileage_statement;
DEALLOCATE PREPARE add_mileage_statement;

SET @add_last_service_date = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'last_service_date'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `last_service_date` DATE NULL'),
  'SELECT 1'
);
PREPARE add_last_service_date_statement FROM @add_last_service_date;
EXECUTE add_last_service_date_statement;
DEALLOCATE PREPARE add_last_service_date_statement;

SET @add_last_service_mileage = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'last_service_mileage'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `last_service_mileage` INT UNSIGNED NULL'),
  'SELECT 1'
);
PREPARE add_last_service_mileage_statement FROM @add_last_service_mileage;
EXECUTE add_last_service_mileage_statement;
DEALLOCATE PREPARE add_last_service_mileage_statement;

SET @add_next_service_date = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('next_service_date', 'service_due_date')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `next_service_date` DATE NULL'),
  'SELECT 1'
);
PREPARE add_next_service_date_statement FROM @add_next_service_date;
EXECUTE add_next_service_date_statement;
DEALLOCATE PREPARE add_next_service_date_statement;

SET @add_next_service_mileage = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('next_service_mileage', 'service_due_mileage')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `next_service_mileage` INT UNSIGNED NULL'),
  'SELECT 1'
);
PREPARE add_next_service_mileage_statement FROM @add_next_service_mileage;
EXECUTE add_next_service_mileage_statement;
DEALLOCATE PREPARE add_next_service_mileage_statement;

SET @add_chassis_no = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'chassis_no'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `chassis_no` VARCHAR(100) NULL'),
  'SELECT 1'
);
PREPARE add_chassis_no_statement FROM @add_chassis_no;
EXECUTE add_chassis_no_statement;
DEALLOCATE PREPARE add_chassis_no_statement;

SET @add_engine_no = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'engine_no'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `engine_no` VARCHAR(100) NULL'),
  'SELECT 1'
);
PREPARE add_engine_no_statement FROM @add_engine_no;
EXECUTE add_engine_no_statement;
DEALLOCATE PREPARE add_engine_no_statement;

SET @add_insurance_expiry = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'insurance_expiry'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `insurance_expiry` DATE NULL'),
  'SELECT 1'
);
PREPARE add_insurance_expiry_statement FROM @add_insurance_expiry;
EXECUTE add_insurance_expiry_statement;
DEALLOCATE PREPARE add_insurance_expiry_statement;

SET @add_road_tax_expiry = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('road_tax_expiry', 'roadtax_expiry')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `road_tax_expiry` DATE NULL'),
  'SELECT 1'
);
PREPARE add_road_tax_expiry_statement FROM @add_road_tax_expiry;
EXECUTE add_road_tax_expiry_statement;
DEALLOCATE PREPARE add_road_tax_expiry_statement;

SET @add_puspakom_expiry = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'puspakom_expiry'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `puspakom_expiry` DATE NULL'),
  'SELECT 1'
);
PREPARE add_puspakom_expiry_statement FROM @add_puspakom_expiry;
EXECUTE add_puspakom_expiry_statement;
DEALLOCATE PREPARE add_puspakom_expiry_statement;

SET @add_assigned_driver_id = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name = 'assigned_driver_id'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `assigned_driver_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_assigned_driver_id_statement FROM @add_assigned_driver_id;
EXECUTE add_assigned_driver_id_statement;
DEALLOCATE PREPARE add_assigned_driver_id_statement;

SET @add_company_id = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'company_id'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `company_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_company_id_statement FROM @add_company_id;
EXECUTE add_company_id_statement;
DEALLOCATE PREPARE add_company_id_statement;

SET @add_container_length = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'container_length'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `container_length` VARCHAR(30) NULL'),
  'SELECT 1'
);
PREPARE add_container_length_statement FROM @add_container_length;
EXECUTE add_container_length_statement;
DEALLOCATE PREPARE add_container_length_statement;

SET @add_axle_configuration = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'axle_configuration'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `axle_configuration` VARCHAR(30) NULL'),
  'SELECT 1'
);
PREPARE add_axle_configuration_statement FROM @add_axle_configuration;
EXECUTE add_axle_configuration_statement;
DEALLOCATE PREPARE add_axle_configuration_statement;

SET @add_vehicle_status = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name IN ('vehicle_status', 'operational_status')
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `vehicle_status` VARCHAR(30) NOT NULL DEFAULT ''Active'''),
  'SELECT 1'
);
PREPARE add_vehicle_status_statement FROM @add_vehicle_status;
EXECUTE add_vehicle_status_statement;
DEALLOCATE PREPARE add_vehicle_status_statement;

SET @add_verification_status = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'verification_status'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `verification_status` VARCHAR(30) NOT NULL DEFAULT ''approved'''),
  'SELECT 1'
);
PREPARE add_verification_status_statement FROM @add_verification_status;
EXECUTE add_verification_status_statement;
DEALLOCATE PREPARE add_verification_status_statement;

SET @add_rejection_reason = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'rejection_reason'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `rejection_reason` VARCHAR(500) NULL'),
  'SELECT 1'
);
PREPARE add_rejection_reason_statement FROM @add_rejection_reason;
EXECUTE add_rejection_reason_statement;
DEALLOCATE PREPARE add_rejection_reason_statement;

SET @add_reviewed_by = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'reviewed_by'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `reviewed_by` INT NULL'),
  'SELECT 1'
);
PREPARE add_reviewed_by_statement FROM @add_reviewed_by;
EXECUTE add_reviewed_by_statement;
DEALLOCATE PREPARE add_reviewed_by_statement;

SET @add_reviewed_at = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'reviewed_at'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `reviewed_at` DATETIME NULL'),
  'SELECT 1'
);
PREPARE add_reviewed_at_statement FROM @add_reviewed_at;
EXECUTE add_reviewed_at_statement;
DEALLOCATE PREPARE add_reviewed_at_statement;

SET @add_created_source = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = @vehicle_table AND column_name = 'created_source'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `created_source` VARCHAR(30) NOT NULL DEFAULT ''admin_panel'''),
  'SELECT 1'
);
PREPARE add_created_source_statement FROM @add_created_source;
EXECUTE add_created_source_statement;
DEALLOCATE PREPARE add_created_source_statement;

SELECT @vehicle_table AS migrated_vehicle_table;
