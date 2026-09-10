using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Autocount_Sync_Program.Utils
{
    internal class PreloadData : DataSql
    {
        public bool IsValidData { get; }
        public string DebtorCode { get; set; }
        public string SaleAccNo { get; set; }

        public PreloadData(AutoCount.Authentication.UserSession userSession) : base(userSession)
        {
            DebtorCode = base.GetOneDebtorCode();
            SaleAccNo = base.GetDefaultSalesCode();
            IsValidData = !string.IsNullOrEmpty(DebtorCode) && !string.IsNullOrEmpty(SaleAccNo);
        }
    }
}
