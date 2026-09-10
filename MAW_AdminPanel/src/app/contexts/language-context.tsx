import { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "ms";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

interface Translations {
  [key: string]: {
    en: string;
    ms: string;
  };
}

const translations: Translations = {
  // Navigation
  dashboard: { en: "Dashboard", ms: "Papan Pemuka" },
  workshop: { en: "Workshop", ms: "Bengkel" },
  customers_group: { en: "Companies & Fleet", ms: "Syarikat & Armada" },
  inventory: { en: "Inventory", ms: "Inventori" },
  finance: { en: "Billing & Finance", ms: "Pengebilan & Kewangan" },
  admin_group: { en: "Administration", ms: "Pentadbiran" },
  master_data: { en: "Master Data", ms: "Data Induk" },
  work_orders: { en: "Work Orders", ms: "Arahan Kerja" },
  parts_orders: { en: "Parts Orders", ms: "Pesanan Alat Ganti" },
  purchase_orders: { en: "Purchase Orders (PO)", ms: "Pesanan Pembelian (PO)" },
  work_order_lifecycle: {
    en: "Work Order Lifecycle",
    ms: "Kitaran Hayat Arahan Kerja",
  },
  search_registration_placeholder: {
    en: "Search plate number...",
    ms: "Cari no. plat...",
  },
  status_scheduled: { en: "Scheduled", ms: "Dijadualkan" },
  status_checked_in: { en: "Checked In", ms: "Telah Daftar Masuk" },
  status_inspected: { en: "Inspected", ms: "Telah Diperiksa" },
  status_quotation_issued: { en: "Quotation Issued", ms: "Sebut Harga Dikeluarkan" },
  status_approved: { en: "Approved", ms: "Diluluskan" },
  status_parts_ready: { en: "Parts Ready", ms: "Alat Ganti Sedia" },
  status_under_repair: { en: "Under Repair", ms: "Dalam Pembaikan" },
  status_ready_for_collection: { en: "Ready for Collection", ms: "Sedia Dikutip" },
  status_collected: { en: "Collected", ms: "Dikutip" },
  customers: { en: "Company Users", ms: "Pengguna Syarikat" },
  drivers: { en: "Drivers", ms: "Pemandu" },
  companies: { en: "Companies", ms: "Syarikat" },
  debtors: { en: "Debtors", ms: "Penghutang" },
  autocount_sync: { en: "AutoCount Sync", ms: "Status AutoCount" },
  suppliers: { en: "Master Data", ms: "Data Induk" },
  vehicles: { en: "Vehicles", ms: "Kenderaan" },
  autocount_projects: { en: "AutoCount Projects", ms: "Projek AutoCount" },
  bookings_nav: { en: "Bookings", ms: "Tempahan" },
  parts_inventory: { en: "Parts Inventory", ms: "Inventori Alat Ganti" },
  orders: { en: "Orders", ms: "Pesanan" },
  invoices: { en: "Invoices", ms: "Invois" },
  pending_sync_invoices: { en: "Pending Sync Invoice", ms: "Invois Menunggu Sync" },
  notifications: { en: "Notifications", ms: "Pemberitahuan" },
  reports: { en: "Reports", ms: "Laporan" },
  settings: { en: "Settings", ms: "Tetapan" },
  audit_trail: { en: "Audit Trail", ms: "Jejak Audit" },
  app_logs: { en: "App Logs", ms: "Log Aplikasi" },
  staff: { en: "Staff", ms: "Kakitangan" },

  // Dashboard
  welcome_message: {
    en: "Welcome back to your administration dashboard.",
    ms: "Selamat kembali ke papan pemuka pentadbiran anda.",
  },
  today_bookings: { en: "Today's Bookings", ms: "Tempahan Hari Ini" },
  pending_orders_stat: { en: "Pending Orders", ms: "Pesanan Tertunda" },
  month_revenue: { en: "Monthly Revenue", ms: "Hasil Bulanan" },
  monthly_revenue_trend: {
    en: "Monthly Revenue Trend",
    ms: "Trend Hasil Bulanan",
  },
  expenses: { en: "Expenses", ms: "Perbelanjaan" },
  week_booking_stats: {
    en: "Weekly Booking Statistics",
    ms: "Statistik Tempahan Mingguan",
  },
  service_types_distribution: {
    en: "Service Types Distribution",
    ms: "Pengagihan Jenis Servis",
  },
  recent_bookings: { en: "Recent Bookings", ms: "Tempahan Terkini" },
  overview: { en: "Overview", ms: "Gambaran Keseluruhan" },
  total_revenue: { en: "Total Revenue", ms: "Jumlah Hasil" },
  total_customers: { en: "Total Company Users", ms: "Jumlah Pengguna Syarikat" },
  active_bookings: { en: "Active Bookings", ms: "Tempahan Aktif" },
  pending_orders: { en: "Pending Orders", ms: "Pesanan Belum Selesai" },
  revenue_trend: { en: "Revenue Trend", ms: "Trend Hasil" },
  month: { en: "Month", ms: "Bulan" },
  revenue: { en: "Revenue", ms: "Hasil" },
  recent_activities: { en: "Recent Activities", ms: "Aktiviti Terkini" },
  today: { en: "Today", ms: "Hari Ini" },
  yesterday: { en: "Yesterday", ms: "Semalam" },
  view_all: { en: "View All", ms: "Lihat Semua" },

  // Customers Page
  customer_management_desc: {
    en: "Manage the users who can sign in for each company.",
    ms: "Urus pengguna yang boleh log masuk bagi setiap syarikat.",
  },
  all: { en: "All", ms: "Semua" },
  contact: { en: "Contact", ms: "Hubungi" },
  bookings: { en: "Bookings", ms: "Tempahan" },
  last_visit: { en: "Last Visit", ms: "Kunjungan Terakhir" },
  active_customers: { en: "Active Company Users", ms: "Pengguna Syarikat Aktif" },
  avg_bookings: { en: "Average Bookings", ms: "Purata Tempahan" },

  // Customers Page
  customer_management: {
    en: "Company User Management",
    ms: "Pengurusan Pengguna Syarikat",
  },
  add_customer: { en: "Add Company User", ms: "Tambah Pengguna Syarikat" },
  search_customers: { en: "Search company users...", ms: "Cari pengguna syarikat..." },
  all_customers: { en: "All Company Users", ms: "Semua Pengguna Syarikat" },
  active: { en: "Active", ms: "Aktif" },
  inactive: { en: "Inactive", ms: "Tidak Aktif" },
  name: { en: "Name", ms: "Nama" },
  email: { en: "Email", ms: "Emel" },
  phone: { en: "Phone", ms: "Telefon" },
  vehicles_count: { en: "Vehicles", ms: "Kenderaan" },
  total_spent: { en: "Total Spent", ms: "Jumlah Perbelanjaan" },
  status: { en: "Status", ms: "Status" },
  actions: { en: "Actions", ms: "Tindakan" },
  view: { en: "View", ms: "Lihat" },
  edit: { en: "Edit", ms: "Edit" },
  delete: { en: "Delete", ms: "Padam" },

  // Customer Details Modal
  customer_details: { en: "Company User Details", ms: "Butiran Pengguna Syarikat" },
  contact_information: {
    en: "Contact Information",
    ms: "Maklumat Perhubungan",
  },
  address: { en: "Address", ms: "Alamat" },
  customer_vehicles: { en: "Company Vehicles", ms: "Kenderaan Syarikat" },
  make: { en: "Make", ms: "Jenama" },
  model: { en: "Model", ms: "Model" },
  year: { en: "Year", ms: "Tahun" },
  license_plate: { en: "License Plate", ms: "No. Plat" },
  vin: { en: "VIN", ms: "VIN" },
  service_history: { en: "Service History", ms: "Sejarah Servis" },
  date: { en: "Date", ms: "Tarikh" },
  service_type: { en: "Service Type", ms: "Jenis Servis" },
  amount: { en: "Amount", ms: "Jumlah" },
  close: { en: "Close", ms: "Tutup" },

  // Add/Edit Customer Form
  add_new_customer: { en: "Add New Company User", ms: "Tambah Pengguna Syarikat Baru" },
  edit_customer: { en: "Edit Company User", ms: "Edit Pengguna Syarikat" },
  full_name: { en: "Full Name", ms: "Nama Penuh" },
  email_address: { en: "Email Address", ms: "Alamat Emel" },
  phone_number: { en: "Phone Number", ms: "Nombor Telefon" },
  full_address: { en: "Full Address", ms: "Alamat Penuh" },
  customer_status: { en: "Company User Status", ms: "Status Pengguna Syarikat" },
  cancel: { en: "Cancel", ms: "Batal" },
  save: { en: "Save", ms: "Simpan" },
  add: { en: "Add", ms: "Tambah" },

  // Bookings Page
  booking_management: { en: "Booking Management", ms: "Pengurusan Tempahan" },
  booking_management_description: {
    en: "Manage all service bookings and repair progress",
    ms: "Urus semua tempahan servis dan kemajuan pembaikan",
  },
  add_booking: { en: "New Booking", ms: "Tempahan Baru" },
  search_bookings: {
    en: "Search booking no., driver or vehicle...",
    ms: "Cari no. tempahan, pelanggan atau kenderaan...",
  },
  total_bookings_stat: { en: "Total", ms: "Jumlah" },
  pending_bookings: { en: "Pending", ms: "Tertunda" },
  confirmed_bookings: { en: "Confirmed", ms: "Disahkan" },
  in_progress_bookings: { en: "In Progress", ms: "Dalam Proses" },
  all_bookings: { en: "All Bookings", ms: "Semua Tempahan" },
  pending: { en: "Pending", ms: "Belum Selesai" },
  confirmed: { en: "Confirmed", ms: "Disahkan" },
  in_progress: { en: "In Progress", ms: "Sedang Dijalankan" },
  completed: { en: "Completed", ms: "Selesai" },
  cancelled: { en: "Cancelled", ms: "Dibatalkan" },
  booking_id: { en: "Booking No.", ms: "No. Tempahan" },
  customer: { en: "Company User", ms: "Pengguna Syarikat" },
  vehicle: { en: "Vehicle", ms: "Kenderaan" },
  service: { en: "Service", ms: "Servis" },
  scheduled_date: { en: "Scheduled Date", ms: "Tarikh Dijadualkan" },
  time_slot: { en: "Time Slot", ms: "Slot Masa" },
  date_time: { en: "Date & Time", ms: "Tarikh & Masa" },
  technician: { en: "Foreman", ms: "Foreman" },
  booking_details: { en: "Booking Details", ms: "Butiran Tempahan" },
  customer_information: {
    en: "Company User Information",
    ms: "Maklumat Pelanggan",
  },
  vehicle_information: { en: "Vehicle Information", ms: "Maklumat Kenderaan" },
  service_information: { en: "Service Information", ms: "Maklumat Servis" },
  assigned_technician: {
    en: "Assigned Foreman",
    ms: "Foreman Ditugaskan",
  },
  location: { en: "Location", ms: "Lokasi" },
  customer_notes: { en: "Driver Notes", ms: "Nota Pelanggan" },
  technician_notes: { en: "Foreman Notes", ms: "Nota Foreman" },
  update_status: { en: "Update Status", ms: "Kemaskini Status" },
  view_invoice: { en: "View Invoice", ms: "Lihat Invois" },

  // Equipment/Vehicles Page
  vehicle_management: { en: "Vehicle Management", ms: "Pengurusan Kenderaan" },
  add_vehicle: { en: "Add Vehicle", ms: "Tambah Kenderaan" },
  search_vehicles: { en: "Search vehicles...", ms: "Cari kenderaan..." },
  all_vehicles: { en: "All Vehicles", ms: "Semua Kenderaan" },
  in_service: { en: "In Service", ms: "Dalam Servis" },
  registered: { en: "Registered", ms: "Berdaftar" },
  owner: { en: "Owner", ms: "Pemilik" },
  last_service: { en: "Last Service", ms: "Servis Terakhir" },
  next_service: { en: "Next Service", ms: "Servis Seterusnya" },

  // Parts Inventory Page
  parts_management: { en: "Parts Management", ms: "Pengurusan Alat Ganti" },
  add_part: { en: "Add Part", ms: "Tambah Alat Ganti" },
  search_parts: { en: "Search parts...", ms: "Cari alat ganti..." },
  all_parts: { en: "All Parts", ms: "Semua Alat Ganti" },
  low_stock: { en: "Low Stock", ms: "Stok Rendah" },
  out_of_stock: { en: "Out of Stock", ms: "Kehabisan Stok" },
  part_name: { en: "Part Name", ms: "Nama Alat Ganti" },
  part_number: { en: "Part Number", ms: "Nombor Alat Ganti" },
  category: { en: "Category", ms: "Kategori" },
  stock_quantity: { en: "Stock Quantity", ms: "Kuantiti Stok" },
  unit_price: { en: "Unit Price", ms: "Harga Seunit" },
  supplier: { en: "Supplier", ms: "Pembekal" },

  // Orders Page
  order_management: { en: "Order Management", ms: "Pengurusan Pesanan" },
  add_order: { en: "Add Order", ms: "Tambah Pesanan" },
  search_orders: { en: "Search orders...", ms: "Cari pesanan..." },
  all_orders: { en: "All Orders", ms: "Semua Pesanan" },
  processing: { en: "Processing", ms: "Sedang Diproses" },
  shipped: { en: "Shipped", ms: "Dihantar" },
  delivered: { en: "Delivered", ms: "Diterima" },
  order_id: { en: "Order ID", ms: "ID Pesanan" },
  order_date: { en: "Order Date", ms: "Tarikh Pesanan" },
  items: { en: "Items", ms: "Item" },
  total_amount: { en: "Total Amount", ms: "Jumlah Keseluruhan" },

  // Invoices Page
  invoice_management: { en: "Invoice Management", ms: "Pengurusan Invois" },
  add_invoice: { en: "Add Invoice", ms: "Tambah Invois" },
  search_invoices: { en: "Search invoices...", ms: "Cari invois..." },
  all_invoices: { en: "All Invoices", ms: "Semua Invois" },
  paid: { en: "Paid", ms: "Dibayar" },
  unpaid: { en: "Unpaid", ms: "Belum Dibayar" },
  overdue: { en: "Overdue", ms: "Tertunggak" },
  invoice_id: { en: "Invoice ID", ms: "ID Invois" },
  invoice_date: { en: "Invoice Date", ms: "Tarikh Invois" },
  due_date: { en: "Due Date", ms: "Tarikh Akhir" },
  download: { en: "Download", ms: "Muat Turun" },

  // Notifications Page
  notification_center: { en: "Notification Center", ms: "Pusat Pemberitahuan" },
  mark_all_read: { en: "Mark All as Read", ms: "Tandakan Semua Dibaca" },
  all_notifications: { en: "All Notifications", ms: "Semua Pemberitahuan" },
  unread: { en: "Unread", ms: "Belum Dibaca" },
  read: { en: "Read", ms: "Dibaca" },
  message: { en: "Message", ms: "Mesej" },
  time: { en: "Time", ms: "Masa" },

  // Reports Page
  reports_analytics: { en: "Reports & Analytics", ms: "Laporan & Analisis" },
  generate_report: { en: "Generate Report", ms: "Jana Laporan" },
  date_range: { en: "Date Range", ms: "Julat Tarikh" },
  report_type: { en: "Report Type", ms: "Jenis Laporan" },
  sales_report: { en: "Sales Report", ms: "Laporan Jualan" },
  inventory_report: { en: "Inventory Report", ms: "Laporan Inventori" },
  customer_report: { en: "Driver Report", ms: "Laporan Pelanggan" },
  service_report: { en: "Service Report", ms: "Laporan Servis" },
  export: { en: "Export", ms: "Eksport" },

  // Settings Page
  system_settings: { en: "System Settings", ms: "Tetapan Sistem" },
  system_settings_description: {
    en: "Manage system configuration and preferences",
    ms: "Urus konfigurasi sistem dan tetapan",
  },
  company_info_tab: { en: "Company Info", ms: "Maklumat Syarikat" },
  support_settings_tab: { en: "App Support", ms: "Sokongan Aplikasi" },
  service_types_tab: { en: "Service Types", ms: "Jenis Servis" },
  pricing_settings_tab: { en: "Pricing", ms: "Tetapan Harga" },
  services_pricing_tab: { en: "Services & Pricing", ms: "Servis & Harga" },
  user_management_tab: { en: "Users", ms: "Pengurusan Pengguna" },
  notification_settings_tab: { en: "Notifications", ms: "Tetapan Notifikasi" },
  support_settings: { en: "Customer App Support Settings", ms: "Tetapan Sokongan Aplikasi Pelanggan" },
  company_information: { en: "Company Information", ms: "Maklumat Syarikat" },
  company_name: { en: "Company Name", ms: "Nama Syarikat" },
  service_types: { en: "Service Types", ms: "Jenis Servis" },
  pricing_settings: { en: "Pricing Settings", ms: "Tetapan Harga" },
  tax_rate: { en: "Tax Rate (%)", ms: "Kadar Cukai (%)" },
  labor_rate: { en: "Labor Rate (per hour)", ms: "Kadar Buruh (per jam)" },
  parts_markup: { en: "Parts Markup (%)", ms: "Markup Alat Ganti (%)" },
  enable_automatic_rounding: {
    en: "Enable Automatic Rounding",
    ms: "Gunakan Pembundaran Automatik",
  },
  user_management: { en: "User Management", ms: "Pengurusan Pengguna" },
  add_user: { en: "Add User", ms: "Tambah Pengguna" },
  notification_settings: {
    en: "Notification Settings",
    ms: "Tetapan Notifikasi",
  },
  service_reminders: { en: "Service Reminders", ms: "Peringatan Servis" },
  service_reminders_description: {
    en: "Send automatic reminders to drivers",
    ms: "Hantar peringatan automatik kepada pelanggan",
  },
  insurance_reminders: { en: "Insurance Reminders", ms: "Peringatan Insurans" },
  insurance_reminders_description: {
    en: "Notify drivers when insurance is expiring",
    ms: "Maklumkan pelanggan bila insurans hampir tamat",
  },
  booking_updates: { en: "Booking Updates", ms: "Kemas Kini Tempahan" },
  booking_updates_description: {
    en: "Send notifications when booking status changes",
    ms: "Hantar notifikasi bila status tempahan berubah",
  },
  low_stock_alerts: { en: "Low Stock Alerts", ms: "Peringatan Stok Rendah" },
  low_stock_alerts_description: {
    en: "Notify admin when parts stock is low",
    ms: "Maklumkan admin bila stok alat ganti rendah",
  },
  general_settings: { en: "General Settings", ms: "Tetapan Umum" },
  business_name: { en: "Business Name", ms: "Nama Perniagaan" },
  business_email: { en: "Business Email", ms: "Emel Perniagaan" },
  business_phone: { en: "Business Phone", ms: "Telefon Perniagaan" },
  business_address: { en: "Business Address", ms: "Alamat Perniagaan" },
  operating_hours: { en: "Operating Hours", ms: "Waktu Operasi" },
  currency: { en: "Currency", ms: "Mata Wang" },
  language: { en: "Language", ms: "Bahasa" },
  notifications_settings: {
    en: "Notifications Settings",
    ms: "Tetapan Pemberitahuan",
  },
  email_notifications: { en: "Email Notifications", ms: "Pemberitahuan Emel" },
  sms_notifications: { en: "SMS Notifications", ms: "Pemberitahuan SMS" },
  save_changes: { en: "Save Changes", ms: "Simpan Perubahan" },

  // Companies Page & Selects
  company_management: { en: "Company Management", ms: "Pengurusan Syarikat" },
  company_management_desc: {
    en: "Manage client companies and fleets.",
    ms: "Urus syarikat pelanggan dan armada kenderaan.",
  },
  add_company: { en: "Add Company", ms: "Tambah Syarikat" },
  search_companies: { en: "Search companies...", ms: "Cari syarikat..." },
  company: { en: "Company", ms: "Syarikat" },
  total_companies: { en: "Total Companies", ms: "Jumlah Syarikat" },
  active_companies: { en: "Active Companies", ms: "Syarikat Aktif" },
  edit_company: { en: "Edit Company", ms: "Edit Syarikat" },
  delete_company: { en: "Delete Company", ms: "Padam Syarikat" },
  driver: { en: "Driver", ms: "Pemandu" },
  driver_name: { en: "Driver Name", ms: "Nama Pemandu" },
  select_company: { en: "-- Select Company --", ms: "-- Pilih Syarikat --" },
  select_driver: {
    en: "-- Select Driver --",
    ms: "-- Pilih Pemandu --",
  },

  // Common
  search: { en: "Search", ms: "Cari" },
  filter: { en: "Filter", ms: "Tapis" },
  sort: { en: "Sort", ms: "Susun" },
  export_csv: { en: "Export CSV", ms: "Eksport CSV" },
  print: { en: "Print", ms: "Cetak" },
  refresh: { en: "Refresh", ms: "Muat Semula" },
  loading: { en: "Loading...", ms: "Memuatkan..." },
  no_data: { en: "No data available", ms: "Tiada data tersedia" },
  confirm: { en: "Confirm", ms: "Sahkan" },
  yes: { en: "Yes", ms: "Ya" },
  no: { en: "No", ms: "Tidak" },
  success: { en: "Success", ms: "Berjaya" },
  error: { en: "Error", ms: "Ralat" },
  warning: { en: "Warning", ms: "Amaran" },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  const t = (key: string): string => {
    return translations[key]?.en || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
