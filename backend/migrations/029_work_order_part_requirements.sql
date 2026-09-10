-- Parts identified during inspection. These requirements remain independent
-- from quotations so no-quotation repairs still retain stock planning data.

CREATE TABLE IF NOT EXISTS `work_order_part_requirement` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL,
  `part_id` BIGINT NULL,
  `item_code` VARCHAR(80) NULL,
  `description` VARCHAR(500) NOT NULL,
  `uom` VARCHAR(30) NULL,
  `required_quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_part_requirement_job` (`work_order_id`),
  KEY `idx_work_order_part_requirement_part` (`part_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Work order inspection part requirements are ready.' AS migration_result;
