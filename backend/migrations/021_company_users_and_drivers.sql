-- Separate Customer App users from non-login company driver profiles.
-- Apply to staging after taking a backup. This migration is additive and idempotent.

CREATE TABLE IF NOT EXISTS `company_driver` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `licence_no` VARCHAR(100) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
  `notes` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_company_driver_company_status` (`company_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @company_user_table = (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'customer'
    ) THEN 'customer'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'users'
    ) THEN 'users'
    ELSE NULL
  END
);

SET @add_company_user_role = IF(
  @company_user_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @company_user_table
      AND column_name = 'company_user_role'
  ),
  CONCAT(
    'ALTER TABLE `', @company_user_table,
    '` ADD COLUMN `company_user_role` VARCHAR(30) NOT NULL DEFAULT ''Company User'''
  ),
  'SELECT 1'
);
PREPARE add_company_user_role_statement FROM @add_company_user_role;
EXECUTE add_company_user_role_statement;
DEALLOCATE PREPARE add_company_user_role_statement;

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

SET @add_driver_profile_id = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name = 'driver_profile_id'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD COLUMN `driver_profile_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_driver_profile_id_statement FROM @add_driver_profile_id;
EXECUTE add_driver_profile_id_statement;
DEALLOCATE PREPARE add_driver_profile_id_statement;

SET @add_driver_profile_index = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND index_name = 'idx_vehicle_driver_profile'
  ),
  CONCAT('ALTER TABLE `', @vehicle_table, '` ADD INDEX `idx_vehicle_driver_profile` (`driver_profile_id`)'),
  'SELECT 1'
);
PREPARE add_driver_profile_index_statement FROM @add_driver_profile_index;
EXECUTE add_driver_profile_index_statement;
DEALLOCATE PREPARE add_driver_profile_index_statement;

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

SET @add_created_by_company_user_id = IF(
  @booking_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @booking_table
      AND column_name = 'created_by_company_user_id'
  ),
  CONCAT('ALTER TABLE `', @booking_table, '` ADD COLUMN `created_by_company_user_id` INT NULL'),
  'SELECT 1'
);
PREPARE add_created_by_company_user_id_statement FROM @add_created_by_company_user_id;
EXECUTE add_created_by_company_user_id_statement;
DEALLOCATE PREPARE add_created_by_company_user_id_statement;

SET @booking_contact_column = (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = @booking_table
    AND column_name IN ('customer_id', 'user_id')
  ORDER BY FIELD(column_name, 'customer_id', 'user_id')
  LIMIT 1
);

SET @backfill_booking_creator = IF(
  @booking_table IS NOT NULL AND @booking_contact_column IS NOT NULL,
  CONCAT(
    'UPDATE `', @booking_table, '` SET `created_by_company_user_id` = `',
    @booking_contact_column,
    '` WHERE `created_by_company_user_id` IS NULL'
  ),
  'SELECT 1'
);
PREPARE backfill_booking_creator_statement FROM @backfill_booking_creator;
EXECUTE backfill_booking_creator_statement;
DEALLOCATE PREPARE backfill_booking_creator_statement;

SELECT
  @company_user_table AS company_user_table,
  @vehicle_table AS vehicle_table,
  @booking_table AS booking_table,
  'Company users and non-login drivers are separated.' AS migration_result;
