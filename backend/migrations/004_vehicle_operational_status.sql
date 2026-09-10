-- Non-destructive vehicle profile support.
-- Apply this file only to the intended database after taking a backup.
-- It supports either the legacy `customer_vehicle` table or the newer `vehicles` table.

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

SET @add_vehicle_status = IF(
  @vehicle_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @vehicle_table
      AND column_name = 'vehicle_status'
  ),
  CONCAT(
    'ALTER TABLE `', @vehicle_table,
    '` ADD COLUMN `vehicle_status` VARCHAR(30) NOT NULL DEFAULT ''Active'''
  ),
  'SELECT 1'
);
PREPARE add_vehicle_status_statement FROM @add_vehicle_status;
EXECUTE add_vehicle_status_statement;
DEALLOCATE PREPARE add_vehicle_status_statement;

SET @vehicle_number_column = (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = @vehicle_table
    AND column_name IN ('vec_no', 'vehicle_no', 'unit_no')
  ORDER BY FIELD(column_name, 'vec_no', 'vehicle_no', 'unit_no')
  LIMIT 1
);

SET @make_vehicle_number_optional = IF(
  @vehicle_table IS NOT NULL AND @vehicle_number_column IS NOT NULL,
  CONCAT(
    'ALTER TABLE `', @vehicle_table, '` MODIFY `',
    @vehicle_number_column, '` VARCHAR(50) NULL'
  ),
  'SELECT 1'
);
PREPARE make_vehicle_number_optional_statement FROM @make_vehicle_number_optional;
EXECUTE make_vehicle_number_optional_statement;
DEALLOCATE PREPARE make_vehicle_number_optional_statement;
