-- Work-order quotations and line items.
-- Non-destructive and safe to run more than once.

CREATE TABLE IF NOT EXISTS `work_order_quotation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL,
  `quotation_no` VARCHAR(40) NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `valid_until` DATE NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax_rate` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `terms` TEXT NULL,
  `customer_response_note` TEXT NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `issued_at` DATETIME NULL,
  `approved_at` DATETIME NULL,
  `rejected_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_order_quotation_job` (`work_order_id`),
  UNIQUE KEY `uq_work_order_quotation_no` (`quotation_no`),
  KEY `idx_work_order_quotation_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `work_order_quotation_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `quotation_id` BIGINT UNSIGNED NOT NULL,
  `item_type` VARCHAR(20) NOT NULL DEFAULT 'part',
  `item_code` VARCHAR(80) NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_quotation_item_quote` (`quotation_id`),
  CONSTRAINT `fk_work_order_quotation_item_quote`
    FOREIGN KEY (`quotation_id`) REFERENCES `work_order_quotation` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Work order quotation tables are ready.' AS migration_result;
