-- Persistent configuration for the Admin Panel System Settings module.
-- Non-destructive and safe to run more than once.

CREATE TABLE IF NOT EXISTS `system_setting` (
  `setting_key` VARCHAR(120) NOT NULL,
  `setting_value` TEXT NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `system_setting` (`setting_key`, `setting_value`) VALUES
  ('company.legal_name', 'MEWAH AUTOWORKS SDN BHD'),
  ('company.registration_no', 'YOUR-REGISTRATION-NO'),
  ('company.group_name', ''),
  ('company.address', 'Configure your workshop address'),
  ('company.phone', '+60 00-000 0000'),
  ('company.email', 'contact@example.com'),
  ('company.operating_hours', 'Monday - Saturday, 8:00 AM - 6:00 PM'),
  ('pricing.tax_rate', '0'),
  ('pricing.labor_rate', '80'),
  ('pricing.parts_markup', '25'),
  ('pricing.automatic_rounding', '1'),
  ('notifications.service_reminders', '1'),
  ('notifications.insurance_reminders', '1'),
  ('notifications.booking_updates', '1'),
  ('notifications.low_stock_alerts', '1');

CREATE TABLE IF NOT EXISTS `service_type` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL,
  `base_price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_type_name` (`name`),
  KEY `idx_service_type_enabled_sort` (`is_enabled`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `service_type` (`name`, `description`, `base_price`, `is_enabled`, `sort_order`) VALUES
  ('Routine Maintenance', 'Scheduled preventive maintenance service.', 280.00, 1, 10),
  ('Oil Change', 'Engine oil and filter replacement.', 120.00, 1, 20),
  ('Brake Service', 'Brake inspection, adjustment and replacement work.', 350.00, 1, 30),
  ('Engine Repair', 'Engine diagnosis and repair work.', 500.00, 1, 40),
  ('Electrical System Check', 'Electrical system inspection and diagnosis.', 200.00, 0, 50);

SELECT 'System settings and service types are ready.' AS migration_result;
