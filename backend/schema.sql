-- Mewah Auto Work System Database Schema
-- Target Database: example_workshop

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `booking_items`;
DROP TABLE IF EXISTS `bookings`;
DROP TABLE IF EXISTS `spare_parts`;
DROP TABLE IF EXISTS `vehicles`;
DROP TABLE IF EXISTS `company_driver`;
DROP TABLE IF EXISTS `admin_users`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 0. Admin Users Table
CREATE TABLE `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `role` ENUM('superadmin', 'admin') NOT NULL DEFAULT 'admin',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. Users Table
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `phone` VARCHAR(30) NOT NULL,
  `password` VARCHAR(255) NOT NULL, -- To be hashed
  `role` ENUM('customer', 'admin', 'mechanic') NOT NULL DEFAULT 'customer',
  `company_user_role` VARCHAR(30) NOT NULL DEFAULT 'Company User',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `delivery_addresses` TEXT NULL,   -- JSON string storing list of delivery addresses
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Drivers are operational profiles only. They do not have login credentials.
CREATE TABLE `company_driver` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `licence_no` VARCHAR(100) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
  `notes` VARCHAR(500) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_company_driver_company_status` (`company_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Vehicles Table
CREATE TABLE `vehicles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `company_id` INT NULL,
  `assigned_driver_id` INT NULL,
  `driver_profile_id` INT NULL,
  `vec_no` VARCHAR(50) NULL,        -- Optional legacy Unit / Fleet Number
  `reg_no` VARCHAR(50) NOT NULL UNIQUE, -- Registration/Plate Number (e.g. DEMO001)
  `equipment` VARCHAR(100) NULL,    -- Trailer Type (e.g. 40's Trailer)
  `brand` VARCHAR(50) NOT NULL,     -- Brand (e.g. Volvo)
  `model` VARCHAR(50) NOT NULL,     -- Model (e.g. CX-20)
  `mileage` INT NOT NULL DEFAULT 0,
  `last_service_date` DATE NULL,
  `last_service_mileage` INT UNSIGNED NULL,
  `next_service_date` DATE NULL,
  `next_service_mileage` INT UNSIGNED NULL,
  `year` INT NOT NULL,
  `chassis_no` VARCHAR(100) NULL,
  `engine_no` VARCHAR(100) NULL,
  `container_length` VARCHAR(30) NULL,
  `axle_configuration` VARCHAR(30) NULL,
  `insurance_expiry` DATE NULL,
  `road_tax_expiry` DATE NULL,
  `puspakom_expiry` DATE NULL,
  `vehicle_status` VARCHAR(30) NOT NULL DEFAULT 'Active',
  `verification_status` VARCHAR(30) NOT NULL DEFAULT 'approved',
  `rejection_reason` VARCHAR(500) NULL,
  `reviewed_by` INT NULL,
  `reviewed_at` DATETIME NULL,
  `created_source` VARCHAR(30) NOT NULL DEFAULT 'admin_panel',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Spare Parts Table
CREATE TABLE `spare_parts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `sku` VARCHAR(50) NULL UNIQUE,
  `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `stock` INT NOT NULL DEFAULT 0,
  `low_stock_threshold` INT NOT NULL DEFAULT 10,
  `supplier` VARCHAR(150) NULL,
  `image_url` VARCHAR(255) NULL,
  `in_stock` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bookings & Orders Table
CREATE TABLE `bookings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `booking_number` VARCHAR(50) NOT NULL UNIQUE,
  `invoice_number` VARCHAR(50) NULL UNIQUE,
  `order_type` ENUM('service', 'parts') NOT NULL DEFAULT 'service',
  `user_id` INT NOT NULL,
  `created_by_company_user_id` INT NULL,
  `vehicle_id` INT NULL, -- NULL if order_type = 'parts'
  `service_type` VARCHAR(100) NULL, -- e.g. Maintenance or Repair
  `service_date` DATETIME NOT NULL,
  `service_centre` VARCHAR(255) NOT NULL,
  `status` ENUM('pending', 'upcoming', 'in_progress', 'completed', 'cancelled', 'ready') NOT NULL DEFAULT 'pending',
  `total_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `reported_problem` TEXT NULL,
  `mechanic_notes` TEXT NULL,
  `delivery_address` TEXT NULL,
  `staff_id` INT NULL,
  `technician` VARCHAR(100) NULL,
  `payment_status` ENUM('paid', 'unpaid') NOT NULL DEFAULT 'unpaid',
  `payment_method` VARCHAR(50) NULL,
  `labor_cost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `tax` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Booking/Order Items Table (for parts lists or invoice breakdown)
CREATE TABLE `booking_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `booking_id` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `category` ENUM('part', 'service') NOT NULL DEFAULT 'part',
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Notifications Table
CREATE TABLE `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` ENUM('reminder', 'booking', 'parts', 'system') NOT NULL DEFAULT 'system',
  `channel` VARCHAR(50) NOT NULL DEFAULT 'Push Notification',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ==========================================
-- Insert Mock Data
-- ==========================================

-- Insert Admin User (username: superadmin, password: DEMO-ONLY-NOT-A-SECRET)
-- No account, credential, customer, or operational seed data is distributed.
