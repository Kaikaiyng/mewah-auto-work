using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Collections;


namespace Autocount_Sync_Program.Utils
{
    class Conversion
    {
        internal static string FieldnamesToCommaString(IEnumerable fieldnames)
            => AutoCount.Utils.StringHelper.ArrayListToCommaString(new ArrayList(fieldnames as ICollection));
        internal static int TextToInteger(string strPort) => Int32.TryParse(strPort, out int port) ? port : default(int);
    }
}
