using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;


namespace Autocount_Sync_Program.Utils
{
    class ServerInstanceName
    {
        internal static Func<string, string, int, string> JoinServerInstanceName = (svr, inst, port)
            => string.Format("{0}{1}", svr, ServerInstance(inst, port));

        #region Server Instance Name
        private static Func<string, int, string> ServerInstance = (s, p)
            => p == default(int) ? InstanceNameOnly(s) : InstanceNameAndPort(s, p);
        private static Func<string, string> InstanceNameOnly = s => $"\\{s}";
        private static Func<string, int, string> InstanceNameAndPort = (s, p)
            => string.IsNullOrEmpty(s) ? $",{p}" : $"\\{s},{p}";
        #endregion
    }
}
