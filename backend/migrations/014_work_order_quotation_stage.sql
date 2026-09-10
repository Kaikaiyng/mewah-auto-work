-- Add the quotation lifecycle milestone between inspection and approval.
-- Non-destructive and safe to run more than once.

SET @job_exists = EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'job'
);

SET @add_quotation_issued_at = IF(
  @job_exists = 1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'job' AND column_name = 'quotation_issued_at'
  ),
  'ALTER TABLE `job` ADD COLUMN `quotation_issued_at` DATETIME NULL',
  'SELECT 1'
);
PREPARE add_quotation_issued_at_statement FROM @add_quotation_issued_at;
EXECUTE add_quotation_issued_at_statement;
DEALLOCATE PREPARE add_quotation_issued_at_statement;

SELECT IF(@job_exists = 1, 'Quotation lifecycle stage is ready.', 'job table not found.') AS migration_result;
