-- Migration 001: Phase 1 Schema Extensions & Indexes
-- This script adds the required fields, indexes, and safely backfills existing jobs.

-- 1. Extend job table
ALTER TABLE `job`
  ADD COLUMN `work_order_no` VARCHAR(30) UNIQUE DEFAULT NULL AFTER `id`,
  ADD COLUMN `bay` VARCHAR(50) DEFAULT NULL AFTER `service_id`,
  ADD COLUMN `priority` VARCHAR(20) DEFAULT 'Normal' AFTER `bay`,
  ADD COLUMN `source_booking_id` BIGINT UNIQUE DEFAULT NULL AFTER `company_id`,
  ADD COLUMN `created_by` INT DEFAULT NULL AFTER `source_booking_id`,
  ADD COLUMN `updated_by` INT DEFAULT NULL AFTER `created_by`;

-- 2. Extend customer table
ALTER TABLE `customer`
  ADD COLUMN `type` VARCHAR(30) DEFAULT 'Unclassified' AFTER `company_id`;

-- 3. Create performance query indexes
CREATE INDEX `idx_job_company_id` ON `job` (`company_id`);
CREATE INDEX `idx_job_vehicle_id` ON `job` (`vehicle_id`);
CREATE INDEX `idx_job_status` ON `job` (`status`);
CREATE INDEX `idx_customer_type` ON `customer` (`type`);

-- 4. Safe backfill for existing jobs (guards against zero-date conversions)
UPDATE `job` 
  SET `work_order_no` = CONCAT(
    'WO-', 
    YEAR(CASE WHEN created_at IS NOT NULL AND created_at > '1970-01-01 00:00:00' THEN created_at WHEN scheduled_at IS NOT NULL AND scheduled_at > '1970-01-01' THEN scheduled_at ELSE CURDATE() END),
    '-', 
    LPAD(id, 6, '0')
  ) 
  WHERE `work_order_no` IS NULL;
