-- Optional, non-destructive container-haulage vehicle profile fields.
-- Apply only to the intended database after taking a backup.
-- Existing records and equipment values are not modified.

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

SET @add_container_length = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name = 'container_length'
  ),
  CONCAT(
    'ALTER TABLE `', @vehicle_table,
    '` ADD COLUMN `container_length` VARCHAR(30) NULL'
  ),
  'SELECT 1'
);
PREPARE add_container_length_statement FROM @add_container_length;
EXECUTE add_container_length_statement;
DEALLOCATE PREPARE add_container_length_statement;

SET @add_axle_configuration = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name = 'axle_configuration'
  ),
  CONCAT(
    'ALTER TABLE `', @vehicle_table,
    '` ADD COLUMN `axle_configuration` VARCHAR(30) NULL'
  ),
  'SELECT 1'
);
PREPARE add_axle_configuration_statement FROM @add_axle_configuration;
EXECUTE add_axle_configuration_statement;
DEALLOCATE PREPARE add_axle_configuration_statement;
