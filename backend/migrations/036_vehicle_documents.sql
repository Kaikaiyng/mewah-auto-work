-- Vehicle compliance document uploads, review state, and immutable version history.
-- Files are stored under backend/storage/vehicle-documents and streamed via api.php.

CREATE TABLE IF NOT EXISTS `vehicle_document` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vehicle_id` INT NOT NULL,
  `document_type` VARCHAR(30) NOT NULL,
  `expiry_date` DATE NOT NULL,
  `storage_path` VARCHAR(500) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `byte_size` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `review_reason` VARCHAR(500) NULL,
  `uploaded_by_customer_id` INT NULL,
  `uploaded_by_source` VARCHAR(30) NULL,
  `reviewed_by` INT NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vehicle_document_vehicle_created` (`vehicle_id`, `created_at`),
  KEY `idx_vehicle_document_review_queue` (`status`, `created_at`),
  KEY `idx_vehicle_document_type_status` (`vehicle_id`, `document_type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Vehicle document storage is ready.' AS migration_result;
