-- AutoCount-compatible item and stock-group master data.
-- Preserves exact Item Codes, supports fractional UOM quantities, and keeps
-- vehicle-sale stock separate from workshop parts/services.

CREATE TABLE IF NOT EXISTS `autocount_stock_group` (
  `code` VARCHAR(30) NOT NULL,
  `description` VARCHAR(150) NOT NULL,
  `item_type` VARCHAR(20) NOT NULL DEFAULT 'other',
  `sales_account` VARCHAR(30) NULL,
  `sales_discount_account` VARCHAR(30) NULL,
  `sales_return_account` VARCHAR(30) NULL,
  `purchase_account` VARCHAR(30) NULL,
  `purchase_discount_account` VARCHAR(30) NULL,
  `purchase_return_account` VARCHAR(30) NULL,
  `is_workshop_item` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`),
  KEY `idx_autocount_stock_group_type` (`item_type`, `is_workshop_item`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `autocount_stock_group`
  (`code`, `description`, `item_type`, `is_workshop_item`)
VALUES
  ('ACCHDLG', 'ACCRUAL - HANLDING', 'fee', 0),
  ('ACCRUAL', 'ACCRUAL', 'fee', 0),
  ('AUDIT FE', 'AUDIT FEE', 'fee', 0),
  ('BOOKFEE', 'BOOKING FEE FOR PUSPAKOM', 'fee', 1),
  ('CONTRA', 'CONTRA ACC', 'fee', 0),
  ('CONTRI', 'CONTRIBUTION', 'fee', 0),
  ('COURIER', 'COURIER SERVICES', 'service', 1),
  ('DEPOSIT', 'DEPOSIT RECEIVED', 'fee', 0),
  ('EQUIP', 'EQUIPMENTS', 'part', 1),
  ('FWDG', 'FORWARDING CHARGES', 'service', 0),
  ('HAULAGE', 'HAULAGE CHARGES', 'service', 0),
  ('HDLG', 'HANDLING CHARGES', 'service', 1),
  ('INSURAN', 'INSURANCE PREMIUM', 'fee', 0),
  ('LAB HAND', 'LABOUR CHARGES - HANDLING', 'labour', 1),
  ('LABOUR', 'LABOUR CHARGES', 'labour', 1),
  ('MTL_DGC', 'DEPOT GATE CHARGES', 'fee', 0),
  ('O/CHARGE', 'OUTSIDE CHARGES', 'service', 1),
  ('PORTS', 'PORT CHARGES', 'fee', 0),
  ('PR LABOU', 'PR LABOUR CHARGES', 'labour', 1),
  ('PREPAY', 'PREPAYMENT', 'fee', 0),
  ('PS LABOU', 'PS LABOUR CHARGES', 'labour', 1),
  ('RENTAL', 'RENTAL YARD', 'service', 0),
  ('SM', 'SCRAP METAL', 'part', 1),
  ('SOC', 'SALE OF CONTAINER', 'vehicle', 0),
  ('SP', 'SPARE PARTS', 'part', 1),
  ('STOCK', 'STOCK', 'part', 1),
  ('STOCK PM', 'STOCK - PRIME MOVERS', 'vehicle', 0),
  ('T&E (EXP', 'TOOLS & EQUIPMENTS (EXPENSES)', 'part', 1),
  ('T/L USE', 'TRAILER USE', 'service', 1),
  ('T/W USE', 'TRAILER & WORKSHOP USE', 'service', 1),
  ('TLS&EQP', 'TOOLS & EQUIPMENTS', 'part', 1),
  ('TR LABOU', 'TR LABOUR CHARGES', 'labour', 1),
  ('TRANS', 'TRANSPORT CHARGES', 'service', 1),
  ('TS LABOU', 'TS LABOUR CHARGES', 'labour', 1),
  ('UK/EQP', 'UPKEEP OF EQUIPEMTS', 'service', 1),
  ('UTILITY', 'ELECTRICITY', 'fee', 0)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `item_type` = VALUES(`item_type`),
  `is_workshop_item` = VALUES(`is_workshop_item`);

SET @parts_table = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'parts'),
  'parts',
  IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'spare_parts'), 'spare_parts', NULL)
);

SET @sku_column = IF(@parts_table IS NULL, NULL,
  (SELECT column_name FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = @parts_table
     AND column_name IN ('sku','part_no','code','part_code','item_code')
   ORDER BY FIELD(column_name,'sku','part_no','code','part_code','item_code') LIMIT 1));
SET @sql = IF(@sku_column IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` MODIFY COLUMN `', @sku_column, '` VARCHAR(80) NULL'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @stock_column = IF(@parts_table IS NULL, NULL,
  (SELECT column_name FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = @parts_table
     AND column_name IN ('stock','quantity','qty','stock_quantity','current_stock','qty_on_hand','on_hand','balance')
   ORDER BY FIELD(column_name,'stock','quantity','qty','stock_quantity','current_stock','qty_on_hand','on_hand','balance') LIMIT 1));
SET @sql = IF(@stock_column IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` MODIFY COLUMN `', @stock_column, '` DECIMAL(14,3) NOT NULL DEFAULT 0'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @threshold_column = IF(@parts_table IS NULL, NULL,
  (SELECT column_name FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = @parts_table
     AND column_name IN ('low_stock_threshold','minimum_stock','min_stock','reorder_level','reorder_point')
   ORDER BY FIELD(column_name,'low_stock_threshold','minimum_stock','min_stock','reorder_level','reorder_point') LIMIT 1));
SET @sql = IF(@threshold_column IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` MODIFY COLUMN `', @threshold_column, '` DECIMAL(14,3) NOT NULL DEFAULT 0'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @sql = IF(@parts_table IS NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @parts_table AND column_name = 'autocount_item_group'), 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` ADD COLUMN `autocount_item_group` VARCHAR(30) NULL'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @sql = IF(@parts_table IS NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @parts_table AND column_name = 'item_type'), 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` ADD COLUMN `item_type` VARCHAR(20) NOT NULL DEFAULT ''part'''));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @sql = IF(@parts_table IS NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @parts_table AND column_name = 'tax_code'), 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` ADD COLUMN `tax_code` VARCHAR(30) NULL'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @sql = IF(@parts_table IS NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @parts_table AND column_name = 'is_stock_item'), 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` ADD COLUMN `is_stock_item` TINYINT(1) NOT NULL DEFAULT 1'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @sql = IF(@parts_table IS NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = @parts_table AND column_name = 'is_active'), 'SELECT 1', CONCAT('ALTER TABLE `', @parts_table, '` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1'));
PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
