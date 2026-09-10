using AutoCount.ARAP;
using AutoCount.Controls;
using AutoCount.Data;
using AutoCount.Data.EntityFramework;
using AutoCount.Invoicing;
using AutoCount.Invoicing.Sales.Invoice;
using AutoCount.RegistryID.AccountBookControl;
using AutoCount.RegistryID.PrimaryKeyID;
using AutoCount.Stock;
using AutoCount.Stock.Item.ItemUC;
using AutoCount.UDF;
using MySql.Data.MySqlClient;
using Mysqlx.Crud;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Autocount_Sync_Program.Utils;
using static Microsoft.EntityFrameworkCore.DbLoggerCategory.Database;
using static System.Windows.Forms.VisualStyles.VisualStyleElement.ListView;
using static System.Windows.Forms.VisualStyles.VisualStyleElement.StartPanel;

namespace Autocount_Sync_Program
{
    public partial class FormMain : Form
    {

        private ThreadObj myThreadObj = new ThreadObj();
        private Thread myThread;

        //Initial Setting
        private int demo_data = 0; // DEMO,  1 is demo, 0 not demo,
        private string MasterCompanyCode = "Autocount_Sync_Program";
        private string UploadPdfInvoiceLink = Environment.GetEnvironmentVariable("MAW_PDF_UPLOAD_URL") ?? "";
        private string AutoCountSyncToken = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_SYNC_TOKEN") ?? "";
        public static string TelegramBotToken = Environment.GetEnvironmentVariable("MAW_TELEGRAM_BOT_TOKEN") ?? "";
        public static string TelegramSystemProblemChatId = Environment.GetEnvironmentVariable("MAW_TELEGRAM_SYSTEM_PROBLEM_CHAT_ID") ?? "";
        public static string TelegramNewCustomerRegisterChatId = Environment.GetEnvironmentVariable("MAW_TELEGRAM_NEW_CUSTOMER_CHAT_ID") ?? "";

        // Thread-safe Local MSSQL connection settings
        private string localServer = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_SERVER") ?? "localhost";
        private string localInstance = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_INSTANCE") ?? "";
        private int localPort = 0;

        private string localDBName = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_DATABASE") ?? "";
        private string localSaUsername = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_SA_USER") ?? "sa";
        private string localSaPassword = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_SA_PASSWORD") ?? "";
        private string localUserID = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_USER") ?? "";
        private string localPassword = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_PASSWORD") ?? "";
       
        //General Setting
        private string system_problem_telegram_id = "-";
        private string newcustomerregister_telegram_id = "-";        
        private string company_country = "Malaysia";    
        private string serverAddress = Environment.GetEnvironmentVariable("MAW_CLOUD_DB_HOST") ?? "";
        private string cloudServer = Environment.GetEnvironmentVariable("MAW_CLOUD_DB_SERVER") ?? "";
        private string databaseName = Environment.GetEnvironmentVariable("MAW_CLOUD_DB_NAME") ?? "";
        private string username = Environment.GetEnvironmentVariable("MAW_CLOUD_DB_USER") ?? "";
        private string password = Environment.GetEnvironmentVariable("MAW_CLOUD_DB_PASSWORD") ?? "";
        private string ReportTemplate = Environment.GetEnvironmentVariable("MAW_AUTOCOUNT_REPORT_TEMPLATE") ?? "";
        private string InvoiceExportDirectory = Environment.GetEnvironmentVariable("MAW_INVOICE_EXPORT_DIR") ?? "";
        private string CompanyShortCode = Environment.GetEnvironmentVariable("MAW_COMPANY_SHORT_CODE") ?? "";
        private string DebtorStatementTemplate = "-";
        private string defaultcustomergroupid = "1";

        private void InitializeAutoCountVersion()
        {
            try
            {
                string version = "2.2.26"; // Fallback default
                try
                {
                    var asm = Assembly.GetAssembly(typeof(AutoCount.Authentication.UserSession));
                    if (asm != null)
                    {
                        var verInfo = System.Diagnostics.FileVersionInfo.GetVersionInfo(asm.Location);
                        if (verInfo != null && !string.IsNullOrEmpty(verInfo.FileVersion))
                        {
                            version = verInfo.FileVersion;
                        }
                    }
                }
                catch { }

                var pvType = typeof(AutoCount.Application.ProductVersion);
                if (pvType != null)
                {
                    var fieldFull = pvType.GetField("myFullProductVersion", BindingFlags.Static | BindingFlags.NonPublic);
                    if (fieldFull != null)
                    {
                        fieldFull.SetValue(null, version);
                    }
                    
                    var fieldPlug = pvType.GetField("myPlugInProductVersion", BindingFlags.Static | BindingFlags.NonPublic);
                    if (fieldPlug != null)
                    {
                        fieldPlug.SetValue(null, version);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Failed to initialize AutoCount version: " + ex.Message);
            }
        }

        private void StartTest(object threadObj)
        {
            ThreadObj thread;
            if (threadObj != null && threadObj is ThreadObj)
            {
                thread = threadObj as ThreadObj;
            }
            else
            {
                return;
            }

            //Start Set Autocount
            AutoCount.Authentication.UserSession userSession;
            AutoCount.MainEntry.Startup startup = new AutoCount.MainEntry.Startup();
            string countrycode = company_country;

            //Step 1 : Create UserSession, Login to MSSQL
            thread.WriteInfo("=====PHASE 1: Login to SQL Server=====");
            userSession = TestCreateUserSession(localSaPassword, localDBName, thread);
            
            if (userSession != null)
            {                
                //Step 2 : Log in to the AutoCount account book for read-only synchronization
                thread.WriteInfo("=====PHASE 2 Login to Account Book (Read Only)=====");
                if (TestLoginToAutoCountAccounting(localUserID, localPassword, localDBName, userSession, thread))
                {
                    CloudTablesInit.EnsureCloudTablesExist(serverAddress, databaseName, username, password);

                    //Step 3 : Push the whole local Debtor table up to the cloud
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 3 Synchronize Debtor to Cloud=====");
                    DebtorSynchronization(userSession, thread);

                    //Step 4 : Push the whole local Item table up to the cloud
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 4 Synchronize Item to Cloud=====");
                    ItemSynchronization(userSession, thread);

                    //Step 5 : Read the current AutoCount stock balance and update Parts Inventory
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 5 Synchronize Stock Balance to Cloud=====");
                    StockBalanceSynchronization(userSession, thread);

                    //Step 6 : Push the whole local Creditor (supplier) table up to the cloud
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 6 Synchronize Creditor to Cloud=====");
                    CreditorSynchronization(userSession, thread);

                    //Step 7 : Read AutoCount Project master and link exact vehicle numbers
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 7 Synchronize Project / Vehicle Mapping to Cloud=====");
                    ProjectVehicleSynchronization(userSession, thread);

                    //Step 8 : Read formal AutoCount Sales Invoice headers into MAW
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 8 Synchronize Sales Invoice Headers to Cloud=====");
                    SalesInvoiceHeaderSynchronization(userSession, thread);

                    //Step 9 : Read formal AutoCount Sales Invoice details into MAW
                    thread.WriteInfo("");
                    thread.WriteInfo("=====PHASE 9 Synchronize Sales Invoice Details to Cloud=====");
                    SalesInvoiceDetailSynchronization(userSession, thread);

                    //Step 10 : Pull locked draft invoices down and post them as Sales Invoices
                    // Disabled: this direction writes into AutoCount and is intentionally not part
                    // of the current read-only integration.
                   // thread.WriteInfo("");
                   // thread.WriteInfo("=====PHASE 10 Synchronize Sales Invoice to AutoCount=====");
                   // SalesInvoiceSynchronization(userSession, thread);
                }
            }

            thread.WriteInfo("");
            thread.WriteInfo("=====Synchronization Completed.=====");
          //  System.Windows.Forms.Application.Exit();
        }







        //Initial------------------------------------------------------------------
        #region Thread methods
        private void InitThreadObjectInvoke(Action<int, bool> setItemChecked, Action<string> addMessage)
        {
            void InvokeTest(Action<bool> threadAct, bool b, int idx)
            {
                if (InvokeRequired)
                {
                    Invoke(new Action<bool>(threadAct), b);
                    return;
                }
                setItemChecked(idx, b);
                Thread.Sleep(500);
            }
            myThreadObj.WriteInfo = (s) =>
            {
                if (InvokeRequired)
                {
                    Invoke(new Action<string>(myThreadObj.WriteInfo), s);
                    return;
                }
                addMessage(s);
                Thread.Sleep(500);
            };
            myThreadObj.WriteErrorStop = () =>
            {
                if (InvokeRequired)
                {
                    Invoke(new Action(myThreadObj.WriteErrorStop));
                    return;
                }
                addMessage("Fail to establish connection to");
                addMessage("\tAutoCount Accounting.");
            };

            myThreadObj.SetTestOne = (b) => InvokeTest(myThreadObj.SetTestOne, b, 0);
            myThreadObj.SetTestTwo = (b) => InvokeTest(myThreadObj.SetTestTwo, b, 1);
            myThreadObj.SetTestThree = (b) => InvokeTest(myThreadObj.SetTestThree, b, 2);
            myThreadObj.SetTestFour = (b) => InvokeTest(myThreadObj.SetTestFour, b, 3);
            myThreadObj.SetTestFive = (b) => InvokeTest(myThreadObj.SetTestFive, b, 4);
            myThreadObj.SetTestSix = (b) => InvokeTest(myThreadObj.SetTestSix, b, 5);
        }
        #endregion

        public FormMain()
        {
            InitializeComponent();
            InitializeAutoCountVersion();
            Control.CheckForIllegalCrossThreadCalls = false;
            System.Net.ServicePointManager.SecurityProtocol |=
            System.Net.SecurityProtocolType.Tls | System.Net.SecurityProtocolType.Tls11 | System.Net.SecurityProtocolType.Tls12;
            this.Text = string.Format("{0} - {1}", "AutoCount Synchronization", App.GetVersion());
            InitThreadObjectInvoke(chkListStatus.SetItemChecked, (s) => listBoxMessage.Items.Add(s));

            testinglabel.Visible = (demo_data == 1);

            textServer.Text = localServer;
            textInstance.Text = localInstance;
            textPort.Text = localPort.ToString();
            textDBName.Text = localDBName;
            chkDefaultSA.Checked = false;
            textSAUser.Text = localSaUsername;
            textSAPassword.Text = localSaPassword;
            textUserID.Text = localUserID;
            textPassword.Text = localPassword;

            if (chkListStatus.Items.Count == 0)
            {
                chkListStatus.Items.AddRange(TestStatus.Items);
            }

            myThread = new Thread(new ParameterizedThreadStart(StartTest)); // Start the test when run to this part.
            myThread.Start(myThreadObj);
        }
     
        #region button events
        private void btnTestConnection_Click(object sender, EventArgs e)    // "Start" button event.
        {
            if (myThread != null && myThread.IsAlive)
            {
                listBoxMessage.Items.Add("Synchronization is already running.");
                return;
            }

            listBoxMessage.Items.Clear();

            for (int i = 0; i < chkListStatus.Items.Count; i++)
            {
                chkListStatus.SetItemChecked(i, false);
            }
            myThread = new Thread(new ParameterizedThreadStart(StartTest));
            myThread.Start(myThreadObj);
        }

        private void btnExit_Click(object sender, EventArgs e)  // "Exit" button event.
        {
            if (myThread != null && myThread.IsAlive)
            {
                myThread.Abort();
                myThread = null;
            }
            this.Close();
        }

        #endregion
        #region Checkbox event
        private void chkDefaultSA_CheckedChanged(object sender, EventArgs e)
        {
            groupBoxSA.Enabled = !chkDefaultSA.Checked;
        }
        #endregion
        //Test 1
        private AutoCount.Authentication.UserSession TestCreateUserSession(string saPassword, string dbName, ThreadObj callbackObj)
        {
            SqlConnect sqlConnect = new SqlConnect();
            string serverName = sqlConnect.GetServerName(localServer, localInstance, localPort.ToString());

            //Connection info
            callbackObj.WriteInfo(string.Format("Create UserSession to server '{0}'", serverName));
            callbackObj.WriteInfo(string.Format("Database name is '{0}'", dbName));
            AutoCount.Authentication.UserSession userSession = sqlConnect.GetUserSession(serverName, dbName, saPassword);
            //AutoCount.Authentication.UserSession userSession = AutoCount.MainEntry.Startup.Default.SubProjectStartupWithLogin("", "");

            if (userSession == null)
            {
                callbackObj.SetTestOne(false);
                callbackObj.WriteInfo("Fail to create User Session on");
                callbackObj.WriteInfo(string.Format("\tSql Server '{0}'.", serverName));
                callbackObj.WriteErrorStop();
            }
            else
            {
                callbackObj.SetTestOne(true);
                callbackObj.WriteInfo("UserSession created successfully");
                callbackObj.WriteInfo(string.Format("\tfor '{0}'.", serverName));
            }
            return userSession;
        }
       
        //Test 3
        private bool TestLoginToAutoCountAccounting(string userID, string password, string dbName, AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            bool loginSuccess = userSession.Login(userID, password);

            if (loginSuccess)
            {
                callback.SetTestThree(true);
                callback.WriteInfo("Successful login to AutoCount Accounting");
                callback.WriteInfo(string.Format("\tDatabase {0}", dbName));
            }
            else
            {
                callback.SetTestThree(false);
                callback.WriteInfo("Fail to login to AutoCount Accounting");
                callback.WriteInfo("Check AutoCount Login Name OR Password.");
                callback.WriteInfo(string.Format("\tDatabase {0}", dbName));
                callback.WriteErrorStop();
            }
            return loginSuccess;
        }

        //AutoCount to Cloud Synchronization-------------------------------------------
        #region Cloud synchronization

        private const int SyncBatchSize = 200;
        private const int SyncBatchSizeWithBlob = 25;

        private string GetCloudConnectionString()
        {
            return string.Format("Server={0};Database={1};User ID={2};Password={3};SslMode=none;",
                serverAddress, databaseName, username, password);
        }

        private void DebtorSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            bool success = SyncTableToCloud(userSession, callback, "Debtor", "AccNo");
            if (success)
            {
                try
                {
                    callback.WriteInfo("Updating AccNo to company in cloud system...");
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        string updateSql = @"
                            UPDATE company c
                            INNER JOIN Debtor d ON LOWER(TRIM(c.name)) = LOWER(TRIM(d.CompanyName))
                            SET c.autocount_debtor_code = d.AccNo";
                        
                        using (MySqlCommand cmd = new MySqlCommand(updateSql, conn))
                        {
                            int rowsAffected = cmd.ExecuteNonQuery();
                            callback.WriteInfo(string.Format("Successfully updated {0} company(s) autocount_debtor_code.", rowsAffected));
                        }
                    }
                }
                catch (Exception ex)
                {
                    callback.WriteInfo("Failed to update AccNo to company: " + ex.Message);
                    Console.WriteLine("Update company error: " + ex);
                }
            }
            callback.SetTestFour(success);
        }

