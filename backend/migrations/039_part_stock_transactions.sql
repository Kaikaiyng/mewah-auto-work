-- Migration 039: Part Stock Transactions (Inventory Movement Ledger) & Supplier Purchase History
-- Records immutable stock movements for auditability, AutoCount Stock Card reconciliation, and multi-supplier purchase history.

CREATE TABLE IF NOT EXISTS `part_stock_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `part_id` BIGINT UNSIGNED NOT NULL,
  
  -- Transaction categorization
  `transaction_type` VARCHAR(32) NOT NULL, -- 'po_receive', 'wo_issue', 'sales_do', 'job_return', 'stock_adjustment'
  `doc_type` VARCHAR(24) NOT NULL,          -- 'PO', 'WO', 'DO', 'ADJ', 'MANUAL'
  `doc_id` BIGINT NULL,
  `doc_no` VARCHAR(60) NOT NULL DEFAULT '', -- e.g. 'PO-2026-0038', 'WO-1088', 'DO-0052'
  
  -- Counterpart details
  `party_code` VARCHAR(50) NULL,            -- Supplier Creditor Code or Customer Debtor Code
  `party_name` VARCHAR(150) NULL,           -- Supplier Name or Vehicle Plate / Customer Name
  
  -- Quantities and Financials
  `quantity_change` DECIMAL(12,2) NOT NULL, -- Positive for IN (+), negative for OUT (-)
  `balance_after` DECIMAL(12,2) NOT NULL,   -- Resulting stock balance after this transaction
  `unit_cost` DECIMAL(14,2) NULL,           -- Unit cost / purchase price at time of transaction
  
  -- Audit trail and remarks
  `notes` VARCHAR(500) NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  KEY `idx_part_stock_trans_part` (`part_id`, `created_at`),
  KEY `idx_part_stock_trans_doc` (`doc_type`, `doc_id`),
  KEY `idx_part_stock_trans_doc_no` (`doc_no`),
  KEY `idx_part_stock_trans_party` (`party_code`),
  KEY `idx_part_stock_trans_type` (`transaction_type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
