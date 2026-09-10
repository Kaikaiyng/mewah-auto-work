-- MAW creates invoice content; a separate sync program sends queued invoices to AutoCount.

SET @invoice_columns = 'work_order_invoice';

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='internal_ref'), 'ALTER TABLE work_order_invoice ADD COLUMN internal_ref VARCHAR(40) NULL AFTER invoice_no', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='autocount_job_no'), 'ALTER TABLE work_order_invoice ADD COLUMN autocount_job_no VARCHAR(60) NULL AFTER internal_ref', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='debtor_code'), 'ALTER TABLE work_order_invoice ADD COLUMN debtor_code VARCHAR(40) NULL AFTER autocount_job_no', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='vehicle_type'), 'ALTER TABLE work_order_invoice ADD COLUMN vehicle_type VARCHAR(100) NULL AFTER debtor_code', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='vehicle_no'), 'ALTER TABLE work_order_invoice ADD COLUMN vehicle_no VARCHAR(150) NULL AFTER vehicle_type', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='credit_term_days'), 'ALTER TABLE work_order_invoice ADD COLUMN credit_term_days INT NOT NULL DEFAULT 30 AFTER due_date', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='currency'), 'ALTER TABLE work_order_invoice ADD COLUMN currency CHAR(3) NOT NULL DEFAULT ''MYR'' AFTER credit_term_days', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='sync_status'), 'ALTER TABLE work_order_invoice ADD COLUMN sync_status VARCHAR(24) NOT NULL DEFAULT ''not_queued'' AFTER currency', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='sync_requested_at'), 'ALTER TABLE work_order_invoice ADD COLUMN sync_requested_at DATETIME NULL AFTER sync_status', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='synced_at'), 'ALTER TABLE work_order_invoice ADD COLUMN synced_at DATETIME NULL AFTER sync_requested_at', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='sync_error'), 'ALTER TABLE work_order_invoice ADD COLUMN sync_error TEXT NULL AFTER synced_at', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='e_invoice_status'), 'ALTER TABLE work_order_invoice ADD COLUMN e_invoice_status VARCHAR(24) NULL AFTER sync_error', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@invoice_columns AND column_name='e_invoice_uuid'), 'ALTER TABLE work_order_invoice ADD COLUMN e_invoice_uuid VARCHAR(120) NULL AFTER e_invoice_status', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='work_order_invoice_item' AND column_name='tax_code'), 'ALTER TABLE work_order_invoice_item ADD COLUMN tax_code VARCHAR(30) NULL AFTER unit_price', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='work_order_invoice_item' AND column_name='tax_rate'), 'ALTER TABLE work_order_invoice_item ADD COLUMN tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER tax_code', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='work_order_invoice_item' AND column_name='tax_amount'), 'ALTER TABLE work_order_invoice_item ADD COLUMN tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER tax_rate', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE work_order_invoice SET internal_ref = invoice_no WHERE internal_ref IS NULL AND invoice_no IS NOT NULL;

UPDATE system_setting
SET setting_value = 'Configure your workshop address'
WHERE setting_key = 'company.address'
  AND setting_value = 'NO. 2, JALAN MOLLEK 2/3, TAMAN MOLLEK, 81100 JOHOR BAHRU, JOHOR';

CREATE TABLE IF NOT EXISTS autocount_invoice_sync_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  operation VARCHAR(20) NOT NULL DEFAULT 'create',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  locked_at DATETIME NULL,
  completed_at DATETIME NULL,
  error_message TEXT NULL,
  response_payload LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_autocount_invoice_queue_invoice_operation (invoice_id, operation),
  KEY idx_autocount_invoice_queue_status (status, created_at),
  CONSTRAINT fk_autocount_invoice_queue_invoice FOREIGN KEY (invoice_id) REFERENCES work_order_invoice(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'MAW invoice to AutoCount outbox is ready.' AS migration_result;
