-- Migration 034: AutoCount Parts Order Delivery Order (DO) Outbox Queue
-- Enqueues sales delivery orders to AutoCount to automatically deduct stock cards upon dispatch.

CREATE TABLE IF NOT EXISTS autocount_parts_order_sync_queue (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(60) NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  doc_type VARCHAR(20) NOT NULL DEFAULT 'DO',
  debtor_code VARCHAR(40) NULL,
  customer_name VARCHAR(150) NULL,
  delivery_address TEXT NULL,
  payload_json LONGTEXT NOT NULL,
  operation VARCHAR(20) NOT NULL DEFAULT 'create',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  locked_at DATETIME NULL,
  completed_at DATETIME NULL,
  error_message TEXT NULL,
  response_payload LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_autocount_parts_order_queue (order_id, operation),
  KEY idx_autocount_parts_order_queue_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add sync tracking fields to parts_orders if table exists
SET @parts_orders_tbl = 'parts_orders';
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@parts_orders_tbl),
  IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@parts_orders_tbl AND column_name='autocount_do_no'), 'ALTER TABLE parts_orders ADD COLUMN autocount_do_no VARCHAR(60) NULL', 'SELECT 1'), 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@parts_orders_tbl),
  IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@parts_orders_tbl AND column_name='autocount_sync_status'), 'ALTER TABLE parts_orders ADD COLUMN autocount_sync_status VARCHAR(24) NOT NULL DEFAULT ''not_queued''', 'SELECT 1'), 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@parts_orders_tbl),
  IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@parts_orders_tbl AND column_name='autocount_sync_at'), 'ALTER TABLE parts_orders ADD COLUMN autocount_sync_at DATETIME NULL', 'SELECT 1'), 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Add sync tracking fields to bookings if table exists
SET @bookings_tbl = 'bookings';
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@bookings_tbl),
  IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@bookings_tbl AND column_name='autocount_do_no'), 'ALTER TABLE bookings ADD COLUMN autocount_do_no VARCHAR(60) NULL', 'SELECT 1'), 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@bookings_tbl),
  IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@bookings_tbl AND column_name='autocount_sync_status'), 'ALTER TABLE bookings ADD COLUMN autocount_sync_status VARCHAR(24) NOT NULL DEFAULT ''not_queued''', 'SELECT 1'), 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@bookings_tbl),
  IF(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=@bookings_tbl AND column_name='autocount_sync_at'), 'ALTER TABLE bookings ADD COLUMN autocount_sync_at DATETIME NULL', 'SELECT 1'), 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'AutoCount parts order Delivery Order (DO) outbox queue is ready.' AS migration_result;
