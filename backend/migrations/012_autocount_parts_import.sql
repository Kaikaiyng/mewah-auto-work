-- Preserve AutoCount UOM and cost when importing the item listing.
-- Safe to run more than once on production and staging databases.

SET @parts_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'parts'
);

SET @add_parts_uom = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'parts'
      AND column_name IN ('uom', 'unit', 'unit_of_measure')
  ),
  'ALTER TABLE `parts` ADD COLUMN `uom` VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE add_parts_uom_statement FROM @add_parts_uom;
EXECUTE add_parts_uom_statement;
DEALLOCATE PREPARE add_parts_uom_statement;

SET @add_parts_cost = IF(
  @parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'parts'
      AND column_name IN ('cost_price', 'cost', 'standard_cost', 'unit_cost')
  ),
  'ALTER TABLE `parts` ADD COLUMN `cost_price` DECIMAL(10,2) NULL',
  'SELECT 1'
);
PREPARE add_parts_cost_statement FROM @add_parts_cost;
EXECUTE add_parts_cost_statement;
DEALLOCATE PREPARE add_parts_cost_statement;

SET @spare_parts_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'spare_parts'
);

SET @add_spare_parts_uom = IF(
  @spare_parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'spare_parts'
      AND column_name IN ('uom', 'unit', 'unit_of_measure')
  ),
  'ALTER TABLE `spare_parts` ADD COLUMN `uom` VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE add_spare_parts_uom_statement FROM @add_spare_parts_uom;
EXECUTE add_spare_parts_uom_statement;
DEALLOCATE PREPARE add_spare_parts_uom_statement;

SET @add_spare_parts_cost = IF(
  @spare_parts_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'spare_parts'
      AND column_name IN ('cost_price', 'cost', 'standard_cost', 'unit_cost')
  ),
  'ALTER TABLE `spare_parts` ADD COLUMN `cost_price` DECIMAL(10,2) NULL',
  'SELECT 1'
);
PREPARE add_spare_parts_cost_statement FROM @add_spare_parts_cost;
EXECUTE add_spare_parts_cost_statement;
DEALLOCATE PREPARE add_spare_parts_cost_statement;

SELECT 'AutoCount parts import fields are ready.' AS migration_result;
