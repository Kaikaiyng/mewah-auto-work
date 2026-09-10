using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Data;

using Autocount_Sync_Program.Utils;

namespace Autocount_Sync_Program
{
    class SqlConnect
    {
        public string GetServerName(string server, string instance, string strPort)
        {
            int port = Conversion.TextToInteger(strPort);
            return ServerInstanceName.JoinServerInstanceName(server, instance, port);
        }

        public AutoCount.Authentication.UserSession GetUserSession(string serverName, string dbName, string saPassword)
        {
            try
            {
                if (string.IsNullOrEmpty(saPassword))
                    return new AutoCount.Authentication.UserSession(new AutoCount.Data.DBSetting(AutoCount.Data.DBServerType.SQL2000, serverName, dbName));
                else
                    return new AutoCount.Authentication.UserSession(new AutoCount.Data.DBSetting(AutoCount.Data.DBServerType.SQL2000, serverName,
                        AutoCount.Const.AppConst.DefaultUserName, saPassword, dbName));
            }
            catch (AutoCount.AppException ex)
            {
                Console.WriteLine("AutoCount Connection Error: " + ex.Message);
                return null;
            }
        }

        public bool TestConnectToSql(AutoCount.Data.DBSetting dbSetting)
        {
            try
            {
                object obj = dbSetting.ExecuteScalar("SELECT 1");
                return obj == null ? false : AutoCount.Converter.ToInt32(obj) == 1;
            }
            catch (AutoCount.AppException)
            {
                return false;
            }
        }
    }
}
