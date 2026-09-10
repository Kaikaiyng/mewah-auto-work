using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Autocount_Sync_Program.Utils
{
    class DataSql
    {
        private AutoCount.Authentication.UserSession myUserSession;

        public DataSql(AutoCount.Authentication.UserSession userSession) { myUserSession = userSession; }

        internal string GetOneDebtorCode()
        {
            object obj = myUserSession.DBSetting.ExecuteScalar("SELECT TOP 1 AccNo FROM Debtor WHERE IsActive='T' AND IsGroupCompany='F'");
            return obj == null ? default(string) : obj.ToString();
        }

        internal string GetDefaultSalesCode()
        {
            string str = null;
            try
            {
                str = AutoCount.Data.DBRegistry.Create(myUserSession.DBSetting).GetString(new AutoCount.RegistryID.DefaultAccount.SaleAccountID());
            }
            catch { }

            if (string.IsNullOrEmpty(str))
            {
                str = "500-0000";
            }

            try
            {
                // Verify that the account exists and is a Sales account (AccType = 'SL')
                object accTypeObj = myUserSession.DBSetting.ExecuteScalar(string.Format(
                    "SELECT AccType FROM GLMast WHERE AccNo = '{0}'", str.Replace("'", "''")));
                if (accTypeObj == null || accTypeObj.ToString().Trim() != "SL")
                {
                    // Fallback to the first available SL (Sales) account in the Chart of Accounts
                    object firstSl = myUserSession.DBSetting.ExecuteScalar(
                        "SELECT TOP 1 AccNo FROM GLMast WHERE AccType = 'SL' ORDER BY AccNo");
                    if (firstSl != null)
                    {
                        str = firstSl.ToString();
                    }
                    else
                    {
                        str = "500-0000"; // Hardcoded fallback if no SL account is found
                    }
                }
            }
            catch
            {
                str = "500-0000";
            }

            return string.IsNullOrEmpty(str) ? null : str;
        }
    }
}
