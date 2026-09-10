-- Add item-level tax columns to work_order_quotation_item to match work_order_invoice_item
-- This unifies the Quotation tax model with Malaysian SST (Labour 8% SV-8, Parts 0%) and AutoCount.

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='work_order_quotation_item' AND column_name='tax_code'), 'ALTER TABLE work_order_quotation_item ADD COLUMN tax_code VARCHAR(30) NULL AFTER unit_price', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='work_order_quotation_item' AND column_name='tax_rate'), 'ALTER TABLE work_order_quotation_item ADD COLUMN tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER tax_code', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='work_order_quotation_item' AND column_name='tax_amount'), 'ALTER TABLE work_order_quotation_item ADD COLUMN tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER tax_rate', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'Quotation item tax columns are ready.' AS migration_result;
