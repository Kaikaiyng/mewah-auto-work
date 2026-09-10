-- Prepare MAW for a future AutoCount sync program without importing historical data yet.
-- MAW owns workshop workflow; AutoCount owns formal invoices, payments, and e-Invoice state.

SET @add_debtor_code = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company' AND column_name = 'autocount_debtor_code'),
  'ALTER TABLE `company` ADD COLUMN `autocount_debtor_code` VARCHAR(40) NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_debtor_code; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_debtor_code_index = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'company' AND index_name = 'uq_company_autocount_debtor'),
  'ALTER TABLE `company` ADD UNIQUE INDEX `uq_company_autocount_debtor` (`autocount_debtor_code`)',
  'SELECT 1'
);
PREPARE statement FROM @add_debtor_code_index; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_autocount_job_no = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'autocount_job_no'),
  'ALTER TABLE `job` ADD COLUMN `autocount_job_no` VARCHAR(60) NULL',
  'SELECT 1'
);
PREPARE statement FROM @add_autocount_job_no; EXECUTE statement; DEALLOCATE PREPARE statement;

SET @add_autocount_job_index = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'job' AND index_name = 'idx_job_autocount_job_no'),
  'ALTER TABLE `job` ADD INDEX `idx_job_autocount_job_no` (`company_id`, `autocount_job_no`)',
  'SELECT 1'
);
PREPARE statement FROM @add_autocount_job_index; EXECUTE statement; DEALLOCATE PREPARE statement;

CREATE TABLE IF NOT EXISTS `work_order_vehicle` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL,
  `vehicle_id` BIGINT NOT NULL,
  `relationship` VARCHAR(20) NOT NULL DEFAULT 'related',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_work_order_vehicle` (`work_order_id`, `vehicle_id`),
  KEY `idx_work_order_vehicle_vehicle` (`vehicle_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `autocount_sync_batch` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_file_name` VARCHAR(255) NULL,
  `source_sha256` CHAR(64) NULL,
  `source_exported_at` DATETIME NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `row_count` INT NOT NULL DEFAULT 0,
  `error_count` INT NOT NULL DEFAULT 0,
  `started_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_autocount_sync_batch_hash` (`source_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `accounting_invoice` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source` VARCHAR(24) NOT NULL DEFAULT 'autocount',
  `external_invoice_no` VARCHAR(60) NOT NULL,
  `company_id` INT NOT NULL,
  `work_order_id` BIGINT NULL,
  `vehicle_id` BIGINT NULL,
  `external_job_no` VARCHAR(60) NULL,
  `vehicle_no_raw` VARCHAR(150) NULL,
  `invoice_date` DATE NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'MYR',
  `total` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `outstanding` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `document_status` VARCHAR(24) NOT NULL DEFAULT 'approved',
  `e_invoice_status` VARCHAR(24) NULL,
  `e_invoice_uuid` VARCHAR(120) NULL,
  `summary_only` TINYINT(1) NOT NULL DEFAULT 1,
  `sync_batch_id` BIGINT UNSIGNED NULL,
  `source_updated_at` DATETIME NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounting_invoice_source_no` (`source`, `external_invoice_no`),
  KEY `idx_accounting_invoice_company_date` (`company_id`, `invoice_date`),
  KEY `idx_accounting_invoice_work_order` (`work_order_id`),
  KEY `idx_accounting_invoice_vehicle` (`vehicle_id`),
  KEY `idx_accounting_invoice_job` (`company_id`, `external_job_no`),
  KEY `idx_accounting_invoice_status` (`document_status`, `outstanding`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `accounting_invoice_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` BIGINT UNSIGNED NOT NULL,
  `line_no` INT NOT NULL DEFAULT 0,
  `item_code` VARCHAR(80) NULL,
  `description` VARCHAR(500) NOT NULL,
  `item_type` VARCHAR(20) NOT NULL DEFAULT 'other',
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `tax_code` VARCHAR(30) NULL,
  `tax_rate` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounting_invoice_line` (`invoice_id`, `line_no`),
  CONSTRAINT `fk_accounting_invoice_item_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `accounting_invoice` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'AutoCount-ready workflow schema is ready.' AS migration_result;
