-- Persist Company User login status instead of inferring it from booking activity.

SET @add_customer_is_active = IF(
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'customer'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'customer' AND column_name = 'is_active'
  ),
  'ALTER TABLE `customer` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE add_customer_is_active_statement FROM @add_customer_is_active;
EXECUTE add_customer_is_active_statement;
DEALLOCATE PREPARE add_customer_is_active_statement;

SET @add_users_is_active = IF(
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'is_active'
  ),
  'ALTER TABLE `users` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE add_users_is_active_statement FROM @add_users_is_active;
EXECUTE add_users_is_active_statement;
DEALLOCATE PREPARE add_users_is_active_statement;
