using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Reflection;
using System.Diagnostics;
using AutoCount.Authentication;

namespace Autocount_Sync_Program.Utils
{
    internal class App
    {
        internal static string GetVersion()
        {
            Version ver = Assembly.GetExecutingAssembly().GetName().Version;
            return string.Format("version {0}.{1}", ver.Major, ver.Minor);           
        }
    }
}
