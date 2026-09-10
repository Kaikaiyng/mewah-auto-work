-- Vehicle/unit number is optional in both Admin Panel and Customer App.
-- A blank string conflicts with legacy UNIQUE indexes, while NULL correctly allows multiple vehicles without a unit number.
-- Non-destructive and safe to run more than once.

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

SET @vehicle_number_column = (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = @vehicle_table
    AND column_name IN ('vec_no', 'vehicle_no', 'unit_no')
  ORDER BY FIELD(column_name, 'vec_no', 'vehicle_no', 'unit_no')
  LIMIT 1
);

SET @vehicle_number_type = (
  SELECT column_type
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = @vehicle_table
    AND column_name = @vehicle_number_column
  LIMIT 1
);

SET @make_vehicle_number_nullable = IF(
  @vehicle_table IS NOT NULL AND @vehicle_number_column IS NOT NULL,
  CONCAT(
    'ALTER TABLE `', @vehicle_table, '` MODIFY COLUMN `', @vehicle_number_column,
    '` ', @vehicle_number_type, ' NULL DEFAULT NULL'
  ),
  'SELECT 1'
);
PREPARE make_vehicle_number_nullable_statement FROM @make_vehicle_number_nullable;
EXECUTE make_vehicle_number_nullable_statement;
DEALLOCATE PREPARE make_vehicle_number_nullable_statement;

SET @clear_blank_vehicle_numbers = IF(
  @vehicle_table IS NOT NULL AND @vehicle_number_column IS NOT NULL,
  CONCAT(
    'UPDATE `', @vehicle_table, '` SET `', @vehicle_number_column,
    '` = NULL WHERE CHAR_LENGTH(TRIM(`', @vehicle_number_column, '`)) = 0'
  ),
  'SELECT 1'
);
PREPARE clear_blank_vehicle_numbers_statement FROM @clear_blank_vehicle_numbers;
EXECUTE clear_blank_vehicle_numbers_statement;
DEALLOCATE PREPARE clear_blank_vehicle_numbers_statement;

SELECT IF(
  @vehicle_number_column IS NOT NULL,
  'Optional vehicle number storage is ready.',
  'No vehicle number column was found.'
) AS migration_result;
