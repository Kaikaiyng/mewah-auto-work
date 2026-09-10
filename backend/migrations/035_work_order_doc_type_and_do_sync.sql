-- Migration 035: Work Order Document Type Selection (Invoice vs. Delivery Order / DO)
-- Allows work orders to be issued and synchronized to AutoCount as either a Sales Invoice or a Delivery Order (DO).

SET @tbl = 'work_order_invoice';

SET @sql1 = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = 'doc_type'
    ),
    'ALTER TABLE `work_order_invoice` ADD COLUMN `doc_type` VARCHAR(20) NOT NULL DEFAULT \'INVOICE\' AFTER `quotation_id`',
    'SELECT 1'
  )
);
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @sql2 = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = @tbl AND column_name = 'autocount_do_no'
    ),
    'ALTER TABLE `work_order_invoice` ADD COLUMN `autocount_do_no` VARCHAR(60) NULL AFTER `invoice_no`',
    'SELECT 1'
  )
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SELECT 'Migration 035 completed: work_order_invoice now supports doc_type and autocount_do_no.' AS migration_result;
