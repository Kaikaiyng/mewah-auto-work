-- Link quotation service lines to the System Settings service catalogue.
-- The quotation line keeps its own description and price as an immutable snapshot.
-- Non-destructive and safe to run more than once.

SET @quotation_item_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'work_order_quotation_item'
);

SET @service_type_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'service_type'
);

SET @add_service_type_id = IF(
  @quotation_item_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'work_order_quotation_item'
      AND column_name = 'service_type_id'
  ),
  'ALTER TABLE `work_order_quotation_item` ADD COLUMN `service_type_id` INT UNSIGNED NULL AFTER `item_type`',
  'SELECT 1'
);
PREPARE add_service_type_id_statement FROM @add_service_type_id;
EXECUTE add_service_type_id_statement;
DEALLOCATE PREPARE add_service_type_id_statement;

SET @add_service_type_index = IF(
  @quotation_item_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'work_order_quotation_item'
      AND index_name = 'idx_work_order_quotation_item_service_type'
  ),
  'ALTER TABLE `work_order_quotation_item` ADD KEY `idx_work_order_quotation_item_service_type` (`service_type_id`)',
  'SELECT 1'
);
PREPARE add_service_type_index_statement FROM @add_service_type_index;
EXECUTE add_service_type_index_statement;
DEALLOCATE PREPARE add_service_type_index_statement;

SET @add_service_type_fk = IF(
  @quotation_item_exists = 1 AND @service_type_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'work_order_quotation_item'
      AND constraint_name = 'fk_work_order_quotation_item_service_type'
  ),
  'ALTER TABLE `work_order_quotation_item` ADD CONSTRAINT `fk_work_order_quotation_item_service_type` FOREIGN KEY (`service_type_id`) REFERENCES `service_type` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE add_service_type_fk_statement FROM @add_service_type_fk;
EXECUTE add_service_type_fk_statement;
DEALLOCATE PREPARE add_service_type_fk_statement;

SELECT IF(
  @quotation_item_exists = 1,
  'Quotation service type linkage is ready.',
  'work_order_quotation_item table not found. Apply migration 015 first.'
) AS migration_result;
