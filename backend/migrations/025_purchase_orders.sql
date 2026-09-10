-- Supplier purchase orders created in MAW, with ETA reminders and optional AutoCount sync.

CREATE TABLE IF NOT EXISTS `purchase_order` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `internal_ref` VARCHAR(40) NULL,
  `autocount_po_no` VARCHAR(60) NULL,
  `work_order_id` BIGINT NULL,
  `supplier_code` VARCHAR(40) NULL,
  `supplier_name` VARCHAR(150) NOT NULL,
  `order_date` DATE NOT NULL,
  `estimated_arrival_date` DATE NOT NULL,
  `reminder_days` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `currency` CHAR(3) NOT NULL DEFAULT 'MYR',
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `sync_status` VARCHAR(24) NOT NULL DEFAULT 'not_queued',
  `sync_requested_at` DATETIME NULL,
  `synced_at` DATETIME NULL,
  `sync_error` TEXT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ordered_at` DATETIME NULL,
  `received_at` DATETIME NULL,
  `cancelled_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchase_order_internal_ref` (`internal_ref`),
  UNIQUE KEY `uq_purchase_order_autocount_no` (`autocount_po_no`),
  KEY `idx_purchase_order_status_eta` (`status`, `estimated_arrival_date`),
  KEY `idx_purchase_order_work_order` (`work_order_id`),
  KEY `idx_purchase_order_sync` (`sync_status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_order_id` BIGINT UNSIGNED NOT NULL,
  `part_id` BIGINT NULL,
  `item_code` VARCHAR(80) NULL,
  `description` VARCHAR(500) NOT NULL,
  `uom` VARCHAR(30) NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `received_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `unit_cost` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `tax_code` VARCHAR(30) NULL,
  `tax_rate` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_purchase_order_item_order` (`purchase_order_id`),
  KEY `idx_purchase_order_item_part` (`part_id`),
  CONSTRAINT `fk_purchase_order_item_order`
    FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `autocount_purchase_order_sync_queue` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `purchase_order_id` BIGINT UNSIGNED NOT NULL,
  `operation` VARCHAR(20) NOT NULL DEFAULT 'create',
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `locked_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `error_message` TEXT NULL,
  `response_payload` LONGTEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_autocount_po_queue_order_operation` (`purchase_order_id`, `operation`),
  KEY `idx_autocount_po_queue_status` (`status`, `created_at`),
  CONSTRAINT `fk_autocount_po_queue_order`
    FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Supplier purchase orders are ready.' AS migration_result;
