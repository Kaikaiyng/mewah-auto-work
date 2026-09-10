-- 038_job_actual_issue.sql
-- Add actual_issue column to job table to record technician diagnosis and inspection findings

ALTER TABLE `job`
  ADD COLUMN IF NOT EXISTS `actual_issue` TEXT NULL DEFAULT NULL AFTER `reported_problem`;
