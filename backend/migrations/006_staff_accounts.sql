-- Non-destructive Staff account fields for Admin Panel login and assignment.
-- Existing Staff records are preserved. Existing NULL values must be completed
-- through Edit Staff before those accounts can sign in.

CREATE TABLE IF NOT EXISTS `staff` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(254) NULL,
  `phone` VARCHAR(30) NULL,
  `maw_role` VARCHAR(40) NOT NULL DEFAULT 'Technician',
  `maw_status` VARCHAR(20) NOT NULL DEFAULT 'Active',
  `password` VARCHAR(255) NULL,
  `last_login_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @add_staff_email = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'staff' AND column_name = 'email'
  ),
  'ALTER TABLE `staff` ADD COLUMN `email` VARCHAR(254) NULL',
  'SELECT 1'
);
PREPARE add_staff_email_statement FROM @add_staff_email;
EXECUTE add_staff_email_statement;
DEALLOCATE PREPARE add_staff_email_statement;

SET @add_staff_phone = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'staff' AND column_name = 'phone'
  ),
  'ALTER TABLE `staff` ADD COLUMN `phone` VARCHAR(30) NULL',
  'SELECT 1'
);
PREPARE add_staff_phone_statement FROM @add_staff_phone;
EXECUTE add_staff_phone_statement;
DEALLOCATE PREPARE add_staff_phone_statement;

SET @add_staff_role = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'staff'
      AND column_name IN ('role', 'position', 'type', 'designation', 'job_title', 'maw_role')
  ),
  'ALTER TABLE `staff` ADD COLUMN `maw_role` VARCHAR(40) NOT NULL DEFAULT ''Technician''',
  'SELECT 1'
);
PREPARE add_staff_role_statement FROM @add_staff_role;
EXECUTE add_staff_role_statement;
DEALLOCATE PREPARE add_staff_role_statement;

SET @add_staff_status = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'staff'
      AND column_name IN ('status', 'active', 'is_active', 'current_status', 'currentStatus', 'maw_status')
  ),
  'ALTER TABLE `staff` ADD COLUMN `maw_status` VARCHAR(20) NOT NULL DEFAULT ''Active''',
  'SELECT 1'
);
PREPARE add_staff_status_statement FROM @add_staff_status;
EXECUTE add_staff_status_statement;
DEALLOCATE PREPARE add_staff_status_statement;

SET @add_staff_password = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'staff' AND column_name IN ('password', 'password_hash')
  ),
  'ALTER TABLE `staff` ADD COLUMN `password` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE add_staff_password_statement FROM @add_staff_password;
EXECUTE add_staff_password_statement;
DEALLOCATE PREPARE add_staff_password_statement;

SET @add_staff_last_login = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'staff' AND column_name = 'last_login_at'
  ),
  'ALTER TABLE `staff` ADD COLUMN `last_login_at` DATETIME NULL',
  'SELECT 1'
);
PREPARE add_staff_last_login_statement FROM @add_staff_last_login;
EXECUTE add_staff_last_login_statement;
DEALLOCATE PREPARE add_staff_last_login_statement;
