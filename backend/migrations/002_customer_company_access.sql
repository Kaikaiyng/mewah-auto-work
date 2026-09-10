-- Customer application company access and notification metadata.
-- Review against the selected non-production database before running.
-- No data is copied from another environment.

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `company_id` INT NULL AFTER `id`,
  ADD COLUMN IF NOT EXISTS `contact_role` VARCHAR(50) NOT NULL DEFAULT 'Company Contact' AFTER `role`,
  ADD COLUMN IF NOT EXISTS `preferred_language` VARCHAR(10) NOT NULL DEFAULT 'en' AFTER `contact_role`,
  ADD INDEX IF NOT EXISTS `idx_users_company_id` (`company_id`);

ALTER TABLE `vehicles`
  ADD COLUMN IF NOT EXISTS `company_id` INT NULL AFTER `user_id`,
  ADD COLUMN IF NOT EXISTS `last_service_date` DATE NULL AFTER `mileage`,
  ADD COLUMN IF NOT EXISTS `last_service_mileage` INT NULL AFTER `last_service_date`,
  ADD COLUMN IF NOT EXISTS `next_service_date` DATE NULL AFTER `last_service_mileage`,
  ADD COLUMN IF NOT EXISTS `next_service_mileage` INT NULL AFTER `next_service_date`,
  ADD INDEX IF NOT EXISTS `idx_vehicles_company_id` (`company_id`);

ALTER TABLE `notifications`
  ADD COLUMN IF NOT EXISTS `company_id` INT NULL AFTER `user_id`,
  ADD COLUMN IF NOT EXISTS `related_record_type` VARCHAR(40) NULL AFTER `type`,
  ADD COLUMN IF NOT EXISTS `related_record_id` VARCHAR(50) NULL AFTER `related_record_type`,
  ADD COLUMN IF NOT EXISTS `action_route` VARCHAR(255) NULL AFTER `related_record_id`,
  ADD INDEX IF NOT EXISTS `idx_notifications_company_read` (`company_id`, `is_read`);

ALTER TABLE `job`
  ADD COLUMN IF NOT EXISTS `customer_visible_update` TEXT NULL AFTER `status`;

-- Backfill within the same database only. Review unmatched rows before enforcing NOT NULL.
UPDATE `vehicles` v
JOIN `users` u ON u.id = v.user_id
SET v.company_id = u.company_id
WHERE v.company_id IS NULL AND u.company_id IS NOT NULL;

UPDATE `notifications` n
JOIN `users` u ON u.id = n.user_id
SET n.company_id = u.company_id
WHERE n.company_id IS NULL AND u.company_id IS NOT NULL;
