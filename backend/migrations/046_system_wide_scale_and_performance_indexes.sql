-- 046_system_wide_scale_and_performance_indexes.sql
-- High-concurrency and high-volume performance indexes across Invoices, PO Items, Bookings, and Customer Master.

-- 1. work_order_invoice table indexes
SET @woi_tbl = 'work_order_invoice';

SET @idx_woi1 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @woi_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @woi_tbl AND index_name = 'idx_woi_invoice_date'),
  CONCAT('ALTER TABLE `', @woi_tbl, '` ADD INDEX `idx_woi_invoice_date` (`invoice_date`)'),
  'SELECT 1'
);
PREPARE stmt_woi1 FROM @idx_woi1; EXECUTE stmt_woi1; DEALLOCATE PREPARE stmt_woi1;

SET @idx_woi2 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @woi_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @woi_tbl AND index_name = 'idx_woi_status_date'),
  CONCAT('ALTER TABLE `', @woi_tbl, '` ADD INDEX `idx_woi_status_date` (`status`, `invoice_date`)'),
  'SELECT 1'
);
PREPARE stmt_woi2 FROM @idx_woi2; EXECUTE stmt_woi2; DEALLOCATE PREPARE stmt_woi2;


-- 2. accounting_invoice table indexes
SET @ai_tbl = 'accounting_invoice';

SET @idx_ai1 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @ai_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @ai_tbl AND index_name = 'idx_ai_invoice_date'),
  CONCAT('ALTER TABLE `', @ai_tbl, '` ADD INDEX `idx_ai_invoice_date` (`invoice_date`)'),
  'SELECT 1'
);
PREPARE stmt_ai1 FROM @idx_ai1; EXECUTE stmt_ai1; DEALLOCATE PREPARE stmt_ai1;

SET @idx_ai2 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @ai_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @ai_tbl AND index_name = 'idx_ai_doc_date'),
  CONCAT('ALTER TABLE `', @ai_tbl, '` ADD INDEX `idx_ai_doc_date` (`document_status`, `invoice_date`)'),
  'SELECT 1'
);
PREPARE stmt_ai2 FROM @idx_ai2; EXECUTE stmt_ai2; DEALLOCATE PREPARE stmt_ai2;


-- 3. purchase_order_item table indexes
SET @poi_tbl = 'purchase_order_item';

SET @idx_poi1 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @poi_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @poi_tbl AND index_name = 'idx_poi_item_code'),
  CONCAT('ALTER TABLE `', @poi_tbl, '` ADD INDEX `idx_poi_item_code` (`item_code`)'),
  'SELECT 1'
);
PREPARE stmt_poi1 FROM @idx_poi1; EXECUTE stmt_poi1; DEALLOCATE PREPARE stmt_poi1;


-- 4. customer table indexes
SET @cust_tbl = 'customer';

SET @idx_cust1 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @cust_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @cust_tbl AND index_name = 'idx_customer_company_id'),
  CONCAT('ALTER TABLE `', @cust_tbl, '` ADD INDEX `idx_customer_company_id` (`company_id`)'),
  'SELECT 1'
);
PREPARE stmt_cust1 FROM @idx_cust1; EXECUTE stmt_cust1; DEALLOCATE PREPARE stmt_cust1;


-- 5. customer_appointment table indexes
SET @ca_tbl = 'customer_appointment';

SET @idx_ca1 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @ca_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @ca_tbl AND index_name = 'idx_ca_appointment_at'),
  CONCAT('ALTER TABLE `', @ca_tbl, '` ADD INDEX `idx_ca_appointment_at` (`appointment_at`)'),
  'SELECT 1'
);
PREPARE stmt_ca1 FROM @idx_ca1; EXECUTE stmt_ca1; DEALLOCATE PREPARE stmt_ca1;

SET @idx_ca2 = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @ca_tbl) AND
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = @ca_tbl AND index_name = 'idx_ca_company_id'),
  CONCAT('ALTER TABLE `', @ca_tbl, '` ADD INDEX `idx_ca_company_id` (`company_id`)'),
  'SELECT 1'
);
PREPARE stmt_ca2 FROM @idx_ca2; EXECUTE stmt_ca2; DEALLOCATE PREPARE stmt_ca2;

SELECT 'System-wide scale and performance indexes applied successfully.' AS migration_result;
