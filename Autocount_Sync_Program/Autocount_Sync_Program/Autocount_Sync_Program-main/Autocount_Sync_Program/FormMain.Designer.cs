namespace Autocount_Sync_Program
{
    partial class FormMain
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.label1 = new System.Windows.Forms.Label();
            this.textServer = new System.Windows.Forms.TextBox();
            this.textInstance = new System.Windows.Forms.TextBox();
            this.label2 = new System.Windows.Forms.Label();
            this.label3 = new System.Windows.Forms.Label();
            this.textPort = new System.Windows.Forms.TextBox();
            this.panel1 = new System.Windows.Forms.Panel();
            this.splitContainer2 = new System.Windows.Forms.SplitContainer();
            this.testinglabel = new System.Windows.Forms.Label();
            this.groupBox2 = new System.Windows.Forms.GroupBox();
            this.textPassword2 = new System.Windows.Forms.TextBox();
            this.textUserID2 = new System.Windows.Forms.TextBox();
            this.label13 = new System.Windows.Forms.Label();
            this.label14 = new System.Windows.Forms.Label();
            this.btnExit = new System.Windows.Forms.Button();
            this.groupBox3 = new System.Windows.Forms.GroupBox();
            this.textPassword = new System.Windows.Forms.TextBox();
            this.textUserID = new System.Windows.Forms.TextBox();
            this.label9 = new System.Windows.Forms.Label();
            this.label10 = new System.Windows.Forms.Label();
            this.groupBox1 = new System.Windows.Forms.GroupBox();
            this.chkDefaultSA = new System.Windows.Forms.CheckBox();
            this.textDBName2 = new System.Windows.Forms.TextBox();
            this.label11 = new System.Windows.Forms.Label();
            this.groupBoxSA = new System.Windows.Forms.GroupBox();
            this.textSAPassword = new System.Windows.Forms.TextBox();
            this.textSAUser = new System.Windows.Forms.TextBox();
            this.label8 = new System.Windows.Forms.Label();
            this.label7 = new System.Windows.Forms.Label();
            this.textDBName = new System.Windows.Forms.TextBox();
            this.label5 = new System.Windows.Forms.Label();
            this.btnTestConnection = new System.Windows.Forms.Button();
            this.panelStatusMsg = new System.Windows.Forms.Panel();
            this.splitContainer1 = new System.Windows.Forms.SplitContainer();
            this.chkListStatus = new System.Windows.Forms.CheckedListBox();
            this.label6 = new System.Windows.Forms.Label();
            this.listBoxMessage = new System.Windows.Forms.ListBox();
            this.label4 = new System.Windows.Forms.Label();
            this.panel1.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer2)).BeginInit();
            this.splitContainer2.Panel1.SuspendLayout();
            this.splitContainer2.Panel2.SuspendLayout();
            this.splitContainer2.SuspendLayout();
            this.groupBox2.SuspendLayout();
            this.groupBox3.SuspendLayout();
            this.groupBox1.SuspendLayout();
            this.groupBoxSA.SuspendLayout();
            this.panelStatusMsg.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer1)).BeginInit();
            this.splitContainer1.Panel1.SuspendLayout();
            this.splitContainer1.Panel2.SuspendLayout();
            this.splitContainer1.SuspendLayout();
            this.SuspendLayout();
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(11, 34);
            this.label1.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(97, 13);
            this.label1.TabIndex = 1;
            this.label1.Text = "Server Name or IP:";
            // 
            // textServer
            // 
            this.textServer.Location = new System.Drawing.Point(153, 31);
            this.textServer.Margin = new System.Windows.Forms.Padding(4);
            this.textServer.Name = "textServer";
            this.textServer.Size = new System.Drawing.Size(172, 20);
            this.textServer.TabIndex = 2;
            // 
            // textInstance
            // 
            this.textInstance.Location = new System.Drawing.Point(153, 55);
            this.textInstance.Margin = new System.Windows.Forms.Padding(4);
            this.textInstance.Name = "textInstance";
            this.textInstance.Size = new System.Drawing.Size(172, 20);
            this.textInstance.TabIndex = 3;
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Location = new System.Drawing.Point(11, 58);
            this.label2.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(106, 13);
            this.label2.TabIndex = 4;
            this.label2.Text = "SQL Instance Name:";
            // 
            // label3
            // 
            this.label3.AutoSize = true;
            this.label3.Location = new System.Drawing.Point(11, 84);
            this.label3.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label3.Name = "label3";
            this.label3.Size = new System.Drawing.Size(53, 13);
            this.label3.TabIndex = 5;
            this.label3.Text = "SQL Port:";
            // 
            // textPort
            // 
            this.textPort.Location = new System.Drawing.Point(153, 80);
            this.textPort.Margin = new System.Windows.Forms.Padding(4);
            this.textPort.Name = "textPort";
            this.textPort.Size = new System.Drawing.Size(172, 20);
            this.textPort.TabIndex = 6;
            // 
            // panel1
            // 
            this.panel1.Controls.Add(this.splitContainer2);
            this.panel1.Dock = System.Windows.Forms.DockStyle.Top;
            this.panel1.Location = new System.Drawing.Point(0, 0);
            this.panel1.Margin = new System.Windows.Forms.Padding(4);
            this.panel1.Name = "panel1";
            this.panel1.Size = new System.Drawing.Size(1209, 383);
            this.panel1.TabIndex = 10;
            // 
            // splitContainer2
            // 
            this.splitContainer2.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer2.FixedPanel = System.Windows.Forms.FixedPanel.Panel1;
            this.splitContainer2.Location = new System.Drawing.Point(0, 0);
            this.splitContainer2.Margin = new System.Windows.Forms.Padding(4);
            this.splitContainer2.Name = "splitContainer2";
            // 
            // splitContainer2.Panel1
            // 
            this.splitContainer2.Panel1.Controls.Add(this.groupBox2);
            this.splitContainer2.Panel1.Controls.Add(this.btnExit);
            this.splitContainer2.Panel1.Controls.Add(this.groupBox3);
            this.splitContainer2.Panel1.Controls.Add(this.groupBox1);
            this.splitContainer2.Panel1.Controls.Add(this.btnTestConnection);
            this.splitContainer2.Panel1MinSize = 50;
            // 
            // splitContainer2.Panel2
            // 
            this.splitContainer2.Panel2.Controls.Add(this.panelStatusMsg);
            this.splitContainer2.Panel2MinSize = 50;
            this.splitContainer2.Size = new System.Drawing.Size(1209, 383);
            this.splitContainer2.SplitterDistance = 636;
            this.splitContainer2.SplitterWidth = 7;
            this.splitContainer2.TabIndex = 17;
            // 
            // testinglabel
            // 
            this.testinglabel.AutoSize = true;
            this.testinglabel.Font = new System.Drawing.Font("Microsoft Sans Serif", 48F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.testinglabel.ForeColor = System.Drawing.Color.OrangeRed;
            this.testinglabel.Location = new System.Drawing.Point(339, 387);
            this.testinglabel.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.testinglabel.Name = "testinglabel";
            this.testinglabel.Size = new System.Drawing.Size(531, 73);
            this.testinglabel.TabIndex = 21;
            this.testinglabel.Text = "TESTING MODE";
            // 
            // groupBox2
            // 
            this.groupBox2.Controls.Add(this.textPassword2);
            this.groupBox2.Controls.Add(this.textUserID2);
            this.groupBox2.Controls.Add(this.label13);
            this.groupBox2.Controls.Add(this.label14);
            this.groupBox2.Location = new System.Drawing.Point(387, 158);
            this.groupBox2.Margin = new System.Windows.Forms.Padding(4);
            this.groupBox2.Name = "groupBox2";
            this.groupBox2.Padding = new System.Windows.Forms.Padding(4);
            this.groupBox2.Size = new System.Drawing.Size(219, 129);
            this.groupBox2.TabIndex = 20;
            this.groupBox2.TabStop = false;
            this.groupBox2.Text = "Account Book 2 Login";
            // 
            // textPassword2
            // 
            this.textPassword2.Location = new System.Drawing.Point(11, 95);
            this.textPassword2.Margin = new System.Windows.Forms.Padding(4);
            this.textPassword2.Name = "textPassword2";
            this.textPassword2.PasswordChar = '*';
            this.textPassword2.Size = new System.Drawing.Size(201, 20);
            this.textPassword2.TabIndex = 7;
            // 
            // textUserID2
            // 
            this.textUserID2.Location = new System.Drawing.Point(11, 42);
            this.textUserID2.Margin = new System.Windows.Forms.Padding(4);
            this.textUserID2.Name = "textUserID2";
            this.textUserID2.Size = new System.Drawing.Size(201, 20);
            this.textUserID2.TabIndex = 6;
            // 
            // label13
            // 
            this.label13.AutoSize = true;
            this.label13.Location = new System.Drawing.Point(7, 75);
            this.label13.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label13.Name = "label13";
            this.label13.Size = new System.Drawing.Size(56, 13);
            this.label13.TabIndex = 5;
            this.label13.Text = "Password:";
            // 
            // label14
            // 
            this.label14.AutoSize = true;
            this.label14.Location = new System.Drawing.Point(7, 23);
            this.label14.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label14.Name = "label14";
            this.label14.Size = new System.Drawing.Size(46, 13);
            this.label14.TabIndex = 4;
            this.label14.Text = "User ID:";
            // 
            // btnExit
            // 
            this.btnExit.Location = new System.Drawing.Point(422, 338);
            this.btnExit.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.btnExit.Name = "btnExit";
            this.btnExit.Size = new System.Drawing.Size(157, 34);
            this.btnExit.TabIndex = 19;
            this.btnExit.Text = "E&xit";
            this.btnExit.UseVisualStyleBackColor = true;
            this.btnExit.Click += new System.EventHandler(this.btnExit_Click);
            // 
            // groupBox3
            // 
            this.groupBox3.Controls.Add(this.textPassword);
            this.groupBox3.Controls.Add(this.textUserID);
            this.groupBox3.Controls.Add(this.label9);
            this.groupBox3.Controls.Add(this.label10);
            this.groupBox3.Location = new System.Drawing.Point(388, 20);
            this.groupBox3.Margin = new System.Windows.Forms.Padding(4);
            this.groupBox3.Name = "groupBox3";
            this.groupBox3.Padding = new System.Windows.Forms.Padding(4);
            this.groupBox3.Size = new System.Drawing.Size(219, 129);
            this.groupBox3.TabIndex = 15;
            this.groupBox3.TabStop = false;
            this.groupBox3.Text = "Account Book 1 Login";
            // 
            // textPassword
            // 
            this.textPassword.Location = new System.Drawing.Point(11, 95);
            this.textPassword.Margin = new System.Windows.Forms.Padding(4);
            this.textPassword.Name = "textPassword";
            this.textPassword.PasswordChar = '*';
            this.textPassword.Size = new System.Drawing.Size(201, 20);
            this.textPassword.TabIndex = 7;
            // 
            // textUserID
            // 
            this.textUserID.Location = new System.Drawing.Point(11, 42);
            this.textUserID.Margin = new System.Windows.Forms.Padding(4);
            this.textUserID.Name = "textUserID";
            this.textUserID.Size = new System.Drawing.Size(201, 20);
            this.textUserID.TabIndex = 6;
            // 
            // label9
            // 
            this.label9.AutoSize = true;
            this.label9.Location = new System.Drawing.Point(7, 75);
            this.label9.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label9.Name = "label9";
            this.label9.Size = new System.Drawing.Size(56, 13);
            this.label9.TabIndex = 5;
            this.label9.Text = "Password:";
            // 
            // label10
            // 
            this.label10.AutoSize = true;
            this.label10.Location = new System.Drawing.Point(7, 23);
            this.label10.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label10.Name = "label10";
            this.label10.Size = new System.Drawing.Size(46, 13);
            this.label10.TabIndex = 4;
            this.label10.Text = "User ID:";
            // 
            // groupBox1
            // 
            this.groupBox1.BackColor = System.Drawing.SystemColors.Control;
            this.groupBox1.Controls.Add(this.chkDefaultSA);
            this.groupBox1.Controls.Add(this.textDBName2);
            this.groupBox1.Controls.Add(this.label11);
            this.groupBox1.Controls.Add(this.groupBoxSA);
            this.groupBox1.Controls.Add(this.label1);
            this.groupBox1.Controls.Add(this.label3);
            this.groupBox1.Controls.Add(this.label2);
            this.groupBox1.Controls.Add(this.textDBName);
            this.groupBox1.Controls.Add(this.textPort);
            this.groupBox1.Controls.Add(this.label5);
            this.groupBox1.Controls.Add(this.textServer);
            this.groupBox1.Controls.Add(this.textInstance);
            this.groupBox1.Location = new System.Drawing.Point(11, 20);
            this.groupBox1.Margin = new System.Windows.Forms.Padding(4);
            this.groupBox1.Name = "groupBox1";
            this.groupBox1.Padding = new System.Windows.Forms.Padding(4);
            this.groupBox1.Size = new System.Drawing.Size(369, 321);
            this.groupBox1.TabIndex = 14;
            this.groupBox1.TabStop = false;
            this.groupBox1.Text = "Connection Setting";
            // 
            // chkDefaultSA
            // 
            this.chkDefaultSA.AutoSize = true;
            this.chkDefaultSA.Location = new System.Drawing.Point(120, 295);
            this.chkDefaultSA.Margin = new System.Windows.Forms.Padding(4);
            this.chkDefaultSA.Name = "chkDefaultSA";
            this.chkDefaultSA.Size = new System.Drawing.Size(157, 17);
            this.chkDefaultSA.TabIndex = 14;
            this.chkDefaultSA.Text = "Use Default SA && Password";
            this.chkDefaultSA.UseVisualStyleBackColor = true;
            this.chkDefaultSA.CheckedChanged += new System.EventHandler(this.chkDefaultSA_CheckedChanged);
            // 
            // textDBName2
            // 
            this.textDBName2.Location = new System.Drawing.Point(153, 139);
            this.textDBName2.Margin = new System.Windows.Forms.Padding(4);
            this.textDBName2.Name = "textDBName2";
            this.textDBName2.Size = new System.Drawing.Size(172, 20);
            this.textDBName2.TabIndex = 15;
            // 
            // label11
            // 
            this.label11.AutoSize = true;
            this.label11.Location = new System.Drawing.Point(11, 142);
            this.label11.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label11.Name = "label11";
            this.label11.Size = new System.Drawing.Size(94, 13);
            this.label11.TabIndex = 14;
            this.label11.Text = "Database name 2:";
            // 
            // groupBoxSA
            // 
            this.groupBoxSA.Controls.Add(this.textSAPassword);
            this.groupBoxSA.Controls.Add(this.textSAUser);
            this.groupBoxSA.Controls.Add(this.label8);
            this.groupBoxSA.Controls.Add(this.label7);
            this.groupBoxSA.Location = new System.Drawing.Point(11, 201);
            this.groupBoxSA.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.groupBoxSA.Name = "groupBoxSA";
            this.groupBoxSA.Padding = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.groupBoxSA.Size = new System.Drawing.Size(348, 92);
            this.groupBoxSA.TabIndex = 13;
            this.groupBoxSA.TabStop = false;
            this.groupBoxSA.Text = "SQL Server Administrator Login";
            // 
            // textSAPassword
            // 
            this.textSAPassword.Location = new System.Drawing.Point(109, 54);
            this.textSAPassword.Margin = new System.Windows.Forms.Padding(4);
            this.textSAPassword.Name = "textSAPassword";
            this.textSAPassword.PasswordChar = '*';
            this.textSAPassword.Size = new System.Drawing.Size(201, 20);
            this.textSAPassword.TabIndex = 3;
            // 
            // textSAUser
            // 
            this.textSAUser.Location = new System.Drawing.Point(109, 28);
            this.textSAUser.Margin = new System.Windows.Forms.Padding(4);
            this.textSAUser.Name = "textSAUser";
            this.textSAUser.Size = new System.Drawing.Size(72, 20);
            this.textSAUser.TabIndex = 2;
            // 
            // label8
            // 
            this.label8.AutoSize = true;
            this.label8.Location = new System.Drawing.Point(8, 59);
            this.label8.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label8.Name = "label8";
            this.label8.Size = new System.Drawing.Size(69, 13);
            this.label8.TabIndex = 1;
            this.label8.Text = "sa password:";
            // 
            // label7
            // 
            this.label7.AutoSize = true;
            this.label7.Location = new System.Drawing.Point(8, 30);
            this.label7.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label7.Name = "label7";
            this.label7.Size = new System.Drawing.Size(44, 13);
            this.label7.TabIndex = 0;
            this.label7.Text = "sa user:";
            // 
            // textDBName
            // 
            this.textDBName.Location = new System.Drawing.Point(153, 114);
            this.textDBName.Margin = new System.Windows.Forms.Padding(4);
            this.textDBName.Name = "textDBName";
            this.textDBName.Size = new System.Drawing.Size(172, 20);
            this.textDBName.TabIndex = 11;
            // 
            // label5
            // 
            this.label5.AutoSize = true;
            this.label5.Location = new System.Drawing.Point(11, 117);
            this.label5.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.label5.Name = "label5";
            this.label5.Size = new System.Drawing.Size(94, 13);
            this.label5.TabIndex = 10;
            this.label5.Text = "Database name 1:";
            // 
            // btnTestConnection
            // 
            this.btnTestConnection.Enabled = false;
            this.btnTestConnection.Location = new System.Drawing.Point(422, 298);
            this.btnTestConnection.Margin = new System.Windows.Forms.Padding(4);
            this.btnTestConnection.Name = "btnTestConnection";
            this.btnTestConnection.Size = new System.Drawing.Size(157, 34);
            this.btnTestConnection.TabIndex = 12;
            this.btnTestConnection.Text = "Start Syncing";
            this.btnTestConnection.UseVisualStyleBackColor = true;
            this.btnTestConnection.Click += new System.EventHandler(this.btnTestConnection_Click);
            // 
            // panelStatusMsg
            // 
            this.panelStatusMsg.Controls.Add(this.splitContainer1);
            this.panelStatusMsg.Dock = System.Windows.Forms.DockStyle.Fill;
            this.panelStatusMsg.Location = new System.Drawing.Point(0, 0);
            this.panelStatusMsg.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.panelStatusMsg.Name = "panelStatusMsg";
            this.panelStatusMsg.Size = new System.Drawing.Size(566, 383);
            this.panelStatusMsg.TabIndex = 16;
            // 
            // splitContainer1
            // 
            this.splitContainer1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer1.Location = new System.Drawing.Point(0, 0);
            this.splitContainer1.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.splitContainer1.Name = "splitContainer1";
            this.splitContainer1.Orientation = System.Windows.Forms.Orientation.Horizontal;
            // 
            // splitContainer1.Panel1
            // 
            this.splitContainer1.Panel1.Controls.Add(this.chkListStatus);
            this.splitContainer1.Panel1.Controls.Add(this.label6);
            // 
            // splitContainer1.Panel2
            // 
            this.splitContainer1.Panel2.Controls.Add(this.listBoxMessage);
            this.splitContainer1.Panel2.Controls.Add(this.label4);
            this.splitContainer1.Size = new System.Drawing.Size(566, 383);
            this.splitContainer1.SplitterDistance = 149;
            this.splitContainer1.SplitterWidth = 6;
            this.splitContainer1.TabIndex = 0;
            // 
            // chkListStatus
            // 
            this.chkListStatus.Dock = System.Windows.Forms.DockStyle.Fill;
            this.chkListStatus.Enabled = false;
            this.chkListStatus.FormattingEnabled = true;
            this.chkListStatus.Location = new System.Drawing.Point(0, 26);
            this.chkListStatus.Margin = new System.Windows.Forms.Padding(3, 2, 3, 2);
            this.chkListStatus.Name = "chkListStatus";
            this.chkListStatus.Size = new System.Drawing.Size(566, 123);
            this.chkListStatus.TabIndex = 19;
            // 
            // label6
            // 
            this.label6.BackColor = System.Drawing.Color.Black;
            this.label6.Dock = System.Windows.Forms.DockStyle.Top;
            this.label6.ForeColor = System.Drawing.Color.White;
            this.label6.Location = new System.Drawing.Point(0, 0);
            this.label6.Name = "label6";
            this.label6.Size = new System.Drawing.Size(566, 26);
            this.label6.TabIndex = 19;
            this.label6.Text = "Status";
            // 
            // listBoxMessage
            // 
            this.listBoxMessage.Dock = System.Windows.Forms.DockStyle.Fill;
            this.listBoxMessage.FormattingEnabled = true;
            this.listBoxMessage.HorizontalScrollbar = true;
            this.listBoxMessage.Location = new System.Drawing.Point(0, 26);
            this.listBoxMessage.Margin = new System.Windows.Forms.Padding(4);
            this.listBoxMessage.Name = "listBoxMessage";
            this.listBoxMessage.Size = new System.Drawing.Size(566, 202);
            this.listBoxMessage.TabIndex = 18;
            // 
            // label4
            // 
            this.label4.BackColor = System.Drawing.Color.Black;
            this.label4.Dock = System.Windows.Forms.DockStyle.Top;
            this.label4.ForeColor = System.Drawing.Color.White;
            this.label4.Location = new System.Drawing.Point(0, 0);
            this.label4.Name = "label4";
            this.label4.Size = new System.Drawing.Size(566, 26);
            this.label4.TabIndex = 17;
            this.label4.Text = "Message";
            // 
            // FormMain
            // 
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Inherit;
            this.ClientSize = new System.Drawing.Size(1209, 481);
            this.Controls.Add(this.testinglabel);
            this.Controls.Add(this.panel1);
            this.Margin = new System.Windows.Forms.Padding(4);
            this.MaximizeBox = false;
            this.Name = "FormMain";
            this.Text = "Bar Wang Sync";
            this.panel1.ResumeLayout(false);
            this.splitContainer2.Panel1.ResumeLayout(false);
            this.splitContainer2.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer2)).EndInit();
            this.splitContainer2.ResumeLayout(false);
            this.groupBox2.ResumeLayout(false);
            this.groupBox2.PerformLayout();
            this.groupBox3.ResumeLayout(false);
            this.groupBox3.PerformLayout();
            this.groupBox1.ResumeLayout(false);
            this.groupBox1.PerformLayout();
            this.groupBoxSA.ResumeLayout(false);
            this.groupBoxSA.PerformLayout();
            this.panelStatusMsg.ResumeLayout(false);
            this.splitContainer1.Panel1.ResumeLayout(false);
            this.splitContainer1.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer1)).EndInit();
            this.splitContainer1.ResumeLayout(false);
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.TextBox textServer;
        private System.Windows.Forms.TextBox textInstance;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.TextBox textPort;
        private System.Windows.Forms.Panel panel1;
        private System.Windows.Forms.TextBox textDBName;
        private System.Windows.Forms.Label label5;
        private System.Windows.Forms.GroupBox groupBox1;
        private System.Windows.Forms.Button btnTestConnection;
        private System.Windows.Forms.Panel panelStatusMsg;
        private System.Windows.Forms.CheckedListBox chkListStatus;
        private System.Windows.Forms.ListBox listBoxMessage;
        private System.Windows.Forms.Label label4;
        private System.Windows.Forms.Button btnExit;
        private System.Windows.Forms.GroupBox groupBoxSA;
        private System.Windows.Forms.SplitContainer splitContainer1;
        private System.Windows.Forms.Label label6;
        private System.Windows.Forms.TextBox textSAPassword;
        private System.Windows.Forms.TextBox textSAUser;
        private System.Windows.Forms.Label label8;
        private System.Windows.Forms.Label label7;
        private System.Windows.Forms.CheckBox chkDefaultSA;
        private System.Windows.Forms.SplitContainer splitContainer2;
        private System.Windows.Forms.GroupBox groupBox3;
        private System.Windows.Forms.TextBox textPassword;
        private System.Windows.Forms.TextBox textUserID;
        private System.Windows.Forms.Label label9;
        private System.Windows.Forms.Label label10;
        private System.Windows.Forms.TextBox textDBName2;
        private System.Windows.Forms.Label label11;
        private System.Windows.Forms.GroupBox groupBox2;
        private System.Windows.Forms.TextBox textPassword2;
        private System.Windows.Forms.TextBox textUserID2;
        private System.Windows.Forms.Label label13;
        private System.Windows.Forms.Label label14;
        private System.Windows.Forms.Label testinglabel;
    }
}

