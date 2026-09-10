-- Add the Admin Parts Inventory fields only when the legacy `parts` table
-- does not already expose a compatible column. Safe to run more than once.

SET @parts_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'parts'
);

SET @add_parts_category = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'parts'
      AND column_name IN ('category', 'type', 'part_category', 'group_name')
  ),
  'ALTER TABLE `parts` ADD COLUMN `category` VARCHAR(100) NOT NULL DEFAULT ''Parts''',
  'SELECT 1'
);
PREPARE add_parts_category_statement FROM @add_parts_category;
EXECUTE add_parts_category_statement;
DEALLOCATE PREPARE add_parts_category_statement;

SET @add_parts_sku = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'parts'
      AND column_name IN ('sku', 'part_no', 'code', 'part_code', 'item_code')
  ),
  'ALTER TABLE `parts` ADD COLUMN `sku` VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE add_parts_sku_statement FROM @add_parts_sku;
EXECUTE add_parts_sku_statement;
DEALLOCATE PREPARE add_parts_sku_statement;

SET @add_parts_stock = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'parts'
      AND column_name IN (
        'stock', 'quantity', 'qty', 'stock_quantity',
        'current_stock', 'qty_on_hand', 'on_hand', 'balance'
      )
  ),
  'ALTER TABLE `parts` ADD COLUMN `stock` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE add_parts_stock_statement FROM @add_parts_stock;
EXECUTE add_parts_stock_statement;
DEALLOCATE PREPARE add_parts_stock_statement;

SET @add_parts_threshold = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'parts'
      AND column_name IN (
        'low_stock_threshold', 'minimum_stock', 'min_stock',
        'reorder_level', 'reorder_point'
      )
  ),
  'ALTER TABLE `parts` ADD COLUMN `low_stock_threshold` INT NOT NULL DEFAULT 10',
  'SELECT 1'
);
PREPARE add_parts_threshold_statement FROM @add_parts_threshold;
EXECUTE add_parts_threshold_statement;
DEALLOCATE PREPARE add_parts_threshold_statement;

SET @add_parts_supplier = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'parts'
      AND column_name IN ('supplier', 'vendor', 'supplier_name')
  ),
  'ALTER TABLE `parts` ADD COLUMN `supplier` VARCHAR(150) NULL',
  'SELECT 1'
);
PREPARE add_parts_supplier_statement FROM @add_parts_supplier;
EXECUTE add_parts_supplier_statement;
DEALLOCATE PREPARE add_parts_supplier_statement;

SELECT IF(@parts_exists = 1, 'parts', NULL) AS migrated_parts_table;
