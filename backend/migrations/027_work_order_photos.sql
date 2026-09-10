-- Store real workshop photo uploads and their work-order audit metadata.
-- Files are kept in backend/storage/work-order-photos and streamed through api.php.

CREATE TABLE IF NOT EXISTS `work_order_photo` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL,
  `category` VARCHAR(30) NOT NULL DEFAULT 'repair',
  `caption` VARCHAR(500) NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `byte_size` BIGINT UNSIGNED NOT NULL,
  `uploaded_by_staff_id` INT NULL,
  `customer_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `taken_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_photo_job_created` (`work_order_id`, `created_at`),
  KEY `idx_work_order_photo_customer` (`work_order_id`, `customer_visible`),
  KEY `idx_work_order_photo_staff` (`uploaded_by_staff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Work-order photo storage is ready.' AS migration_result;
