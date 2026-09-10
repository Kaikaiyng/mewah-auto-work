-- Customer parts ordering for existing MAW databases.
-- Apply after taking a backup. This migration is non-destructive and idempotent.
-- It deliberately uses independent order tables so legacy customer/customer_appointment
-- installations do not need to be converted to the newer users/bookings schema.

CREATE TABLE IF NOT EXISTS `parts_orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_number` VARCHAR(50) NOT NULL,
  `customer_id` INT NOT NULL,
  `company_id` INT NULL,
  `fulfilment_method` VARCHAR(20) NOT NULL DEFAULT 'delivery',
  `service_centre` VARCHAR(255) NULL,
  `delivery_address` TEXT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_parts_orders_order_number` (`order_number`),
  KEY `idx_parts_orders_customer_id` (`customer_id`),
  KEY `idx_parts_orders_company_id` (`company_id`),
  KEY `idx_parts_orders_status` (`status`),
  KEY `idx_parts_orders_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parts_order_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `part_id` INT NULL,
  `name` VARCHAR(150) NOT NULL,
  `category` VARCHAR(100) NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_parts_order_items_order_id` (`order_id`),
  KEY `idx_parts_order_items_part_id` (`part_id`),
  CONSTRAINT `fk_parts_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `parts_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

