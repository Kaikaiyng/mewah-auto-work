-- Persist Customer App delivery addresses on the active customer account table.
-- The application also adds this column defensively during schema bootstrap.

SET @customer_address_table = (
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

SET @add_delivery_addresses = IF(
  @customer_address_table IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = @customer_address_table
      AND column_name = 'delivery_addresses'
  ),
  CONCAT(
    'ALTER TABLE `', @customer_address_table,
    '` ADD COLUMN `delivery_addresses` LONGTEXT NULL'
  ),
  'SELECT 1'
);

PREPARE add_delivery_addresses_statement FROM @add_delivery_addresses;
EXECUTE add_delivery_addresses_statement;
DEALLOCATE PREPARE add_delivery_addresses_statement;

SELECT 'Customer delivery address storage is ready.' AS migration_result;
