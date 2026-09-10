using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Autocount_Sync_Program
{
    class ThreadObj
    {
        internal Action<string> WriteInfo;
        internal Action WriteErrorStop;
        internal Action<bool> SetTestOne;
        internal Action<bool> SetTestTwo;
        internal Action<bool> SetTestThree;
        internal Action<bool> SetTestFour;
        internal Action<bool> SetTestFive;
        internal Action<bool> SetTestSix;
    }
}
