-- Vehicle verification workflow.
-- Existing vehicles are treated as approved; Customer App submissions set pending.

ALTER TABLE `customer_vehicle`
  ADD COLUMN IF NOT EXISTS `verification_status` VARCHAR(30) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS `rejection_reason` VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS `reviewed_by` INT NULL,
  ADD COLUMN IF NOT EXISTS `reviewed_at` DATETIME NULL,
  ADD COLUMN IF NOT EXISTS `created_source` VARCHAR(30) NOT NULL DEFAULT 'admin_panel';

ALTER TABLE `customer_notification`
  ADD COLUMN IF NOT EXISTS `company_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `customer_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `related_record_type` VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS `related_record_id` VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS `action_route` VARCHAR(255) NULL;

UPDATE `customer_vehicle`
SET `verification_status` = 'pending',
    `created_source` = 'customer_app'
WHERE `status` = 'Pending Verification';
