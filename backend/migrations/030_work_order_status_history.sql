-- Auditable one-step work-order lifecycle corrections.

CREATE TABLE IF NOT EXISTS `work_order_status_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL,
  `from_status` VARCHAR(40) NOT NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `action` VARCHAR(30) NOT NULL DEFAULT 'transition',
  `reason` VARCHAR(500) NULL,
  `actor_id` INT NULL,
  `actor_name` VARCHAR(150) NULL,
  `actor_role` VARCHAR(60) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_status_history_job` (`work_order_id`, `created_at`),
  KEY `idx_work_order_status_history_action` (`action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Work order status rollback history is ready.' AS migration_result;
