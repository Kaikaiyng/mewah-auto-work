-- Immutable audit records for successful Admin Panel management actions.
CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'System',
  `entity_type` VARCHAR(60) NULL,
  `entity_id` VARCHAR(80) NULL,
  `entity_label` VARCHAR(180) NULL,
  `description` VARCHAR(500) NOT NULL,
  `metadata_json` LONGTEXT NULL,
  `actor_id` INT NULL,
  `actor_name` VARCHAR(150) NULL,
  `actor_role` VARCHAR(60) NULL,
  `actor_source` VARCHAR(30) NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit_created` (`created_at`, `id`),
  KEY `idx_admin_audit_actor` (`actor_id`, `created_at`),
  KEY `idx_admin_audit_action` (`action`, `created_at`),
  KEY `idx_admin_audit_entity` (`entity_type`, `entity_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
