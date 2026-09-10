using System;
using MySql.Data.MySqlClient;

namespace Autocount_Sync_Program
{
    public static class CloudTablesInit
    {
        public static void EnsureCloudTablesExist(string serverAddress, string databaseName, string username, string password)
        {
            string connectionString = $"Server={serverAddress};Database={databaseName};User ID={username};Password={password};SslMode=none;";
            try
            {
                using (MySqlConnection conn = new MySqlConnection(connectionString))
                {
                    conn.Open();

                    // Do this first: legacy initialization later in this method may encounter an
                    // older cloud schema, but invoice synchronization must still have this column.
                    EnsureColumnExists(conn, "accounting_invoice_item", "tax_rate",
                        "DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER `tax_code`");

                    // 1. Item table (All 53 columns matching local AutoCount Item schema 1:1)
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `Item` (
                            `ItemCode` VARCHAR(100) NOT NULL PRIMARY KEY,
                            `DocKey` INT NULL,
                            `Description` TEXT NULL,
                            `Desc2` TEXT NULL,
                            `FurtherDescription` TEXT NULL,
                            `ItemGroup` VARCHAR(50) NULL,
                            `ItemType` VARCHAR(50) NULL,
                            `AssemblyCost` DECIMAL(18,4) NULL,
                            `LeadTime` INT NULL,
                            `StockControl` CHAR(1) NULL,
                            `HasSerialNo` CHAR(1) NULL,
                            `HasBatchNo` CHAR(1) NULL,
                            `DutyRate` DECIMAL(18,4) NULL,
                            `TaxCode` VARCHAR(50) NULL,
                            `Note` TEXT NULL,
                            `ImageFileName` VARCHAR(255) NULL,
                            `CostingMethod` VARCHAR(50) NULL,
                            `SalesUOM` VARCHAR(50) NULL,
                            `PurchaseUOM` VARCHAR(50) NULL,
                            `ReportUOM` VARCHAR(50) NULL,
                            `LastModified` DATETIME NULL,
                            `LastModifiedUserID` VARCHAR(50) NULL,
                            `CreatedTimeStamp` DATETIME NULL,
                            `CreatedUserID` VARCHAR(50) NULL,
                            `IsActive` CHAR(1) NULL,
                            `LastUpdate` DATETIME NULL,
                            `SNFormatName` VARCHAR(50) NULL,
                            `IsCalcBonusPoint` CHAR(1) NULL,
                            `MarkupRatio` DECIMAL(18,4) NULL,
                            `HasPromoter` CHAR(1) NULL,
                            `GlobalCode` VARCHAR(100) NULL,
                            `ItemBrand` VARCHAR(50) NULL,
                            `LeadTimeDay` INT NULL,
                            `ExternalLink` VARCHAR(255) NULL,
                            `Discontinued` CHAR(1) NULL,
                            `AutoUOMConversion` CHAR(1) NULL,
                            `BaseUOM` VARCHAR(50) NULL,
                            `BackOrderControl` CHAR(1) NULL,
                            `PurchaseTaxCode` VARCHAR(50) NULL,
                            `TariffCode` VARCHAR(50) NULL,
                            `AutoKey` INT NULL,
                            `Guid` VARCHAR(100) NULL,
                            `ItemClass` VARCHAR(50) NULL,
                            `ItemCategory` VARCHAR(50) NULL,
                            `IsSalesItem` CHAR(1) NULL,
                            `IsPurchaseItem` CHAR(1) NULL,
                            `IsPOSItem` CHAR(1) NULL,
                            `IsRawMaterialItem` CHAR(1) NULL,
                            `IsFinishGoodsItem` CHAR(1) NULL,
                            `MainSupplier` VARCHAR(100) NULL,
                            `Image` LONGBLOB NULL,
                            `Classification` VARCHAR(50) NULL,
                            `MustGenerateEInvoice` CHAR(1) NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2. Debtor table (All 83 columns matching local AutoCount Debtor schema 1:1)
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `Debtor` (
                            `AccNo` VARCHAR(100) NOT NULL PRIMARY KEY,
                            `CompanyName` VARCHAR(255) NULL,
                            `Desc2` TEXT NULL,
                            `RegisterNo` VARCHAR(100) NULL,
                            `Address1` TEXT NULL,
                            `Address2` TEXT NULL,
                            `Address3` TEXT NULL,
                            `Address4` TEXT NULL,
                            `PostCode` VARCHAR(50) NULL,
                            `DeliverAddr1` TEXT NULL,
                            `DeliverAddr2` TEXT NULL,
                            `DeliverAddr3` TEXT NULL,
                            `DeliverAddr4` TEXT NULL,
                            `DeliverPostCode` VARCHAR(50) NULL,
                            `Attention` VARCHAR(100) NULL,
                            `Phone1` VARCHAR(50) NULL,
                            `Phone2` VARCHAR(50) NULL,
                            `Fax1` VARCHAR(50) NULL,
                            `Fax2` VARCHAR(50) NULL,
                            `AreaCode` VARCHAR(50) NULL,
                            `SalesAgent` VARCHAR(50) NULL,
                            `DebtorType` VARCHAR(50) NULL,
                            `NatureOfBusiness` VARCHAR(100) NULL,
                            `WebURL` VARCHAR(255) NULL,
                            `EmailAddress` VARCHAR(255) NULL,
                            `DisplayTerm` VARCHAR(50) NULL,
                            `CreditLimit` DECIMAL(18,4) NULL,
                            `AgingOn` VARCHAR(50) NULL,
                            `StatementType` VARCHAR(50) NULL,
                            `CurrencyCode` VARCHAR(50) NULL,
                            `AllowExceedCreditLimit` CHAR(1) NULL,
                            `Note` TEXT NULL,
                            `ExemptNo` VARCHAR(50) NULL,
                            `ExpiryDate` DATETIME NULL,
                            `PriceCategory` VARCHAR(50) NULL,
                            `TaxCode` VARCHAR(50) NULL,
                            `DiscountPercent` DECIMAL(18,4) NULL,
                            `DetailDiscount` VARCHAR(100) NULL,
                            `LastModified` DATETIME NULL,
                            `LastModifiedUserID` VARCHAR(50) NULL,
                            `CreatedTimeStamp` DATETIME NULL,
                            `CreatedUserID` VARCHAR(50) NULL,
                            `OverdueLimit` DECIMAL(18,4) NULL,
                            `HasBonusPoint` CHAR(1) NULL,
                            `OpeningBonusPoint` DECIMAL(18,4) NULL,
                            `QTBlockStatus` VARCHAR(50) NULL,
                            `SOBlockStatus` VARCHAR(50) NULL,
                            `DOBlockStatus` VARCHAR(50) NULL,
                            `IVBlockStatus` VARCHAR(50) NULL,
                            `CSBlockStatus` VARCHAR(50) NULL,
                            `QTBlockMessage` TEXT NULL,
                            `SOBlockMessage` TEXT NULL,
                            `DOBlockMessage` TEXT NULL,
                            `IVBlockMessage` TEXT NULL,
                            `CSBlockMessage` TEXT NULL,
                            `ExternalLink` VARCHAR(255) NULL,
                            `IsGroupCompany` CHAR(1) NULL,
                            `IsActive` CHAR(1) NULL,
                            `LastUpdate` DATETIME NULL,
                            `ContactInfo` TEXT NULL,
                            `AccountGroup` VARCHAR(50) NULL,
                            `MarkupRatio` DECIMAL(18,4) NULL,
                            `CalcDiscountOnUnitPrice` CHAR(1) NULL,
                            `GSTStatusVerifiedDate` DATETIME NULL,
                            `InclusiveTax` CHAR(1) NULL,
                            `RoundingMethod` VARCHAR(50) NULL,
                            `IsTaxRegistered` CHAR(1) NULL,
                            `WithholdingTaxCode` VARCHAR(50) NULL,
                            `SelfBilledApprovalNo` VARCHAR(100) NULL,
                            `AutoKey` INT NULL,
                            `Guid` VARCHAR(100) NULL,
                            `MultiPrice` VARCHAR(50) NULL,
                            `AllowChangeMultiPrice` CHAR(1) NULL,
                            `Mobile` VARCHAR(50) NULL,
                            `CGBlockStatus` VARCHAR(50) NULL,
                            `CGBlockMessage` TEXT NULL,
                            `WithholdingVATCode` VARCHAR(50) NULL,
                            `TaxEntityID` VARCHAR(50) NULL,
                            `GenerateLinkResultJson` TEXT NULL,
                            `IsCashSaleDebtor` CHAR(1) NULL,
                            `DoNotSubmitEInvoice` CHAR(1) NULL,
                            `SGEInvoicePeppolID` VARCHAR(100) NULL,
                            `SGEInvoiceBusinessUnit` VARCHAR(100) NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2b. Creditor supplier master (AutoCount -> cloud, read-only source)
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `Creditor` (
                            `AccNo` VARCHAR(100) NOT NULL PRIMARY KEY,
                            `CompanyName` VARCHAR(255) NULL,
                            `Desc2` TEXT NULL,
                            `RegisterNo` VARCHAR(100) NULL,
                            `Address1` TEXT NULL,
                            `Address2` TEXT NULL,
                            `Address3` TEXT NULL,
                            `Address4` TEXT NULL,
                            `PostCode` VARCHAR(50) NULL,
                            `Attention` VARCHAR(100) NULL,
                            `Phone1` VARCHAR(50) NULL,
                            `Phone2` VARCHAR(50) NULL,
                            `Fax1` VARCHAR(50) NULL,
                            `Fax2` VARCHAR(50) NULL,
                            `AreaCode` VARCHAR(50) NULL,
                            `PurchaseAgent` VARCHAR(50) NULL,
                            `CreditorType` VARCHAR(50) NULL,
                            `NatureOfBusiness` VARCHAR(100) NULL,
                            `WebURL` VARCHAR(255) NULL,
                            `EmailAddress` VARCHAR(255) NULL,
                            `DisplayTerm` VARCHAR(50) NULL,
                            `CreditLimit` DECIMAL(18,4) NULL,
                            `AgingOn` VARCHAR(50) NULL,
                            `CurrencyCode` VARCHAR(50) NULL,
                            `AllowExceedCreditLimit` CHAR(1) NULL,
                            `Note` TEXT NULL,
                            `TaxCode` VARCHAR(50) NULL,
                            `DiscountPercent` DECIMAL(18,4) NULL,
                            `LastModified` DATETIME NULL,
                            `LastModifiedUserID` VARCHAR(50) NULL,
                            `CreatedTimeStamp` DATETIME NULL,
                            `CreatedUserID` VARCHAR(50) NULL,
                            `IsActive` CHAR(1) NULL,
                            `LastUpdate` DATETIME NULL,
                            `ContactInfo` TEXT NULL,
                            `AccountGroup` VARCHAR(50) NULL,
                            `InclusiveTax` CHAR(1) NULL,
                            `RoundingMethod` VARCHAR(50) NULL,
                            `IsTaxRegistered` CHAR(1) NULL,
                            `WithholdingTaxCode` VARCHAR(50) NULL,
                            `SelfBilledApprovalNo` VARCHAR(100) NULL,
                            `AutoKey` INT NULL,
                            `Guid` VARCHAR(100) NULL,
                            `Mobile` VARCHAR(50) NULL,
                            `TaxEntityID` VARCHAR(50) NULL,
                            `DoNotSubmitEInvoice` CHAR(1) NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 2c. AutoCount Project master used for vehicle / asset mapping
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `autocount_project` (
                            `project_no` VARCHAR(60) NOT NULL PRIMARY KEY,
                            `description` VARCHAR(255) NULL,
                            `debtor_code` VARCHAR(40) NULL,
                            `is_active` CHAR(1) DEFAULT 'T',
                            `last_sync_at` DATETIME NULL,
                            KEY `idx_autocount_project_debtor` (`debtor_code`),
                            KEY `idx_autocount_project_active` (`is_active`)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3. autocount_sync_from_log table
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `autocount_sync_from_log` (
                            `asfl_id` INT AUTO_INCREMENT PRIMARY KEY,
                            `asfl_type` VARCHAR(50) NULL,
                            `asfl_from_code` VARCHAR(100) NULL,
                            `asfl_to_code` VARCHAR(100) NULL,
                            `asfl_status` VARCHAR(50) NULL,
                            `asfl_remark` TEXT NULL,
                            `autokey` VARCHAR(100) NULL,
                            `customer_account_book` VARCHAR(100) NULL,
                            `asfl_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 3b. autocount_sync_to_log table (cloud -> AutoCount direction)
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `autocount_sync_to_log` (
                            `astl_id` INT AUTO_INCREMENT PRIMARY KEY,
                            `astl_type` VARCHAR(50) NULL,
                            `astl_from_code` VARCHAR(100) NULL,
                            `astl_to_code` VARCHAR(100) NULL,
                            `astl_status` VARCHAR(50) NULL,
                            `astl_ex_message` TEXT NULL,
                            `astl_remark` TEXT NULL,
                            `customer_account_book` VARCHAR(100) NULL,
                            `astl_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 4. customer_cat table
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `customer_cat` (
                            `customer_cat_id` INT AUTO_INCREMENT PRIMARY KEY,
                            `customer_cat_name` VARCHAR(100) NULL,
                            `customer_cat_accountBook` VARCHAR(100) NULL,
                            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // 5. company table
                    using (MySqlCommand cmd = new MySqlCommand(@"
                        CREATE TABLE IF NOT EXISTS `company` (
                            `company_id` INT AUTO_INCREMENT PRIMARY KEY,
                            `company_name` VARCHAR(100) NULL,
                            `company_short_code` VARCHAR(50) UNIQUE NULL,
                            `company_accountBook` VARCHAR(100) NULL,
                            `company_country` VARCHAR(50) NULL,
                            `UserIDAutocount` VARCHAR(50) NULL,
                            `PasswdAutocount` VARCHAR(50) NULL,
                            `telegramgroupid1` VARCHAR(50) NULL,
                            `telegramgroupid2` VARCHAR(50) NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Only seed the legacy company layout. The MAW Admin Panel uses id/name and
                    // must not receive this obsolete synchronization-program row.
                    if (ColumnExists(conn, "company", "company_name") &&
                        ColumnExists(conn, "company", "company_short_code"))
                    {
                        using (MySqlCommand cmd = new MySqlCommand(@"
                            INSERT IGNORE INTO `company` (`company_name`, `company_short_code`, `company_accountBook`, `company_country`) VALUES
                            ('GENERAL', 'Autocount_Sync_Program', 'AED_Testing', 'Singapore');", conn))
                        {
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("CloudTablesInit error: " + ex.Message);
            }
        }

        private static void EnsureColumnExists(
            MySqlConnection conn,
            string tableName,
            string columnName,
            string definition)
        {
            using (MySqlCommand tableCommand = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName", conn))
            {
                tableCommand.Parameters.AddWithValue("@tableName", tableName);
                if (Convert.ToInt32(tableCommand.ExecuteScalar()) == 0)
                {
                    return;
                }
            }

            using (MySqlCommand columnCommand = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName", conn))
            {
                columnCommand.Parameters.AddWithValue("@tableName", tableName);
                columnCommand.Parameters.AddWithValue("@columnName", columnName);
                if (Convert.ToInt32(columnCommand.ExecuteScalar()) > 0)
                {
                    return;
                }
            }

            // Names and definition are internal constants supplied by this initializer.
            string safeTableName = tableName.Replace("`", "``");
            string safeColumnName = columnName.Replace("`", "``");
            using (MySqlCommand alterCommand = new MySqlCommand(
                "ALTER TABLE `" + safeTableName + "` ADD COLUMN `" + safeColumnName + "` " + definition, conn))
            {
                alterCommand.ExecuteNonQuery();
            }
        }

        private static bool ColumnExists(MySqlConnection conn, string tableName, string columnName)
        {
            using (MySqlCommand command = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName", conn))
            {
                command.Parameters.AddWithValue("@tableName", tableName);
                command.Parameters.AddWithValue("@columnName", columnName);
                return Convert.ToInt32(command.ExecuteScalar()) > 0;
            }
        }
    }
}
