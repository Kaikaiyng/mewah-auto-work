-- Formal invoices generated from completed work-order pricing.
-- Invoice values are snapshots and do not change when quotations or catalogue prices change.

CREATE TABLE IF NOT EXISTS `work_order_invoice` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL,
  `quotation_id` BIGINT UNSIGNED NULL,
  `invoice_no` VARCHAR(40) NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `invoice_date` DATE NOT NULL,
  `due_date` DATE NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `balance` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `payment_method` VARCHAR(60) NULL,
  `notes` TEXT NULL,
  `payment_instructions` TEXT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `issued_at` DATETIME NULL,
  `paid_at` DATETIME NULL,
  `voided_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_order_invoice_job` (`work_order_id`),
  UNIQUE KEY `uq_work_order_invoice_no` (`invoice_no`),
  KEY `idx_work_order_invoice_status_due` (`status`, `due_date`),
  KEY `idx_work_order_invoice_quotation` (`quotation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `work_order_invoice_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` BIGINT UNSIGNED NOT NULL,
  `item_type` VARCHAR(20) NOT NULL DEFAULT 'part',
  `service_type_id` INT UNSIGNED NULL,
  `item_code` VARCHAR(80) NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_invoice_item_invoice` (`invoice_id`),
  KEY `idx_work_order_invoice_item_service_type` (`service_type_id`),
  CONSTRAINT `fk_work_order_invoice_item_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `work_order_invoice` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_work_order_invoice_item_service_type`
    FOREIGN KEY (`service_type_id`) REFERENCES `service_type` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Work order invoice tables are ready.' AS migration_result;