        /// <summary>
        /// Copies the AutoCount Creditor master to the cloud for supplier selection and
        /// Purchase Order preparation. This direction is read-only from AutoCount.
        /// </summary>
        private void CreditorSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            bool success = SyncTableToCloud(userSession, callback, "Creditor", "AccNo");
            callback.WriteInfo(success
                ? "Creditor master is ready for Purchase Order supplier selection."
                : "Creditor master synchronization was not completed.");
        }

        /// <summary>
        /// Copies every row of the local AutoCount Item table into the cloud MySQL Item table.
        /// Rows are matched on ItemCode: existing rows are updated, new ones inserted.
        /// </summary>
        private void ItemSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            bool itemMasterSynced = SyncTableToCloud(userSession, callback, "Item", "ItemCode");
            bool partsInventorySynced = itemMasterSynced && SyncItemMasterToParts(callback);
            bool defaultPriceSynced = partsInventorySynced && SyncItemDefaultPriceToParts(userSession, callback);
            callback.SetTestFive(itemMasterSynced && partsInventorySynced && defaultPriceSynced);
        }

        /// <summary>
        /// Makes the synchronized AutoCount Item master available to the Admin Panel parts inventory.
        /// AutoCount owns the master fields below. Price and cost are applied separately from
        /// ItemUOM; workshop-managed stock and reorder values are left unchanged here.
        /// </summary>
        private bool SyncItemMasterToParts(ThreadObj callback)
        {
            try
            {
                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();

                    using (MySqlCommand existsCommand = new MySqlCommand(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts'", conn))
                    {
                        if (Convert.ToInt32(existsCommand.ExecuteScalar()) == 0)
                        {
                            callback.WriteInfo("Parts inventory table is unavailable; Item master was synchronized only.");
                            return false;
                        }
                    }

                    const string itemTypeSql = @"CASE
                        WHEN UPPER(TRIM(COALESCE(i.ItemGroup, ''))) IN ('STOCK PM', 'SOC') THEN 'vehicle'
                        WHEN UPPER(TRIM(COALESCE(i.ItemGroup, ''))) LIKE '%LABOU%' THEN 'labour'
                        WHEN UPPER(TRIM(COALESCE(i.ItemGroup, ''))) IN ('SP', 'STOCK', 'EQUIP', 'SM', 'TLS&EQP', 'T&E (EXP') THEN 'part'
                        WHEN UPPER(TRIM(COALESCE(i.ItemGroup, ''))) IN ('COURIER', 'HDLG', 'O/CHARGE', 'T/L USE', 'T/W USE', 'TRANS', 'UK/EQP') THEN 'service'
                        WHEN TRIM(COALESCE(i.ItemGroup, '')) <> '' THEN 'fee'
                        ELSE 'part'
                    END";

                    using (MySqlTransaction transaction = conn.BeginTransaction())
                    {
                        string updateSql = @"
                            UPDATE parts p
                            INNER JOIN Item i ON UPPER(TRIM(p.sku)) = UPPER(TRIM(i.ItemCode))
                            SET p.name = LEFT(COALESCE(NULLIF(TRIM(i.Description), ''), i.ItemCode), 200),
                                p.category = LEFT(COALESCE(NULLIF(TRIM(i.ItemGroup), ''), 'Parts'), 100),
                                p.supplier = LEFT(NULLIF(TRIM(i.MainSupplier), ''), 150),
                                p.uom = LEFT(COALESCE(NULLIF(TRIM(i.BaseUOM), ''), NULLIF(TRIM(i.SalesUOM), ''), NULLIF(TRIM(i.PurchaseUOM), ''), ''), 30),
                                p.autocount_item_group = LEFT(NULLIF(TRIM(i.ItemGroup), ''), 30),
                                p.item_type = " + itemTypeSql + @",
                                p.tax_code = LEFT(NULLIF(TRIM(i.TaxCode), ''), 30),
                                p.is_stock_item = CASE WHEN UPPER(TRIM(COALESCE(i.StockControl, ''))) IN ('T', '1', 'Y', 'TRUE') THEN 1 ELSE 0 END,
                                p.is_active = CASE WHEN UPPER(TRIM(COALESCE(i.IsActive, ''))) IN ('T', '1', 'Y', 'TRUE') THEN 1 ELSE 0 END";

                        int updated;
                        using (MySqlCommand updateCommand = new MySqlCommand(updateSql, conn, transaction))
                        {
                            updateCommand.CommandTimeout = 180;
                            updated = updateCommand.ExecuteNonQuery();
                        }

                        string insertSql = @"
                            INSERT INTO parts
                                (name, status, price, category, sku, stock, low_stock_threshold,
                                 supplier, uom, cost_price, autocount_item_group, item_type,
                                 tax_code, is_stock_item, is_active)
                            SELECT
                                LEFT(COALESCE(NULLIF(TRIM(i.Description), ''), i.ItemCode), 200),
                                CASE WHEN UPPER(TRIM(COALESCE(i.IsActive, ''))) IN ('T', '1', 'Y', 'TRUE') THEN 1 ELSE 0 END,
                                0,
                                LEFT(COALESCE(NULLIF(TRIM(i.ItemGroup), ''), 'Parts'), 100),
                                i.ItemCode,
                                0,
                                0,
                                LEFT(NULLIF(TRIM(i.MainSupplier), ''), 150),
                                LEFT(COALESCE(NULLIF(TRIM(i.BaseUOM), ''), NULLIF(TRIM(i.SalesUOM), ''), NULLIF(TRIM(i.PurchaseUOM), ''), ''), 30),
                                0,
                                LEFT(NULLIF(TRIM(i.ItemGroup), ''), 30),
                                " + itemTypeSql + @",
                                LEFT(NULLIF(TRIM(i.TaxCode), ''), 30),
                                CASE WHEN UPPER(TRIM(COALESCE(i.StockControl, ''))) IN ('T', '1', 'Y', 'TRUE') THEN 1 ELSE 0 END,
                                CASE WHEN UPPER(TRIM(COALESCE(i.IsActive, ''))) IN ('T', '1', 'Y', 'TRUE') THEN 1 ELSE 0 END
                            FROM Item i
                            WHERE TRIM(COALESCE(i.ItemCode, '')) <> ''
                              AND NOT EXISTS (
                                  SELECT 1 FROM parts p
                                  WHERE UPPER(TRIM(p.sku)) = UPPER(TRIM(i.ItemCode))
                              )";

                        int inserted;
                        using (MySqlCommand insertCommand = new MySqlCommand(insertSql, conn, transaction))
                        {
                            insertCommand.CommandTimeout = 180;
                            inserted = insertCommand.ExecuteNonQuery();
                        }

                        transaction.Commit();
                        callback.WriteInfo(string.Format(
                            "Parts Inventory linked to AutoCount Item: {0} updated, {1} added.", updated, inserted));
                    }
                }
                return true;
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Failed to link Item master to Parts Inventory: " + ex.Message);
                Console.WriteLine("Item to parts inventory error: " + ex);
                SendTelegramMessage("[Autocount Sync] Item to Parts Inventory failed: " + ex.Message);
                return false;
            }
        }

        /// <summary>
        /// Reads the standard selling price and cost from AutoCount ItemUOM and updates the
        /// matching cloud part. Base UOM is preferred, followed by Sales UOM and Rate = 1.
        /// A NULL AutoCount value never replaces a value already maintained in the cloud.
        /// AutoCount is queried read-only; no AutoCount document or master data is changed.
        /// </summary>
        private bool SyncItemDefaultPriceToParts(
            AutoCount.Authentication.UserSession userSession,
            ThreadObj callback)
        {
            try
            {
                const string priceQuery = @"
                    WITH RankedItemPrice AS
                    (
                        SELECT
                            i.ItemCode,
                            iu.UOM,
                            iu.Rate,
                            iu.Price,
                            iu.Cost,
                            ROW_NUMBER() OVER
                            (
                                PARTITION BY i.ItemCode
                                ORDER BY
                                    CASE
                                        WHEN NULLIF(LTRIM(RTRIM(i.BaseUOM)), '') IS NOT NULL
                                         AND UPPER(LTRIM(RTRIM(iu.UOM))) = UPPER(LTRIM(RTRIM(i.BaseUOM))) THEN 0
                                        WHEN NULLIF(LTRIM(RTRIM(i.SalesUOM)), '') IS NOT NULL
                                         AND UPPER(LTRIM(RTRIM(iu.UOM))) = UPPER(LTRIM(RTRIM(i.SalesUOM))) THEN 1
                                        WHEN ISNULL(iu.Rate, 0) = 1 THEN 2
                                        ELSE 3
                                    END,
                                    CASE WHEN iu.Price IS NOT NULL THEN 0 ELSE 1 END,
                                    iu.Rate,
                                    iu.UOM
                            ) AS PriceRank
                        FROM Item i
                        INNER JOIN ItemUOM iu ON iu.ItemCode = i.ItemCode
                    )
                    SELECT ItemCode, UOM, Rate, Price, Cost
                    FROM RankedItemPrice
                    WHERE PriceRank = 1";

                DataTable prices = userSession.DBSetting.GetDataTable(priceQuery, false);
                int rowsWithPrice = prices.AsEnumerable().Count(row => row["Price"] != DBNull.Value);
                int rowsWithCost = prices.AsEnumerable().Count(row => row["Cost"] != DBNull.Value);
                callback.WriteInfo(string.Format(
                    "Read {0} default Item price row(s) from AutoCount ({1} priced, {2} costed).",
                    prices.Rows.Count, rowsWithPrice, rowsWithCost));

                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    int updated;
                    using (MySqlTransaction transaction = conn.BeginTransaction())
                    {
                        using (MySqlCommand createCommand = new MySqlCommand(@"
                            CREATE TEMPORARY TABLE `tmp_maw_item_default_price`
                            (
                                `ItemCode` VARCHAR(100) NOT NULL PRIMARY KEY,
                                `UOM` VARCHAR(30) NULL,
                                `Price` DECIMAL(18,6) NULL,
                                `Cost` DECIMAL(18,6) NULL
                            )", conn, transaction))
                        {
                            createCommand.ExecuteNonQuery();
                        }

                        const int batchSize = 300;
                        for (int offset = 0; offset < prices.Rows.Count; offset += batchSize)
                        {
                            List<DataRow> batch = prices.AsEnumerable().Skip(offset).Take(batchSize).ToList();
                            StringBuilder insertSql = new StringBuilder(
                                "INSERT INTO `tmp_maw_item_default_price` (`ItemCode`, `UOM`, `Price`, `Cost`) VALUES ");

                            using (MySqlCommand insertCommand = new MySqlCommand())
                            {
                                insertCommand.Connection = conn;
                                insertCommand.Transaction = transaction;

                                for (int index = 0; index < batch.Count; index++)
                                {
                                    if (index > 0)
                                    {
                                        insertSql.Append(",");
                                    }

                                    string suffix = index.ToString(CultureInfo.InvariantCulture);
                                    insertSql.Append("(@itemCode" + suffix + ",@uom" + suffix +
                                        ",@price" + suffix + ",@cost" + suffix + ")");
                                    insertCommand.Parameters.AddWithValue(
                                        "@itemCode" + suffix, batch[index]["ItemCode"]);
                                    insertCommand.Parameters.AddWithValue(
                                        "@uom" + suffix, ToCloudValue(batch[index]["UOM"]));
                                    insertCommand.Parameters.AddWithValue(
                                        "@price" + suffix, ToCloudValue(batch[index]["Price"]));
                                    insertCommand.Parameters.AddWithValue(
                                        "@cost" + suffix, ToCloudValue(batch[index]["Cost"]));
                                }

                                insertCommand.CommandText = insertSql.ToString();
                                insertCommand.CommandTimeout = 180;
                                insertCommand.ExecuteNonQuery();
                            }
                        }

                        using (MySqlCommand updateCommand = new MySqlCommand(@"
                            UPDATE parts p
                            INNER JOIN `tmp_maw_item_default_price` d
                                ON UPPER(TRIM(p.sku)) = UPPER(TRIM(d.ItemCode))
                            SET p.price = COALESCE(d.Price, p.price),
                                p.cost_price = COALESCE(d.Cost, p.cost_price)
                            WHERE d.Price IS NOT NULL OR d.Cost IS NOT NULL", conn, transaction))
                        {
                            updateCommand.CommandTimeout = 180;
                            updated = updateCommand.ExecuteNonQuery();
                        }

                        transaction.Commit();
                    }

                    WriteSyncLog(conn, "ItemDefaultPrice", "Success", string.Format(
                        "AutoCount to Web (read-only), {0} default UOM row(s), {1} with Price, {2} with Cost, {3} parts changed; NULL values preserved",
                        prices.Rows.Count, rowsWithPrice, rowsWithCost, updated));
                }

                callback.WriteInfo("Item default Price and Cost synchronization done.");
                return true;
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Item default Price synchronization failed: " + ex.Message);
                Console.WriteLine("Item default Price synchronization error: " + ex);
                SendTelegramMessage("[Autocount Sync] Item default Price synchronization failed: " + ex.Message);

                try
                {
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, "ItemDefaultPrice", "Failed",
                            "AutoCount to Web (read-only), " + ex.Message);
                    }
                }
                catch (Exception logEx)
                {
                    Console.WriteLine("Item default Price synchronization log error: " + logEx.Message);
                }
                return false;
            }
        }

        /// <summary>
        /// Reads the AutoCount Stock Balance inquiry as at today, aggregated across all locations
        /// in the smallest UOM, and writes the resulting quantity to Parts Inventory.
        /// This is strictly AutoCount-to-cloud; it never writes stock back to AutoCount.
        /// </summary>
        private void StockBalanceSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            bool success = false;
            try
            {
                DateTime balanceDate = DateTime.Today;
                var criteria = new AutoCount.Stock.StockBalance.StockBalanceCriteria(userSession.DBSetting)
                {
                    FromDate = balanceDate,
                    ActiveItem = true,
                    InactiveItem = true,
                    UOMOption = AutoCount.Stock.ShowUOMOption.ShowSmallestUOM,
                    ZeroBalanceOption = AutoCount.Stock.StockBalance.ZeroBalanceOptions.ShowAllRecords
                };
                var helper = new AutoCount.Stock.StockBalance.StockBalanceHelper(userSession)
                {
                    Criteria = criteria
                };

                callback.WriteInfo(string.Format("Reading AutoCount stock balance as at {0:yyyy-MM-dd}...", balanceDate));
                helper.Inquire(balanceDate);
                DataTable result = helper.ResultTable;

                if (result == null || result.Columns.Count == 0)
                {
                    throw new InvalidOperationException("AutoCount Stock Balance returned no result columns.");
                }
                if (result.Rows.Count == 0)
                {
                    throw new InvalidOperationException("AutoCount Stock Balance returned no rows; cloud stock was not changed.");
                }

                string itemCodeColumn = FindColumn(result, "ItemCode", "Item Code", "Code");
                string quantityColumn = FindColumn(
                    result,
                    "SmallestBalQty",
                    "SmallestBalanceQty",
                    "Smallest Bal Qty",
                    "BalanceQty",
                    "Balance",
                    "OnHandQty",
                    "Balance Qty",
                    "On Hand Qty");
                if (itemCodeColumn == null || quantityColumn == null)
                {
                    throw new InvalidOperationException(string.Format(
                        "AutoCount Stock Balance columns are not recognized. Returned: {0}",
                        string.Join(", ", result.Columns.Cast<DataColumn>().Select(c => c.ColumnName))));
                }
                callback.WriteInfo(string.Format(
                    "Using AutoCount quantity column '{0}' from {1} stock balance row(s).",
                    quantityColumn, result.Rows.Count));

                Dictionary<string, decimal> balances = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
                foreach (DataRow row in result.Rows)
                {
                    string itemCode = row[itemCodeColumn] == DBNull.Value ? "" : row[itemCodeColumn].ToString().Trim();
                    if (itemCode.Length == 0)
                    {
                        continue;
                    }

                    decimal quantity = 0m;
                    if (row[quantityColumn] != DBNull.Value)
                    {
                        decimal.TryParse(row[quantityColumn].ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out quantity);
                    }
                    balances[itemCode] = balances.ContainsKey(itemCode) ? balances[itemCode] + quantity : quantity;
                }

                if (balances.Count == 0)
                {
                    throw new InvalidOperationException("AutoCount Stock Balance returned rows without any Item Code.");
                }

                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    int updated;
                    using (MySqlTransaction transaction = conn.BeginTransaction())
                    {
                        using (MySqlCommand createCommand = new MySqlCommand(@"
                            CREATE TEMPORARY TABLE `tmp_maw_stock_balance` (
                                `ItemCode` VARCHAR(100) NOT NULL PRIMARY KEY,
                                `BalanceQty` DECIMAL(18,4) NOT NULL
                            ) ENGINE=InnoDB", conn, transaction))
                        {
                            createCommand.ExecuteNonQuery();
                        }

                        List<KeyValuePair<string, decimal>> balanceRows = balances.ToList();
                        const int batchSize = 250;
                        for (int offset = 0; offset < balanceRows.Count; offset += batchSize)
                        {
                            List<KeyValuePair<string, decimal>> batch = balanceRows.Skip(offset).Take(batchSize).ToList();
                            using (MySqlCommand insertCommand = conn.CreateCommand())
                            {
                                insertCommand.Transaction = transaction;
                                StringBuilder sql = new StringBuilder(
                                    "INSERT INTO `tmp_maw_stock_balance` (`ItemCode`, `BalanceQty`) VALUES ");
                                for (int index = 0; index < batch.Count; index++)
                                {
                                    if (index > 0) sql.Append(", ");
                                    string codeParameter = "@stockCode" + index;
                                    string quantityParameter = "@stockQty" + index;
                                    sql.Append("(").Append(codeParameter).Append(", ").Append(quantityParameter).Append(")");
                                    insertCommand.Parameters.AddWithValue(codeParameter, batch[index].Key);
                                    insertCommand.Parameters.AddWithValue(quantityParameter, batch[index].Value);
                                }
                                sql.Append(" ON DUPLICATE KEY UPDATE `BalanceQty` = VALUES(`BalanceQty`)");
                                insertCommand.CommandText = sql.ToString();
                                insertCommand.CommandTimeout = 180;
                                insertCommand.ExecuteNonQuery();
                            }
                        }

                        // A successful inquiry owns current stock quantities. Items omitted by the
                        // inquiry are reset to zero before applying the returned non-zero balances.
                        using (MySqlCommand resetCommand = new MySqlCommand(@"
                            UPDATE parts p
                            INNER JOIN Item i ON UPPER(TRIM(p.sku)) = UPPER(TRIM(i.ItemCode))
                            SET p.stock = 0
                            WHERE UPPER(TRIM(COALESCE(i.StockControl, ''))) IN ('T', '1', 'Y', 'TRUE')", conn, transaction))
                        {
                            resetCommand.CommandTimeout = 180;
                            resetCommand.ExecuteNonQuery();
                        }

                        using (MySqlCommand updateCommand = new MySqlCommand(@"
                            UPDATE parts p
                            INNER JOIN `tmp_maw_stock_balance` s
                                ON UPPER(TRIM(p.sku)) = UPPER(TRIM(s.ItemCode))
                            SET p.stock = s.BalanceQty", conn, transaction))
                        {
                            updateCommand.CommandTimeout = 180;
                            updated = updateCommand.ExecuteNonQuery();
                        }

                        transaction.Commit();
                    }
                    WriteSyncLog(conn, "StockBalance", "Success", string.Format(
                        "AutoCount to Web, {0} balance row(s), {1} Item Code(s), {2} parts changed, all locations, smallest UOM, as at {3:yyyy-MM-dd}",
                        result.Rows.Count, balances.Count, updated, balanceDate));
                }

                callback.WriteInfo(string.Format(
                    "Stock Balance synchronization done. {0} Item Code(s), all locations, smallest UOM.", balances.Count));
                success = true;
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Stock Balance synchronization failed: " + ex.Message);
                Console.WriteLine("Stock Balance synchronization error: " + ex);
                SendTelegramMessage("[Autocount Sync] Stock Balance synchronization failed: " + ex.Message);

                try
                {
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, "StockBalance", "Failed", "AutoCount to Web, " + ex.Message);
                    }
                }
                catch (Exception logEx)
                {
                    Console.WriteLine("Stock Balance synchronization log error: " + logEx.Message);
                }
            }
            callback.SetTestSix(success);
        }

        /// <summary>
        /// Copies the AutoCount Project master to MAW and links a cloud vehicle only when its
        /// registration number exactly matches the Project No after removing punctuation and spaces.
        /// Existing manual vehicle mappings are preserved. AutoCount is queried read-only.
        /// </summary>
        private void ProjectVehicleSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            int written = 0;
            int skipped = 0;
            int vehiclesLinked = 0;

            try
            {
                DataTable projects = userSession.DBSetting.GetDataTable("SELECT * FROM [Project]", false);
                callback.WriteInfo(string.Format("Read {0} Project row(s) from AutoCount.", projects.Rows.Count));

                if (projects.Rows.Count == 0)
                {
                    callback.WriteInfo("AutoCount returned no Projects; cloud Project data was not changed.");
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, "ProjectVehicle", "Success",
                            "AutoCount to Web (read-only), 0 Project rows returned, 0 vehicles linked");
                    }
                    return;
                }

                string projectNoColumn = FindColumn(projects, "ProjNo", "ProjectNo", "ProjectCode", "Code");
                string descriptionColumn = FindColumn(projects, "Description", "ProjectDescription", "Desc");
                string activeColumn = FindColumn(projects, "IsActive", "Active");
                if (projectNoColumn == null)
                {
                    throw new InvalidOperationException(string.Format(
                        "AutoCount Project number column is not recognized. Returned: {0}",
                        string.Join(", ", projects.Columns.Cast<DataColumn>().Select(c => c.ColumnName))));
                }

                Dictionary<string, HashSet<string>> debtorsByProject =
                    new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
                const string projectDebtorSql = @"
                    SELECT DISTINCT dtl.ProjNo, iv.DebtorCode
                    FROM ARInvoiceDtl dtl
                    INNER JOIN ARInvoice iv ON iv.DocKey = dtl.DocKey
                    WHERE NULLIF(LTRIM(RTRIM(dtl.ProjNo)), '') IS NOT NULL
                      AND NULLIF(LTRIM(RTRIM(iv.DebtorCode)), '') IS NOT NULL";
                DataTable projectDebtors = userSession.DBSetting.GetDataTable(projectDebtorSql, false);
                foreach (DataRow association in projectDebtors.Rows)
                {
                    string projectNo = GetTrimmedValue(association, "ProjNo");
                    string debtorCode = GetTrimmedValue(association, "DebtorCode");
                    HashSet<string> debtorCodes;
                    if (!debtorsByProject.TryGetValue(projectNo, out debtorCodes))
                    {
                        debtorCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        debtorsByProject[projectNo] = debtorCodes;
                    }
                    debtorCodes.Add(debtorCode);
                }

                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    if (!CloudTableExists(conn, "autocount_project"))
                    {
                        throw new InvalidOperationException("Cloud table autocount_project is unavailable.");
                    }

                    Dictionary<string, long> vehicleByNumber = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                    HashSet<string> ambiguousVehicleNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (CloudTableExists(conn, "customer_vehicle") &&
                        CloudColumnExists(conn, "customer_vehicle", "autocount_project_no"))
                    {
                        using (MySqlCommand loadVehicles = new MySqlCommand(
                            "SELECT id, registration_no, vehicle_no FROM customer_vehicle", conn))
                        using (MySqlDataReader reader = loadVehicles.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                long vehicleId = Convert.ToInt64(reader.GetValue(0));
                                for (int columnIndex = 1; columnIndex <= 2; columnIndex++)
                                {
                                    string vehicleNumber = reader.IsDBNull(columnIndex)
                                        ? "" : NormalizeVehicleIdentifier(reader.GetString(columnIndex));
                                    if (vehicleNumber.Length == 0)
                                    {
                                        continue;
                                    }
                                    long existingVehicleId;
                                    if (vehicleByNumber.TryGetValue(vehicleNumber, out existingVehicleId) &&
                                        existingVehicleId != vehicleId)
                                    {
                                        ambiguousVehicleNumbers.Add(vehicleNumber);
                                    }
                                    else
                                    {
                                        vehicleByNumber[vehicleNumber] = vehicleId;
                                    }
                                }
                            }
                        }
                    }

                    using (MySqlTransaction transaction = conn.BeginTransaction())
                    using (MySqlCommand upsertProject = new MySqlCommand(@"
                        INSERT INTO autocount_project
                            (project_no, description, debtor_code, is_active, last_sync_at)
                        VALUES
                            (@projectNo, @description, @debtorCode, @isActive, NOW())
                        ON DUPLICATE KEY UPDATE
                            description = VALUES(description),
                            debtor_code = COALESCE(VALUES(debtor_code), debtor_code),
                            is_active = VALUES(is_active),
                            last_sync_at = NOW()", conn, transaction))
                    using (MySqlCommand linkVehicle = new MySqlCommand(@"
                        UPDATE customer_vehicle
                        SET autocount_project_no = @projectNo, autocount_sync_at = NOW()
                        WHERE id = @vehicleId
                          AND (autocount_project_no IS NULL OR TRIM(autocount_project_no) = '')", conn, transaction))
                    {
                        upsertProject.Parameters.Add("@projectNo", MySqlDbType.VarChar);
                        upsertProject.Parameters.Add("@description", MySqlDbType.VarChar);
                        upsertProject.Parameters.Add("@debtorCode", MySqlDbType.VarChar);
                        upsertProject.Parameters.Add("@isActive", MySqlDbType.VarChar);
                        linkVehicle.Parameters.Add("@projectNo", MySqlDbType.VarChar);
                        linkVehicle.Parameters.Add("@vehicleId", MySqlDbType.Int64);

                        foreach (DataRow project in projects.Rows)
                        {
                            string projectNo = project[projectNoColumn] == DBNull.Value
                                ? "" : project[projectNoColumn].ToString().Trim();
                            if (projectNo.Length == 0)
                            {
                                skipped++;
                                continue;
                            }

                            string description = descriptionColumn != null && project[descriptionColumn] != DBNull.Value
                                ? project[descriptionColumn].ToString().Trim() : "";
                            string isActive = activeColumn == null || IsAutoCountTrue(project[activeColumn]) ? "T" : "F";
                            HashSet<string> debtorCodes;
                            string debtorCode = debtorsByProject.TryGetValue(projectNo, out debtorCodes) && debtorCodes.Count == 1
                                ? debtorCodes.First() : "";

                            upsertProject.Parameters["@projectNo"].Value = Truncate(projectNo, 60);
                            upsertProject.Parameters["@description"].Value = description.Length > 0
                                ? (object)Truncate(description, 255) : DBNull.Value;
                            upsertProject.Parameters["@debtorCode"].Value = debtorCode.Length > 0
                                ? (object)Truncate(debtorCode, 40) : DBNull.Value;
                            upsertProject.Parameters["@isActive"].Value = isActive;
                            upsertProject.ExecuteNonQuery();
                            written++;

                            string normalizedProjectNo = NormalizeVehicleIdentifier(projectNo);
                            long vehicleId;
                            if (normalizedProjectNo.Length > 0 &&
                                !ambiguousVehicleNumbers.Contains(normalizedProjectNo) &&
                                vehicleByNumber.TryGetValue(normalizedProjectNo, out vehicleId))
                            {
                                linkVehicle.Parameters["@projectNo"].Value = Truncate(projectNo, 60);
                                linkVehicle.Parameters["@vehicleId"].Value = vehicleId;
                                vehiclesLinked += linkVehicle.ExecuteNonQuery();
                            }
                        }

                        transaction.Commit();
                    }

                    WriteSyncLog(conn, "ProjectVehicle", "Success", string.Format(
                        "AutoCount to Web (read-only), {0} Project row(s) written, {1} vehicle(s) linked, {2} skipped",
                        written, vehiclesLinked, skipped));
                }

                callback.WriteInfo(string.Format(
                    "Project / Vehicle synchronization done. {0} Project row(s), {1} vehicle(s) linked, {2} skipped.",
                    written, vehiclesLinked, skipped));
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Project / Vehicle synchronization failed: " + ex.Message);
                Console.WriteLine("Project / Vehicle synchronization error: " + ex);
                SendTelegramMessage("[Autocount Sync] Project / Vehicle synchronization failed: " + ex.Message);

                try
                {
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, "ProjectVehicle", "Failed", "AutoCount to Web (read-only), " + ex.Message);
                    }
                }
                catch (Exception logEx)
                {
                    Console.WriteLine("Project / Vehicle synchronization log error: " + logEx.Message);
                }
            }
        }

        private static string NormalizeVehicleIdentifier(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "";
            }
            return new string(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
        }

        /// <summary>
        /// Reads formal AR Invoice headers from AutoCount and publishes summary/payment state to
        /// MAW. AutoCount is queried only through DBSetting.GetDataTable; this method never creates,
        /// edits, saves or deletes an AutoCount document.
        /// </summary>
        private void SalesInvoiceHeaderSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            int written = 0;
            int skippedUnmappedDebtor = 0;
            int skippedInvalid = 0;

            try
            {
                const string invoiceSql = @"
                    SELECT
                        iv.DocKey,
                        iv.DocNo,
                        iv.DebtorCode,
                        iv.DocDate,
                        iv.CurrencyCode,
                        iv.NetTotal,
                        iv.Outstanding,
                        iv.Cancelled,
                        iv.LastModified,
                        (
                            SELECT TOP 1 NULLIF(LTRIM(RTRIM(dtl.ProjNo)), '')
                            FROM ARInvoiceDtl dtl
                            WHERE dtl.DocKey = iv.DocKey
                              AND NULLIF(LTRIM(RTRIM(dtl.ProjNo)), '') IS NOT NULL
                            ORDER BY dtl.Seq
                        ) AS ProjectNo
                    FROM ARInvoice iv
                    WHERE NULLIF(LTRIM(RTRIM(iv.DocNo)), '') IS NOT NULL
                    ORDER BY iv.DocKey";

                DataTable invoices = userSession.DBSetting.GetDataTable(invoiceSql, false);
                callback.WriteInfo(string.Format(
                    "Read {0} formal Sales Invoice header(s) from AutoCount.", invoices.Rows.Count));

                if (invoices.Rows.Count == 0)
                {
                    callback.WriteInfo("AutoCount returned no Sales Invoice headers; cloud invoices were not changed.");
                    return;
                }

                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    if (!CloudTableExists(conn, "accounting_invoice"))
                    {
                        throw new InvalidOperationException(
                            "Cloud table accounting_invoice is unavailable. Apply migration 023_autocount_ready_workflow.sql first.");
                    }

                    Dictionary<string, int> companyByDebtor = LoadCompanyIdsByDebtorCode(conn);
                    Dictionary<string, InvoiceLinkTarget> workOrderByProject = LoadWorkOrderInvoiceTargets(conn);
                    Dictionary<string, InvoiceLinkTarget> vehicleByProject = LoadVehicleInvoiceTargets(conn);

                    using (MySqlTransaction transaction = conn.BeginTransaction())
                    using (MySqlCommand command = new MySqlCommand(@"
                        INSERT INTO `accounting_invoice`
                            (`source`, `external_invoice_no`, `company_id`, `work_order_id`, `vehicle_id`,
                             `external_job_no`, `vehicle_no_raw`, `invoice_date`, `currency`, `total`,
                             `outstanding`, `document_status`, `summary_only`, `source_updated_at`)
                        VALUES
                            ('autocount', @invoiceNo, @companyId, @workOrderId, @vehicleId,
                             @projectNo, @vehicleNoRaw, @invoiceDate, @currency, @total,
                             @outstanding, @documentStatus, 1, @sourceUpdatedAt)
                        ON DUPLICATE KEY UPDATE
                            `company_id` = VALUES(`company_id`),
                            `work_order_id` = COALESCE(`work_order_id`, VALUES(`work_order_id`)),
                            `vehicle_id` = COALESCE(`vehicle_id`, VALUES(`vehicle_id`)),
                            `external_job_no` = COALESCE(VALUES(`external_job_no`), `external_job_no`),
                            `vehicle_no_raw` = COALESCE(VALUES(`vehicle_no_raw`), `vehicle_no_raw`),
                            `invoice_date` = VALUES(`invoice_date`),
                            `currency` = VALUES(`currency`),
                            `total` = VALUES(`total`),
                            `outstanding` = VALUES(`outstanding`),
                            `document_status` = VALUES(`document_status`),
                            `source_updated_at` = COALESCE(VALUES(`source_updated_at`), `source_updated_at`),
                            `updated_at` = CURRENT_TIMESTAMP", conn, transaction))
                    {
                        command.CommandTimeout = 180;
                        command.Parameters.Add("@invoiceNo", MySqlDbType.VarChar);
                        command.Parameters.Add("@companyId", MySqlDbType.Int32);
                        command.Parameters.Add("@workOrderId", MySqlDbType.Int64);
                        command.Parameters.Add("@vehicleId", MySqlDbType.Int64);
                        command.Parameters.Add("@projectNo", MySqlDbType.VarChar);
                        command.Parameters.Add("@vehicleNoRaw", MySqlDbType.VarChar);
                        command.Parameters.Add("@invoiceDate", MySqlDbType.Date);
                        command.Parameters.Add("@currency", MySqlDbType.VarChar);
                        command.Parameters.Add("@total", MySqlDbType.Decimal);
                        command.Parameters.Add("@outstanding", MySqlDbType.Decimal);
                        command.Parameters.Add("@documentStatus", MySqlDbType.VarChar);
                        command.Parameters.Add("@sourceUpdatedAt", MySqlDbType.DateTime);

                        foreach (DataRow invoice in invoices.Rows)
                        {
                            string invoiceNo = GetTrimmedValue(invoice, "DocNo");
                            string debtorCode = GetTrimmedValue(invoice, "DebtorCode");
                            DateTime? invoiceDate = ToNullableDate(invoice["DocDate"]);

                            if (invoiceNo.Length == 0 || debtorCode.Length == 0 || !invoiceDate.HasValue)
                            {
                                skippedInvalid++;
                                continue;
                            }

                            int companyId;
                            if (!companyByDebtor.TryGetValue(debtorCode, out companyId))
                            {
                                skippedUnmappedDebtor++;
                                continue;
                            }

                            string projectNo = GetTrimmedValue(invoice, "ProjectNo");
                            string linkKey = BuildInvoiceLinkKey(companyId, projectNo);
                            InvoiceLinkTarget link = null;
                            if (projectNo.Length > 0)
                            {
                                if (!workOrderByProject.TryGetValue(linkKey, out link))
                                {
                                    vehicleByProject.TryGetValue(linkKey, out link);
                                }
                            }

                            decimal total = Math.Max(0m, ToDecimal(invoice["NetTotal"]));
                            decimal outstanding = Math.Max(0m, ToDecimal(invoice["Outstanding"]));
                            if (outstanding > total)
                            {
                                outstanding = total;
                            }

                            bool cancelled = IsAutoCountTrue(invoice["Cancelled"]);
                            if (cancelled)
                            {
                                outstanding = 0m;
                            }

                            string currency = GetTrimmedValue(invoice, "CurrencyCode");
                            if (currency.Length == 0)
                            {
                                currency = "MYR";
                            }

                            command.Parameters["@invoiceNo"].Value = Truncate(invoiceNo, 60);
                            command.Parameters["@companyId"].Value = companyId;
                            command.Parameters["@workOrderId"].Value = link != null && link.WorkOrderId.HasValue
                                ? (object)link.WorkOrderId.Value : DBNull.Value;
                            command.Parameters["@vehicleId"].Value = link != null && link.VehicleId.HasValue
                                ? (object)link.VehicleId.Value : DBNull.Value;
                            command.Parameters["@projectNo"].Value = projectNo.Length > 0
                                ? (object)Truncate(projectNo, 60) : DBNull.Value;
                            command.Parameters["@vehicleNoRaw"].Value = link != null && !string.IsNullOrEmpty(link.VehicleNo)
                                ? (object)Truncate(link.VehicleNo, 150)
                                : (projectNo.Length > 0 ? (object)Truncate(projectNo, 150) : DBNull.Value);
                            command.Parameters["@invoiceDate"].Value = invoiceDate.Value.Date;
                            command.Parameters["@currency"].Value = Truncate(currency, 3).ToUpperInvariant();
                            command.Parameters["@total"].Value = total;
                            command.Parameters["@outstanding"].Value = outstanding;
                            command.Parameters["@documentStatus"].Value = cancelled ? "void" : "approved";
                            DateTime? sourceUpdatedAt = ToNullableDate(invoice["LastModified"]);
                            command.Parameters["@sourceUpdatedAt"].Value = sourceUpdatedAt.HasValue
                                ? (object)sourceUpdatedAt.Value : DBNull.Value;

                            command.ExecuteNonQuery();
                            written++;
                        }

                        transaction.Commit();
                    }

                    WriteSyncLog(conn, "SalesInvoiceHeader", "Success", string.Format(
                        "AutoCount to Web (read-only), {0} written, {1} skipped (unmapped Debtor), {2} skipped (invalid)",
                        written, skippedUnmappedDebtor, skippedInvalid));
                }

                callback.WriteInfo(string.Format(
                    "Sales Invoice Header synchronization done. {0} written, {1} unmapped Debtor, {2} invalid.",
                    written, skippedUnmappedDebtor, skippedInvalid));
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Sales Invoice Header synchronization failed: " + ex.Message);
                Console.WriteLine("Sales Invoice Header synchronization error: " + ex);
                SendTelegramMessage("[Autocount Sync] Sales Invoice Header synchronization failed: " + ex.Message);

                try
                {
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, "SalesInvoiceHeader", "Failed", "AutoCount to Web (read-only), " + ex.Message);
                    }
                }
                catch (Exception logEx)
                {
                    Console.WriteLine("Sales Invoice Header synchronization log error: " + logEx.Message);
                }
            }
        }

        private sealed class InvoiceLinkTarget
        {
            public long? WorkOrderId { get; set; }
            public long? VehicleId { get; set; }
            public string VehicleNo { get; set; }
        }

        /// <summary>
        /// Reads formal AR Invoice lines from AutoCount and upserts them beneath invoice headers
        /// already mapped to a MAW company. It does not create, edit or delete AutoCount documents,
        /// and it does not delete cloud lines that are absent from a later read.
        /// </summary>
        private void SalesInvoiceDetailSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            int written = 0;
            int skippedUnmappedHeader = 0;
            int skippedInvalid = 0;
            int linesWithTaxCode = 0;
            int linesWithTax = 0;

            try
            {
                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    if (!CloudTableExists(conn, "accounting_invoice") ||
                        !CloudTableExists(conn, "accounting_invoice_item"))
                    {
                        throw new InvalidOperationException(
                            "Cloud invoice detail tables are unavailable. Apply migration 023_autocount_ready_workflow.sql first.");
                    }
                    if (!CloudColumnExists(conn, "accounting_invoice_item", "tax_rate"))
                    {
                        throw new InvalidOperationException(
                            "Cloud invoice detail tax_rate column is unavailable after initialization.");
                    }

                    Dictionary<string, long> invoiceIds = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                    using (MySqlCommand loadHeaders = new MySqlCommand(
                        "SELECT id, external_invoice_no FROM accounting_invoice " +
                        "WHERE source = 'autocount'", conn))
                    using (MySqlDataReader reader = loadHeaders.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            string invoiceNo = reader.IsDBNull(1) ? "" : reader.GetString(1).Trim();
                            if (invoiceNo.Length > 0)
                            {
                                invoiceIds[invoiceNo] = Convert.ToInt64(reader.GetValue(0));
                            }
                        }
                    }

                    if (invoiceIds.Count == 0)
                    {
                        callback.WriteInfo("No mapped AutoCount invoice headers are available; invoice details were not read.");
                        WriteSyncLog(conn, "SalesInvoiceDetail", "Success",
                            "AutoCount to Web (read-only), 0 written, no mapped invoice headers");
                        return;
                    }

                    string invoiceNumberFilter = string.Join(", ", invoiceIds.Keys.Select(
                        invoiceNo => "'" + invoiceNo.Replace("'", "''") + "'"));
                    string detailSql = @"
                        SELECT
                            iv.DocNo,
                            dtl.DtlKey,
                            dtl.Seq,
                            dtl.ItemCode,
                            dtl.Description,
                            dtl.FurtherDescription,
                            dtl.Qty,
                            dtl.UnitPrice,
                            posting.TaxCode,
                            posting.TaxRate,
                            posting.Tax,
                            posting.SubTotal,
                            i.ItemGroup
                        FROM ARInvoice iv
                        INNER JOIN ARInvoiceDtl posting
                            ON posting.DocKey = iv.DocKey
                           AND posting.SourceDtlKey IS NOT NULL
                        INNER JOIN IVDTL dtl ON dtl.DtlKey = posting.SourceDtlKey
                        LEFT JOIN Item i ON i.ItemCode = dtl.ItemCode
                        WHERE iv.DocNo IN (" + invoiceNumberFilter + @")
                        ORDER BY iv.DocKey, dtl.Seq, dtl.DtlKey";

                    callback.WriteInfo(string.Format(
                        "Reading details for {0} mapped AutoCount invoice header(s)...", invoiceIds.Count));
                    DataTable details = userSession.DBSetting.GetDataTable(detailSql, false);
                    callback.WriteInfo(string.Format(
                        "Read {0} formal Sales Invoice detail row(s) from AutoCount.", details.Rows.Count));

                    if (details.Rows.Count == 0)
                    {
                        callback.WriteInfo("AutoCount returned no details for mapped Sales Invoice headers; cloud invoice items were not changed.");
                        WriteSyncLog(conn, "SalesInvoiceDetail", "Success",
                            "AutoCount to Web (read-only), 0 written, mapped headers have no detail rows");
                        return;
                    }

                    using (MySqlTransaction transaction = conn.BeginTransaction())
                    using (MySqlCommand command = new MySqlCommand(@"
                        INSERT INTO `accounting_invoice_item`
                            (`invoice_id`, `line_no`, `item_code`, `description`, `item_type`,
                             `quantity`, `unit_price`, `tax_code`, `tax_rate`, `tax_amount`, `amount`)
                        VALUES
                            (@invoiceId, @lineNo, @itemCode, @description, @itemType,
                             @quantity, @unitPrice, @taxCode, @taxRate, @taxAmount, @amount)
                        ON DUPLICATE KEY UPDATE
                            `item_code` = VALUES(`item_code`),
                            `description` = VALUES(`description`),
                            `item_type` = VALUES(`item_type`),
                            `quantity` = VALUES(`quantity`),
                            `unit_price` = VALUES(`unit_price`),
                            `tax_code` = VALUES(`tax_code`),
                            `tax_rate` = VALUES(`tax_rate`),
                            `tax_amount` = VALUES(`tax_amount`),
                            `amount` = VALUES(`amount`)", conn, transaction))
                    using (MySqlCommand markDetailed = new MySqlCommand(
                        "UPDATE accounting_invoice SET summary_only = 0 WHERE id = @invoiceId", conn, transaction))
                    {
                        command.CommandTimeout = 180;
                        command.Parameters.Add("@invoiceId", MySqlDbType.Int64);
                        command.Parameters.Add("@lineNo", MySqlDbType.Int32);
                        command.Parameters.Add("@itemCode", MySqlDbType.VarChar);
                        command.Parameters.Add("@description", MySqlDbType.VarChar);
                        command.Parameters.Add("@itemType", MySqlDbType.VarChar);
                        command.Parameters.Add("@quantity", MySqlDbType.Decimal);
                        command.Parameters.Add("@unitPrice", MySqlDbType.Decimal);
                        command.Parameters.Add("@taxCode", MySqlDbType.VarChar);
                        command.Parameters.Add("@taxRate", MySqlDbType.Decimal);
                        command.Parameters.Add("@taxAmount", MySqlDbType.Decimal);
                        command.Parameters.Add("@amount", MySqlDbType.Decimal);
                        markDetailed.Parameters.Add("@invoiceId", MySqlDbType.Int64);

                        HashSet<long> detailedInvoiceIds = new HashSet<long>();
                        foreach (DataRow detail in details.Rows)
                        {
                            string invoiceNo = GetTrimmedValue(detail, "DocNo");
                            long invoiceId;
                            if (invoiceNo.Length == 0 || !invoiceIds.TryGetValue(invoiceNo, out invoiceId))
                            {
                                skippedUnmappedHeader++;
                                continue;
                            }

                            int lineNo;
                            if (!int.TryParse(detail["Seq"].ToString(), out lineNo))
                            {
                                skippedInvalid++;
                                continue;
                            }

                            string itemCode = GetTrimmedValue(detail, "ItemCode");
                            string description = GetTrimmedValue(detail, "Description");
                            string furtherDescription = GetTrimmedValue(detail, "FurtherDescription");
                            if (furtherDescription.Length > 0 &&
                                !string.Equals(description, furtherDescription, StringComparison.OrdinalIgnoreCase))
                            {
                                description = description.Length > 0
                                    ? description + Environment.NewLine + furtherDescription
                                    : furtherDescription;
                            }
                            if (description.Length == 0)
                            {
                                description = itemCode.Length > 0 ? itemCode : "Invoice item";
                            }

                            string itemGroup = GetTrimmedValue(detail, "ItemGroup");
                            string itemType = itemGroup.IndexOf("LABOU", StringComparison.OrdinalIgnoreCase) >= 0
                                ? "labour"
                                : (itemCode.Length > 0 ? "part" : "other");
                            command.Parameters["@invoiceId"].Value = invoiceId;
                            command.Parameters["@lineNo"].Value = lineNo;
                            command.Parameters["@itemCode"].Value = itemCode.Length > 0
                                ? (object)Truncate(itemCode, 80) : DBNull.Value;
                            command.Parameters["@description"].Value = Truncate(description, 500);
                            command.Parameters["@itemType"].Value = itemType;
                            command.Parameters["@quantity"].Value = ToDecimal(detail["Qty"]);
                            command.Parameters["@unitPrice"].Value = ToDecimal(detail["UnitPrice"]);
                            string taxCode = GetTrimmedValue(detail, "TaxCode");
                            decimal taxAmount = ToDecimal(detail["Tax"]);
                            command.Parameters["@taxCode"].Value = taxCode.Length > 0
                                ? (object)Truncate(taxCode, 30) : DBNull.Value;
                            command.Parameters["@taxRate"].Value = ToDecimal(detail["TaxRate"]);
                            command.Parameters["@taxAmount"].Value = taxAmount;
                            command.Parameters["@amount"].Value = ToDecimal(detail["SubTotal"]);
                            command.ExecuteNonQuery();
                            written++;
                            if (taxCode.Length > 0) linesWithTaxCode++;
                            if (taxAmount != 0m) linesWithTax++;

                            if (detailedInvoiceIds.Add(invoiceId))
                            {
                                markDetailed.Parameters["@invoiceId"].Value = invoiceId;
                                markDetailed.ExecuteNonQuery();
                            }
                        }

                        transaction.Commit();
                    }

                    WriteSyncLog(conn, "SalesInvoiceDetail", "Success", string.Format(
                        "AutoCount to Web (read-only), {0} written, {1} with TaxCode/TaxRate, {2} with non-zero Tax, {3} skipped (unmapped header), {4} skipped (invalid)",
                        written, linesWithTaxCode, linesWithTax, skippedUnmappedHeader, skippedInvalid));
                }

                callback.WriteInfo(string.Format(
                    "Sales Invoice Detail synchronization done. {0} written, {1} unmapped header, {2} invalid.",
                    written, skippedUnmappedHeader, skippedInvalid));
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Sales Invoice Detail synchronization failed: " + ex.Message);
                Console.WriteLine("Sales Invoice Detail synchronization error: " + ex);
                SendTelegramMessage("[Autocount Sync] Sales Invoice Detail synchronization failed: " + ex.Message);

                try
                {
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, "SalesInvoiceDetail", "Failed",
                            "AutoCount to Web (read-only), " + ex.Message);
                    }
                }
                catch (Exception logEx)
                {
                    Console.WriteLine("Sales Invoice Detail synchronization log error: " + logEx.Message);
                }
            }
        }

        private static bool CloudTableExists(MySqlConnection conn, string tableName)
        {
            using (MySqlCommand command = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName", conn))
            {
                command.Parameters.AddWithValue("@tableName", tableName);
                return Convert.ToInt32(command.ExecuteScalar()) > 0;
            }
        }

        private static bool CloudColumnExists(MySqlConnection conn, string tableName, string columnName)
        {
            using (MySqlCommand command = new MySqlCommand(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() " +
                "AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName", conn))
            {
                command.Parameters.AddWithValue("@tableName", tableName);
                command.Parameters.AddWithValue("@columnName", columnName);
                return Convert.ToInt32(command.ExecuteScalar()) > 0;
            }
        }

        private Dictionary<string, int> LoadCompanyIdsByDebtorCode(MySqlConnection conn)
        {
            Dictionary<string, int> result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (!CloudTableExists(conn, "company") || !CloudColumnExists(conn, "company", "autocount_debtor_code"))
            {
                return result;
            }

            using (MySqlCommand command = new MySqlCommand(
                "SELECT id, autocount_debtor_code FROM company " +
                "WHERE autocount_debtor_code IS NOT NULL AND TRIM(autocount_debtor_code) <> ''", conn))
            using (MySqlDataReader reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    string debtorCode = reader.IsDBNull(1) ? "" : reader.GetString(1).Trim();
                    if (debtorCode.Length > 0)
                    {
                        result[debtorCode] = Convert.ToInt32(reader.GetValue(0));
                    }
                }
            }
            return result;
        }

        private Dictionary<string, InvoiceLinkTarget> LoadWorkOrderInvoiceTargets(MySqlConnection conn)
        {
            Dictionary<string, InvoiceLinkTarget> result = new Dictionary<string, InvoiceLinkTarget>(StringComparer.OrdinalIgnoreCase);
            if (!CloudTableExists(conn, "job") ||
                !CloudColumnExists(conn, "job", "autocount_job_no") ||
                !CloudColumnExists(conn, "job", "company_id"))
            {
                return result;
            }

            bool hasVehicleId = CloudColumnExists(conn, "job", "vehicle_id");
            bool hasCustomerVehicle = hasVehicleId && CloudTableExists(conn, "customer_vehicle");
            string sql = hasCustomerVehicle
                ? "SELECT j.id, j.company_id, j.vehicle_id, j.autocount_job_no, " +
                  "COALESCE(NULLIF(TRIM(cv.registration_no), ''), NULLIF(TRIM(cv.vehicle_no), '')) " +
                  "FROM job j LEFT JOIN customer_vehicle cv ON cv.id = j.vehicle_id " +
                  "WHERE j.autocount_job_no IS NOT NULL AND TRIM(j.autocount_job_no) <> ''"
                : "SELECT j.id, j.company_id, " + (hasVehicleId ? "j.vehicle_id" : "NULL") +
                  ", j.autocount_job_no, NULL FROM job j " +
                  "WHERE j.autocount_job_no IS NOT NULL AND TRIM(j.autocount_job_no) <> ''";

            using (MySqlCommand command = new MySqlCommand(sql, conn))
            using (MySqlDataReader reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    int companyId = Convert.ToInt32(reader.GetValue(1));
                    string projectNo = reader.IsDBNull(3) ? "" : reader.GetString(3).Trim();
                    if (projectNo.Length == 0)
                    {
                        continue;
                    }
                    result[BuildInvoiceLinkKey(companyId, projectNo)] = new InvoiceLinkTarget
                    {
                        WorkOrderId = Convert.ToInt64(reader.GetValue(0)),
                        VehicleId = reader.IsDBNull(2) ? (long?)null : Convert.ToInt64(reader.GetValue(2)),
                        VehicleNo = reader.IsDBNull(4) ? "" : reader.GetString(4).Trim()
                    };
                }
            }
            return result;
        }

        private Dictionary<string, InvoiceLinkTarget> LoadVehicleInvoiceTargets(MySqlConnection conn)
        {
            Dictionary<string, InvoiceLinkTarget> result = new Dictionary<string, InvoiceLinkTarget>(StringComparer.OrdinalIgnoreCase);
            if (!CloudTableExists(conn, "customer_vehicle") ||
                !CloudColumnExists(conn, "customer_vehicle", "autocount_project_no") ||
                !CloudColumnExists(conn, "customer_vehicle", "company_id"))
            {
                return result;
            }

            using (MySqlCommand command = new MySqlCommand(
                "SELECT id, company_id, autocount_project_no, " +
                "COALESCE(NULLIF(TRIM(registration_no), ''), NULLIF(TRIM(vehicle_no), '')) FROM customer_vehicle " +
                "WHERE autocount_project_no IS NOT NULL AND TRIM(autocount_project_no) <> ''", conn))
            using (MySqlDataReader reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    int companyId = Convert.ToInt32(reader.GetValue(1));
                    string projectNo = reader.IsDBNull(2) ? "" : reader.GetString(2).Trim();
                    if (projectNo.Length == 0)
                    {
                        continue;
                    }
                    result[BuildInvoiceLinkKey(companyId, projectNo)] = new InvoiceLinkTarget
                    {
                        VehicleId = Convert.ToInt64(reader.GetValue(0)),
                        VehicleNo = reader.IsDBNull(3) ? "" : reader.GetString(3).Trim()
                    };
                }
            }
            return result;
        }

        private static string BuildInvoiceLinkKey(int companyId, string projectNo)
        {
            return companyId.ToString(CultureInfo.InvariantCulture) + "|" + (projectNo ?? "").Trim().ToUpperInvariant();
        }

        private static string GetTrimmedValue(DataRow row, string columnName)
        {
            return row.Table.Columns.Contains(columnName) && row[columnName] != DBNull.Value
                ? row[columnName].ToString().Trim()
                : "";
        }

        private static bool IsAutoCountTrue(object value)
        {
            if (value == null || value == DBNull.Value)
            {
                return false;
            }
            if (value is bool)
            {
                return (bool)value;
            }
            string normalized = value.ToString().Trim();
            return normalized == "1" ||
                   normalized.Equals("T", StringComparison.OrdinalIgnoreCase) ||
                   normalized.Equals("Y", StringComparison.OrdinalIgnoreCase) ||
                   normalized.Equals("TRUE", StringComparison.OrdinalIgnoreCase);
        }

        private static string FindColumn(DataTable table, params string[] candidates)
        {
            foreach (string candidate in candidates)
            {
                DataColumn column = table.Columns.Cast<DataColumn>()
                    .FirstOrDefault(c => string.Equals(c.ColumnName, candidate, StringComparison.OrdinalIgnoreCase));
                if (column != null)
                {
                    return column.ColumnName;
                }
            }
            return null;
        }

        /// <summary>
        /// One-way sync of a whole AutoCount master table into the cloud table of the same name.
        /// Only the columns present on both sides are written; the cloud row is keyed on keyColumn.
        /// </summary>
        private bool SyncTableToCloud(AutoCount.Authentication.UserSession userSession, ThreadObj callback,
            string tableName, string keyColumn)
        {
            int written = 0, skipped = 0;

            try
            {
                DataTable localTable = userSession.DBSetting.GetDataTable(
                    string.Format("SELECT * FROM [{0}]", tableName), false);
                callback.WriteInfo(string.Format("Read {0} {1} row(s) from AutoCount.", localTable.Rows.Count, tableName));

                if (localTable.Rows.Count == 0)
                {
                    return true;
                }

                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();

                    // Only sync the columns that exist on both sides, so a different AutoCount
                    // version (extra / missing columns) will not break the whole run.
                    List<string> columns = GetCommonColumns(conn, tableName, localTable, callback);
                    if (columns.Count == 0)
                    {
                        callback.WriteInfo(string.Format("No matching columns between local and cloud {0} table.", tableName));
                        return false;
                    }

                    string keyName = columns.FirstOrDefault(c => string.Equals(c, keyColumn, StringComparison.OrdinalIgnoreCase));
                    if (keyName == null)
                    {
                        callback.WriteInfo(string.Format("Column '{0}' not found, unable to synchronize {1}.", keyColumn, tableName));
                        return false;
                    }

                    List<DataRow> rows = new List<DataRow>();
                    foreach (DataRow row in localTable.Rows)
                    {
                        string key = row[keyName] == DBNull.Value ? "" : row[keyName].ToString().Trim();
                        if (key.Length == 0)
                        {
                            skipped++;
                            continue;
                        }
                        rows.Add(row);
                    }

                    // Image / blob columns make each row far heavier, keep the packet size sane.
                    bool hasBlob = columns.Any(c => localTable.Columns[c].DataType == typeof(byte[]));
                    int batchSize = hasBlob ? SyncBatchSizeWithBlob : SyncBatchSize;

                    for (int offset = 0; offset < rows.Count; offset += batchSize)
                    {
                        List<DataRow> batch = rows.Skip(offset).Take(batchSize).ToList();

                        using (MySqlTransaction trans = conn.BeginTransaction())
                        using (MySqlCommand cmd = conn.CreateCommand())
                        {
                            cmd.Transaction = trans;
                            cmd.CommandText = BuildUpsert(tableName, columns, keyName, batch, cmd);
                            cmd.ExecuteNonQuery();
                            trans.Commit();
                            written += batch.Count;
                        }

                        callback.WriteInfo(string.Format("Synchronized {0}/{1} {2} row(s)...",
                            Math.Min(offset + batchSize, rows.Count), rows.Count, tableName));
                    }

                    WriteSyncLog(conn, tableName, "Success", string.Format(
                        "AutoCount to Web, {0} row(s) written ({1} column(s)), {2} skipped", written, columns.Count, skipped));
                }

                callback.WriteInfo(string.Format("{0} synchronization done. {1} row(s) written, {2} skipped (blank {3}).",
                    tableName, written, skipped, keyColumn));
                return true;
            }
            catch (Exception ex)
            {
                callback.WriteInfo(string.Format("{0} synchronization failed: {1}", tableName, ex.Message));
                Console.WriteLine(tableName + " synchronization error: " + ex);
                SendTelegramMessage(string.Format("[Autocount Sync] {0} Synchronization failed: {1}", tableName, ex.Message));

                try
                {
                    using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                    {
                        conn.Open();
                        WriteSyncLog(conn, tableName, "Failed", "AutoCount to Web, " + ex.Message);
                    }
                }
                catch (Exception logEx)
                {
                    Console.WriteLine(tableName + " synchronization log error: " + logEx.Message);
                }
                return false;
            }
        }

        /// <summary>
        /// Returns the cloud column names (cloud spelling) that also exist in the local table.
        /// </summary>
        private List<string> GetCommonColumns(MySqlConnection conn, string tableName, DataTable localTable, ThreadObj callback)
        {
            List<string> cloudColumns = new List<string>();

            using (MySqlCommand cmd = new MySqlCommand(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tableName ORDER BY ORDINAL_POSITION", conn))
            {
                cmd.Parameters.AddWithValue("@tableName", tableName);
                using (MySqlDataReader reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        cloudColumns.Add(reader.GetString(0));
                    }
                }
            }

            HashSet<string> localColumns = new HashSet<string>(
                localTable.Columns.Cast<DataColumn>().Select(c => c.ColumnName), StringComparer.OrdinalIgnoreCase);

            // AutoCount LastUpdate is a binary row-version marker, not a date. LastModified
            // already carries the usable timestamp, so never copy LastUpdate into cloud DATETIME.
            List<string> common = cloudColumns.Where(c =>
                localColumns.Contains(c) &&
                !string.Equals(c, "LastUpdate", StringComparison.OrdinalIgnoreCase)).ToList();
            List<string> missing = cloudColumns.Where(c => !localColumns.Contains(c)).ToList();

            if (missing.Count > 0)
            {
                callback.WriteInfo(string.Format("Skipping {0} cloud {1} column(s) not present locally: {2}",
                    missing.Count, tableName, string.Join(", ", missing)));
            }
            return common;
        }

        /// <summary>
        /// Builds a multi-row "INSERT ... ON DUPLICATE KEY UPDATE" and fills cmd with its parameters.
        /// </summary>
        private string BuildUpsert(string tableName, List<string> columns, string keyName, List<DataRow> batch, MySqlCommand cmd)
        {
            StringBuilder sql = new StringBuilder();
            sql.Append("INSERT INTO `").Append(tableName).Append("` (");
            sql.Append(string.Join(", ", columns.Select(c => "`" + c + "`")));
            sql.Append(") VALUES ");

            for (int r = 0; r < batch.Count; r++)
            {
                if (r > 0) sql.Append(", ");
                sql.Append("(");
                for (int c = 0; c < columns.Count; c++)
                {
                    string paramName = string.Format("@p{0}_{1}", r, c);
                    if (c > 0) sql.Append(", ");
                    sql.Append(paramName);
                    cmd.Parameters.AddWithValue(paramName, ToCloudValue(batch[r][columns[c]]));
                }
                sql.Append(")");
            }

            // The key column is the primary key, no point rewriting it.
            List<string> updatable = columns.Where(c => !string.Equals(c, keyName, StringComparison.OrdinalIgnoreCase)).ToList();
            sql.Append(" ON DUPLICATE KEY UPDATE ");
            sql.Append(string.Join(", ", updatable.Select(c => string.Format("`{0}` = VALUES(`{0}`)", c))));

            return sql.ToString();
        }

        /// <summary>
        /// Converts an MSSQL value into something the MySQL driver accepts.
        /// </summary>
        private static object ToCloudValue(object value)
        {
            if (value == null || value == DBNull.Value)
            {
                return DBNull.Value;
            }
            if (value is DateTime)
            {
                DateTime dt = (DateTime)value;
                // MySQL DATETIME starts at year 1000, AutoCount uses 0001-01-01 as "empty".
                return dt.Year < 1000 ? (object)DBNull.Value : dt;
            }
            if (value is bool)
            {
                return ((bool)value) ? "T" : "F";
            }
            if (value is Guid)
            {
                return value.ToString();
            }
            return value;
        }

        private void WriteSyncLog(MySqlConnection conn, string type, string status, string remark)
        {
            using (MySqlCommand cmd = new MySqlCommand(
                "INSERT INTO `autocount_sync_from_log` (asfl_type, asfl_from_code, asfl_to_code, asfl_status, asfl_remark, customer_account_book) " +
                "VALUES (@type, @type, @type, @status, @remark, @accountBook)", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@status", status);
                cmd.Parameters.AddWithValue("@remark", remark);
                cmd.Parameters.AddWithValue("@accountBook", localDBName);
                cmd.ExecuteNonQuery();
            }
        }

        #endregion

        //Cloud to AutoCount Synchronization--------------------------------------------
        #region Sales invoice synchronization

        // Charge lines carry no AutoCount item code. Leave this blank to post them as
        // non-stock lines on the default sales account, or name an item code to use instead.
        private string defaultServiceItemCode = "";

        /// <summary>
        /// Posts every cloud draft_invoices row sitting at status 'Locked' into AutoCount as a
        /// Sales Invoice. AutoCount owns the invoice number: whatever it assigns is written back
        /// to autocount_invoice_no and the row moves to 'Synced', or to 'Sync Failed' with the
        /// reason. Rows that already carry an invoice number are never posted twice.
        /// </summary>
        private void SalesInvoiceSynchronization(AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            int created = 0, failed = 0;

            try
            {
                DataTable drafts;
                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    drafts = GetLockedDraftInvoices(conn);
                }

                callback.WriteInfo(string.Format("Found {0} locked draft invoice(s) to post.", drafts.Rows.Count));
                if (drafts.Rows.Count == 0)
                {
                    callback.SetTestSix(true);
                    return;
                }

                string salesAccount = new DataSql(userSession).GetDefaultSalesCode();

                foreach (DataRow draft in drafts.Rows)
                {
                    string draftId = draft["id"].ToString();
                    string draftNo = draft["draft_no"].ToString();

                    callback.WriteInfo(string.Format("[Sales Invoice] Synchronizing draft {0}...", draftNo));

                    DataTable charges = null;
                    try
                    {
                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Step 1/5: Fetching charge items from cloud DB...", draftNo));
                        using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                        {
                            conn.Open();
                            charges = GetDraftInvoiceCharges(conn, draftId);
                        }

                        if (charges == null || charges.Rows.Count == 0)
                        {
                            throw new Exception("Invoice has no charge lines.");
                        }

                        string billTo = draft["bill_to"].ToString();
                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Step 2/5: Resolving AutoCount Debtor Code for '{1}'...", draftNo, billTo));
                        string debtorCode = ResolveDebtorCode(userSession, billTo);

                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Step 3/5: Creating invoice in AutoCount under debtor '{1}'...", draftNo, debtorCode));
                        string docNo = CreateAutoCountInvoice(userSession, draft, charges, debtorCode, salesAccount);
                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Created AutoCount invoice number: {1}", draftNo, docNo));

                        // PDF Generation and Upload
                        string pdfUrl = null;
                        string pdfError = null;
                        try
                        {
                            callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Step 4/5: Generating local PDF invoice for {1}...", draftNo, docNo));

                            if (string.IsNullOrWhiteSpace(InvoiceExportDirectory) || string.IsNullOrWhiteSpace(CompanyShortCode))
                            {
                                throw new InvalidOperationException("MAW_INVOICE_EXPORT_DIR and MAW_COMPANY_SHORT_CODE must be configured.");
                            }

                            string baseFolder = InvoiceExportDirectory;
                            string companyShortCode = CompanyShortCode;
                            string customerShortCode = debtorCode;

                            string dateFolder = DateTime.Now.ToString("yyyy-MM-dd");
                            string safeDraftNo = string.Join("_", draftNo.Split(Path.GetInvalidFileNameChars()));
                            string fileName = string.Format("{0:dd_MM}-{1}-{2}.pdf", DateTime.Now, customerShortCode, safeDraftNo);

                            string folderPath = Path.Combine(baseFolder, companyShortCode, dateFolder);
                            Directory.CreateDirectory(folderPath);

                            string pdfPath = Path.Combine(folderPath, fileName);

                            if (string.IsNullOrWhiteSpace(ReportTemplate))
                            {
                                throw new InvalidOperationException("MAW_AUTOCOUNT_REPORT_TEMPLATE is not configured.");
                            }

                            string pdfTemplate = ReportTemplate;
                            ExportToPDF(docNo, pdfTemplate, pdfPath, userSession, callback);

                            callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] PDF successfully generated at: {1}", draftNo, pdfPath));

                            // Upload PDF to Cloud
                            callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Uploading PDF to Cloud...", draftNo));
                            string uploadEndpoint = UploadPdfInvoiceLink;

                            if (!File.Exists(pdfPath))
                            {
                                throw new FileNotFoundException("PDF file not found", pdfPath);
                            }

                            if (string.IsNullOrWhiteSpace(AutoCountSyncToken))
                            {
                                throw new InvalidOperationException("MAW_AUTOCOUNT_SYNC_TOKEN is not configured.");
                            }

                            if (string.IsNullOrWhiteSpace(uploadEndpoint))
                            {
                                throw new InvalidOperationException("MAW_PDF_UPLOAD_URL is not configured.");
                            }

                            using (var http = new HttpClient())
                            using (var form = new MultipartFormDataContent())
                            using (var fs = File.OpenRead(pdfPath))
                            {
                                http.DefaultRequestHeaders.Add("X-Sync-Token", AutoCountSyncToken);
                                var fileContent = new StreamContent(fs);
                                fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
                                form.Add(fileContent, "pdf", Path.GetFileName(pdfPath));
                                form.Add(new StringContent(docNo), "docNo");

                                var resp = http.PostAsync(uploadEndpoint, form).Result;
                                string respText = resp.Content.ReadAsStringAsync().Result;

                                if (!resp.IsSuccessStatusCode)
                                {
                                    throw new Exception(string.Format("Upload failed: {0} {1}. Response: {2}", (int)resp.StatusCode, resp.ReasonPhrase, respText));
                                }

                                using (JsonDocument json = JsonDocument.Parse(respText))
                                {
                                    var root = json.RootElement;
                                    bool ok = root.TryGetProperty("ok", out var okProp) && okProp.GetBoolean();
                                    if (!ok)
                                    {
                                        string err = root.TryGetProperty("error", out var errProp) ? errProp.GetString() : "Unknown error";
                                        throw new Exception("Upload error: " + err);
                                    }
                                    pdfUrl = root.TryGetProperty("url", out var urlProp) ? urlProp.GetString() : null;
                                }
                            }

                            if (string.IsNullOrWhiteSpace(pdfUrl))
                            {
                                throw new Exception("Upload succeeded but URL is empty.");
                            }
                            callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] PDF uploaded to Cloud. URL: {1}", draftNo, pdfUrl));
                        }
                        catch (Exception pdfEx)
                        {
                            pdfError = pdfEx.Message;
                            callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] PDF generation or upload failed: {1}", draftNo, pdfEx.Message));
                            Console.WriteLine("PDF Generation or Upload error: " + pdfEx);
                        }

                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Step 5/5: Updating cloud database status to Synced...", draftNo));
                        using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                        {
                            conn.Open();
                            MarkDraftInvoiceSynced(conn, draftId, docNo, pdfUrl, pdfError);
                            WriteSyncToLog(conn, "Sales Invoice", draftNo, docNo, "Succeed", pdfError ?? "", "Web to AutoCount, Insert");
                        }
                        created++;
                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Sync completed successfully.", draftNo));
                    }
                    catch (Exception ex)
                    {
                        callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Sync failed. Updating cloud status to Sync Failed. Error: {1}", draftNo, ex.Message));
                        try
                        {
                            using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                            {
                                conn.Open();
                                MarkDraftInvoiceFailed(conn, draftId, ex.Message);
                                WriteSyncToLog(conn, "Sales Invoice", draftNo, "", "Failed", ex.Message, "Web to AutoCount, Insert");
                            }
                        }
                        catch (Exception dbEx)
                        {
                            Console.WriteLine("Failed to write fail status to cloud DB: " + dbEx.Message);
                            callback.WriteInfo(string.Format("[Sales Invoice] [Draft {0}] Critical database error writing fail status: {1}", draftNo, dbEx.Message));
                        }
                        failed++;
                        callback.WriteInfo(string.Format("Draft {0} failed: {1}", draftNo, ex.Message));
                        Console.WriteLine("SalesInvoiceSynchronization error on draft " + draftNo + ": " + ex);
                        SendTelegramMessage(string.Format("[Autocount Sync] Draft {0} failed: {1}", draftNo, ex.Message));
                    }
                }

                callback.WriteInfo(string.Format("Sales invoice synchronization done. {0} created, {1} failed.", created, failed));
                callback.SetTestSix(failed == 0);
            }
            catch (Exception ex)
            {
                callback.WriteInfo("Sales invoice synchronization failed: " + ex.Message);
                callback.SetTestSix(false);
                Console.WriteLine("SalesInvoiceSynchronization error: " + ex);
                SendTelegramMessage(string.Format("[Autocount Sync] Sales Invoice Synchronization process failed: {0}", ex.Message));
            }
        }

        /// <summary>
        /// Locked invoices that have not been given an AutoCount number yet, oldest first.
        /// </summary>
        private DataTable GetLockedDraftInvoices(MySqlConnection conn)
        {
            DataTable table = new DataTable();
            using (MySqlCommand cmd = new MySqlCommand(
                "SELECT * FROM `draft_invoices` " +
                "WHERE status = 'Locked' AND is_deleted = 0 " +
                "AND (autocount_invoice_no IS NULL OR autocount_invoice_no = '') " +
                "ORDER BY id ASC", conn))
            using (MySqlDataAdapter adapter = new MySqlDataAdapter(cmd))
            {
                adapter.Fill(table);
            }
            return table;
        }

        private DataTable GetDraftInvoiceCharges(MySqlConnection conn, string draftId)
        {
            DataTable table = new DataTable();
            using (MySqlCommand cmd = new MySqlCommand(
                "SELECT * FROM `draft_invoice_charges` WHERE draft_id = @draftId " +
                "ORDER BY charge_type ASC, item_no ASC, id ASC", conn))
            {
                cmd.Parameters.AddWithValue("@draftId", draftId);
                using (MySqlDataAdapter adapter = new MySqlDataAdapter(cmd))
                {
                    adapter.Fill(table);
                }
            }
            return table;
        }

        /// <summary>
        /// Maps the invoice's bill-to company name onto an AutoCount debtor code by searching
        /// the local AutoCount Debtor table's CompanyName column.
        /// </summary>
        private string ResolveDebtorCode(AutoCount.Authentication.UserSession userSession, string billTo)
        {
            if (string.IsNullOrEmpty(billTo) || billTo.Trim().Length == 0)
            {
                throw new Exception("Invoice has no Bill To party.");
            }

            // Search local Debtor table using the bill_to name matching CompanyName
            DataTable debtor = userSession.DBSetting.GetDataTable(string.Format(
                "SELECT AccNo FROM Debtor WHERE CompanyName = '{0}'", billTo.Replace("'", "''")), false);

            if (debtor.Rows.Count == 0)
            {
                // Fallback to trimmed match in case of leading/trailing spaces
                debtor = userSession.DBSetting.GetDataTable(string.Format(
                    "SELECT AccNo FROM Debtor WHERE LTRIM(RTRIM(CompanyName)) = LTRIM(RTRIM('{0}'))", billTo.Replace("'", "''")), false);
            }

            if (debtor.Rows.Count == 0)
            {
                throw new Exception(string.Format(
                    "Debtor with CompanyName '{0}' does not exist in AutoCount.", billTo));
            }

            string debtorCode = debtor.Rows[0]["AccNo"].ToString().Trim();
            return debtorCode;
        }

        /// <summary>
        /// Builds and saves the AutoCount Sales Invoice, returning the document number
        /// AutoCount assigned to it.
        /// </summary>
        private string CreateAutoCountInvoice(AutoCount.Authentication.UserSession userSession, DataRow draft,
            DataTable charges, string debtorCode, string salesAccount)
        {
            AutoCount.Invoicing.Sales.Invoice.InvoiceCommand cmd =
                AutoCount.Invoicing.Sales.Invoice.InvoiceCommand.Create(userSession, userSession.DBSetting);
            AutoCount.Invoicing.Sales.Invoice.Invoice doc = cmd.AddNew();
            AutoCount.Invoicing.Sales.Invoice.InvoiceDetail detail;

            doc.DebtorCode = debtorCode;
            doc.SubmitEInvoice = true;

            string billTo = draft["bill_to"].ToString();
            if (billTo.Length > 0)
            {
                doc.DebtorName = Truncate(billTo, 100);
            }

            DateTime? invoiceDate = ToNullableDate(draft["invoice_date"]);
            if (invoiceDate.HasValue)
            {
                doc.DocDate = invoiceDate.Value;
            }

            // The workshop's own running number goes in Ref; AutoCount keeps ownership of DocNo.
            doc.Ref = Truncate(draft["draft_no"].ToString(), 30);

            // Populate UDF fields from draft row columns (AutoCount SDK automatically prepends "UDF_" to key names)
            SetUdfIfPresent(doc, "VOLUME", draft, "container_summary");
            SetUdfIfPresent(doc, "CONTAINER", draft, "container_nos");
            SetUdfIfPresent(doc, "PLOADING", draft, "pol");
            SetUdfIfPresent(doc, "PDISC", draft, "pod");

            // Populate CNEE (C'NEE/SHIPPER) using shipper_name directly
            if (draft.Table.Columns.Contains("shipper_name") && draft["shipper_name"] != DBNull.Value)
            {
                string shipper = draft["shipper_name"].ToString().Trim();
                if (!string.IsNullOrEmpty(shipper))
                {
                    try { doc.UDF["CNEE"] = Truncate(shipper, 100); } catch { }
                }
            }

            // Populate BLNO (BL No.)
            SetUdfIfPresent(doc, "BLNO", draft, "booking_no");

            // Populate COMMODITY (COMMODITY)
            SetUdfIfPresent(doc, "COMMODITY", draft, "invoice_type");

            // Populate ETDETA as DateTime if present
            if (draft.Table.Columns.Contains("eta_date") && draft["eta_date"] != DBNull.Value)
            {
                DateTime? etaDate = ToNullableDate(draft["eta_date"]);
                if (etaDate.HasValue)
                {
                    try
                    {
                        doc.UDF["ETDETA"] = etaDate.Value;
                    }
                    catch
                    {
                        try
                        {
                            doc.UDF["ETDETA"] = etaDate.Value.ToString("yyyy-MM-dd");
                        }
                        catch { }
                    }
                }
            }

            // Populate VSLNAME by combining vessel_name and voyage_no
            if (draft.Table.Columns.Contains("vessel_name") && draft["vessel_name"] != DBNull.Value)
            {
                string vessel = draft["vessel_name"].ToString().Trim();
                string voyage = "";
                if (draft.Table.Columns.Contains("voyage_no") && draft["voyage_no"] != DBNull.Value)
                {
                    voyage = draft["voyage_no"].ToString().Trim();
                }

                string combinedVslName = vessel;
                if (!string.IsNullOrEmpty(voyage))
                {
                    combinedVslName = vessel + "." + voyage;
                }

                if (!string.IsNullOrEmpty(combinedVslName))
                {
                    try
                    {
                        doc.UDF["VSLNAME"] = Truncate(combinedVslName, 100);
                    }
                    catch { }
                }
            }

            string remark = BuildInvoiceRemark(draft);
            if (remark.Length > 0)
            {
                doc.Remark1 = Truncate(remark, 200);
            }

            foreach (DataRow charge in charges.Rows)
            {
                detail = doc.AddDetail();

                string chargeDescription = charge["description"] != DBNull.Value ? charge["description"].ToString().Trim() : "";
                string matchedItemCode = ResolveItemCodeByDescription(chargeDescription);

                if (!string.IsNullOrEmpty(matchedItemCode))
                {
                    detail.ItemCode = matchedItemCode;
                }
                else if (defaultServiceItemCode.Length > 0)
                {
                    detail.ItemCode = defaultServiceItemCode;
                }
                else if (!string.IsNullOrEmpty(salesAccount))
                {
                    // Non-stock line: the amount has to land on a sales account.
                    detail.AccNo = salesAccount;
                }

                detail.Description = Truncate(charge["description"].ToString(), 200);

                decimal qty = ToDecimal(charge["qty"]);
                decimal unitPrice = ToDecimal(charge["unit_price"]);
                if (qty == 0)
                {
                    // A lump-sum charge carries its value in amount, not qty x unit price.
                    qty = 1;
                    unitPrice = ToDecimal(charge["amount"]);
                }
                detail.Qty = (decimal?)qty;
                detail.UnitPrice = unitPrice;
                if (string.IsNullOrEmpty(detail.Classification))
                {
                    detail.Classification = "022";
                }
            }

            doc.Save();
            return doc.DocNo;
        }

        private string ResolveItemCodeByDescription(string description)
        {
            if (string.IsNullOrEmpty(description))
            {
                return null;
            }

            try
            {
                using (MySqlConnection conn = new MySqlConnection(GetCloudConnectionString()))
                {
                    conn.Open();
                    string query = "SELECT ItemCode FROM `Item` WHERE Description = @description LIMIT 1";
                    using (MySqlCommand cmd = new MySqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@description", description);
                        object result = cmd.ExecuteScalar();
                        if (result != null && result != DBNull.Value)
                        {
                            return result.ToString().Trim();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error resolving ItemCode by description: " + ex.Message);
            }
            return null;
        }

        private static void SetUdfIfPresent(AutoCount.Invoicing.Sales.Invoice.Invoice doc, string udfName, DataRow draft, string columnName)
        {
            if (draft.Table.Columns.Contains(columnName) && draft[columnName] != DBNull.Value)
            {
                string val = draft[columnName].ToString().Trim();
                if (!string.IsNullOrEmpty(val))
                {
                    try
                    {
                        doc.UDF[udfName] = val;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Failed to set UDF " + udfName + ": " + ex.Message);
                    }
                }
            }
        }

        /// <summary>
        /// Shipment details that belong on the invoice but have no dedicated AutoCount field.
        /// </summary>
        private string BuildInvoiceRemark(DataRow draft)
        {
            List<string> parts = new List<string>();
            string[] fields = { "reference", "vessel_name", "voyage_no", "container_summary" };

            foreach (string field in fields)
            {
                if (!draft.Table.Columns.Contains(field) || draft[field] == DBNull.Value)
                {
                    continue;
                }
                string value = draft[field].ToString().Trim();
                if (value.Length > 0)
                {
                    parts.Add(value);
                }
            }
            return string.Join(" / ", parts);
        }

        private void MarkDraftInvoiceSynced(MySqlConnection conn, string draftId, string docNo, string pdfUrl, string pdfError)
        {
            using (MySqlCommand cmd = new MySqlCommand(
                "UPDATE `draft_invoices` SET status = 'Synced', autocount_invoice_no = @docNo, " +
                "pdf_url = @pdfUrl, sync_date = NOW(), sync_error = @pdfError WHERE id = @id AND status = 'Locked'", conn))
            {
                cmd.Parameters.AddWithValue("@docNo", docNo);
                cmd.Parameters.AddWithValue("@pdfUrl", (object)pdfUrl ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@pdfError", (object)pdfError ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@id", draftId);
                cmd.ExecuteNonQuery();
            }
        }

        private void ExportToPDF(string docNo, string reportName, string fullpathname, AutoCount.Authentication.UserSession userSession, ThreadObj callback)
        {
            AutoCount.Invoicing.Sales.Invoice.InvoiceCommand cmd = AutoCount.Invoicing.Sales.Invoice.InvoiceCommand.Create(userSession, userSession.DBSetting);
            AutoCount.Invoicing.Sales.Invoice.InvoiceListingReport report = AutoCount.Invoicing.Sales.Invoice.InvoiceListingReport.Create(userSession);
            long docKey = cmd.GetDocKeyByDocNo(docNo);
            object dataSource = report.GetReportDataSource(docKey);
            AutoCount.Report.BasicReportOption rptOption = report.GetBasicReportOption();
            AutoCount.Report.ReportInfo rptInfo = new AutoCount.Report.ReportInfo(AutoCount.Localization.Localizer.GetString(AutoCount.Invoicing.Sales.Invoice.InvoiceString.Invoice, ""), "", "", "");

            AutoCount.Report.ReportTool.ExportReportByName(reportName, dataSource, userSession, rptOption, rptInfo, fullpathname, AutoCount.Report.ExportFormat.Pdf);
        }

        public static void SendTelegramMessage(string message)
        {
            try
            {
                string token = TelegramBotToken;
                string chatId = TelegramSystemProblemChatId;

                if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(chatId) || chatId == "-")
                {
                    return;
                }

                // If chatId is a username/channel/group name but doesn't start with '@' or '-', prefix it with '@'
                if (!chatId.StartsWith("@") && !chatId.StartsWith("-") && !long.TryParse(chatId, out _))
                {
                    chatId = "@" + chatId;
                }

                string url = string.Format("https://api.telegram.org/bot{0}/sendMessage", token);

                using (var client = new HttpClient())
                {
                    var values = new Dictionary<string, string>
                    {
                        { "chat_id", chatId },
                        { "text", message }
                    };

                    var content = new FormUrlEncodedContent(values);
                    var response = client.PostAsync(url, content).Result;
                    if (!response.IsSuccessStatusCode)
                    {
                        string errorText = response.Content.ReadAsStringAsync().Result;
                        Console.WriteLine("Telegram send failed: " + errorText);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error sending Telegram message: " + ex.Message);
            }
        }

        private void MarkDraftInvoiceFailed(MySqlConnection conn, string draftId, string error)
        {
            using (MySqlCommand cmd = new MySqlCommand(
                "UPDATE `draft_invoices` SET status = 'Sync Failed', sync_error = @error " +
                "WHERE id = @id AND status = 'Locked'", conn))
            {
                cmd.Parameters.AddWithValue("@error", Truncate(error, 500));
                cmd.Parameters.AddWithValue("@id", draftId);
                cmd.ExecuteNonQuery();
            }
        }

        private void WriteSyncToLog(MySqlConnection conn, string type, string fromCode, string toCode,
            string status, string exMessage, string remark)
        {
            using (MySqlCommand cmd = new MySqlCommand(
                "INSERT INTO `autocount_sync_to_log` " +
                "(astl_type, astl_from_code, astl_to_code, astl_status, astl_ex_message, astl_remark, customer_account_book) " +
                "VALUES (@type, @fromCode, @toCode, @status, @exMessage, @remark, @accountBook)", conn))
            {
                cmd.Parameters.AddWithValue("@type", type);
                cmd.Parameters.AddWithValue("@fromCode", fromCode);
                cmd.Parameters.AddWithValue("@toCode", toCode);
                cmd.Parameters.AddWithValue("@status", status);
                cmd.Parameters.AddWithValue("@exMessage", Truncate(exMessage, 500));
                cmd.Parameters.AddWithValue("@remark", remark);
                cmd.Parameters.AddWithValue("@accountBook", localDBName);
                cmd.ExecuteNonQuery();
            }
        }

        private static DateTime? ToNullableDate(object value)
        {
            if (value == null || value == DBNull.Value)
            {
                return null;
            }
            if (value is DateTime)
            {
                return (DateTime)value;
            }
            DateTime parsed;
            return DateTime.TryParse(value.ToString(), out parsed) ? (DateTime?)parsed : null;
        }

        private static decimal ToDecimal(object value)
        {
            if (value == null || value == DBNull.Value)
            {
                return 0m;
            }
            decimal parsed;
            return decimal.TryParse(value.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out parsed) ? parsed : 0m;
        }

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "";
            }
            return value.Length <= maxLength ? value : value.Substring(0, maxLength);
        }

        #endregion
    }
    public class IniFile
    {
        string Path;
        [System.Runtime.InteropServices.DllImport("kernel32", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern long WritePrivateProfileString(string Section, string Key, string Value, string FilePath);
        [System.Runtime.InteropServices.DllImport("kernel32", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern int GetPrivateProfileString(string Section, string Key, string Default, System.Text.StringBuilder RetVal, int Size, string FilePath);
        public IniFile(string IniPath) { Path = new System.IO.FileInfo(IniPath).FullName; }
        public string Read(string Section, string Key)
        {
            var RetVal = new System.Text.StringBuilder(255);
            GetPrivateProfileString(Section, Key, "", RetVal, 255, Path);
            return RetVal.ToString();
        }
        public void Write(string Section, string Key, string Value) { WritePrivateProfileString(Section, Key, Value, Path); }
    }
}
