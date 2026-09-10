-- Migration 033: Preset MewahTrans Invoice Sync Queue & Status Fields
-- Prepares MAW invoices to sync directly to MewahTrans billing (Pending Bills) on the same server

ALTER TABLE `work_order_invoice`
    ADD COLUMN IF NOT EXISTS `mewahtrans_sync_status` VARCHAR(24) NOT NULL DEFAULT 'not_queued' AFTER `currency`,
    ADD COLUMN IF NOT EXISTS `mewahtrans_ref_no` VARCHAR(60) NULL AFTER `mewahtrans_sync_status`,
    ADD COLUMN IF NOT EXISTS `mewahtrans_synced_at` DATETIME NULL AFTER `mewahtrans_ref_no`,
    ADD COLUMN IF NOT EXISTS `mewahtrans_error` TEXT NULL AFTER `mewahtrans_synced_at`;

CREATE TABLE IF NOT EXISTS `mewahtrans_invoice_sync_queue` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `invoice_id` BIGINT UNSIGNED NOT NULL,
    `operation` VARCHAR(20) NOT NULL DEFAULT 'create',
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `attempt_count` INT NOT NULL DEFAULT 0,
    `locked_at` DATETIME NULL,
    `completed_at` DATETIME NULL,
    `error_message` TEXT NULL,
    `response_payload` LONGTEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_mewahtrans_invoice_queue_invoice_operation` (`invoice_id`, `operation`),
    INDEX `idx_mewahtrans_invoice_queue_status` (`status`, `created_at`),
    CONSTRAINT `fk_mewahtrans_invoice_queue_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `work_order_invoice`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
