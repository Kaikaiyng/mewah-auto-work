import { User, Booking, SparePart, ServiceReminder, CustomerNotification, WorkOrder, CustomerContact, NotificationPreferences } from '../types';

export const mockContacts: CustomerContact[] = [
  { id: 'contact-1', name: 'Demo Contact One', email: 'ahmad.tan@example.com', phone: '+60 00-000 0000', role: 'Fleet Manager', isDefault: true },
  { id: 'contact-2', name: 'Demo Contact Two', email: 'sarah.lee@example.com', phone: '+60 00-000 0000', role: 'Driver' },
];

export const mockNotificationPreferences: NotificationPreferences = {
  bookingUpdates: true,
  repairUpdates: true,
  serviceReminders: true,
  partsOrders: true,
  invoiceUpdates: true,
  email: true,
  push: true,
};

export const mockNotifications: CustomerNotification[] = [
  {
    id: 'n1',
    title: 'Booking Confirmed',
    message: 'Your vehicle DEMO002 is booked for an engine oil service on 15 Aug 2026 at 9:30 AM.',
    date: '2026-07-23T08:00:00+08:00',
    isRead: false,
    type: 'booking',
    relatedRecordType: 'booking',
    relatedRecordId: 'b4',
    actionRoute: '/booking/b4'
  },
  {
    id: 'n3',
    title: 'Parts Order Ready for Pickup',
    message: 'Your order ORD-1709876543210 is ready for pickup at our service center.',
    date: '2026-03-05T14:30:00',
    isRead: true,
    type: 'parts'
  },
  {
    id: 'n4',
    title: 'Service Completed',
    message: 'Your vehicle service BK2026020045 has been completed. You can collect your vehicle now.',
    date: '2026-02-10T16:00:00',
    isRead: true,
    type: 'booking'
  }
];

export const mockUser: User = {
  id: '1',
  contactReference: 'CT-000125',
  name: 'Demo Contact One',
  email: 'ahmad.tan@example.com',
  phone: '+60 00-000 0000',
  companyId: 'company-1',
  companyName: 'Example Fleet Company',
  contactRole: 'Fleet Manager',
  preferredLanguage: 'en',
  permissions: {
    canViewAllVehicles: true,
    canCreateBooking: true,
    canCancelBooking: true,
    canRescheduleBooking: true,
    canViewRepairProgress: true,
    canOrderParts: true,
    canViewInvoices: true,
    canViewNotifications: true,
  },
  deliveryAddresses: [
    {
      id: 'addr1',
      contactName: 'Demo Contact One',
      address: 'Configure a delivery address',
      contactPhone: '+60 00-000 0000',
      isDefault: true
    },
    {
      id: 'addr2',
      contactName: 'Demo Contact Two',
      address: 'Configure a second delivery address',
      contactPhone: '+60 00-000 0000',
      isDefault: false
    }
  ],
  vehicles: [
    {
      id: 'v1',
      companyId: 'company-1',
      vecNo: 'DEMO-UNIT-001',
      regNo: 'DEMO001',
      equipment: '40 ft Trailer',
      brand: 'Volvo',
      model: 'CX-20',
      mileage: 45230,
      engineHours: 7820,
      year: 2020,
      chassisNo: 'DEMO-CHASSIS-001',
      engineNo: 'DEMO-ENGINE-001',
      insuranceExpiry: '2026-08-15',
      roadTaxExpiry: '2026-06-30',
      puspakomExpiry: '2026-09-20',
      lastServiceDate: '2025-12-05',
      lastServiceMileage: 45230,
      nextServiceDate: '2026-06-05',
      nextServiceMileage: 50000
    },
    {
      id: 'v2',
      companyId: 'company-1',
      vecNo: 'DEMO-UNIT-002',
      regNo: 'DEMO002',
      equipment: 'Prime Mover',
      brand: 'Scania',
      model: 'R450',
      mileage: 28500,
      engineHours: 4350,
      year: 2022,
      chassisNo: 'DEMO-CHASSIS-002',
      engineNo: 'DEMO-ENGINE-002',
      insuranceExpiry: '2026-12-20',
      roadTaxExpiry: '2026-11-15',
      puspakomExpiry: '2026-10-15'
    }
  ]
};

export const mockSuperadminUser: User = {
  id: 'local-superadmin',
  contactReference: 'TEST-SUPERADMIN',
  name: 'Super Admin',
  email: 'contact@example.com',
  phone: '+60 00-000 0000',
  companyId: 'test-company-superadmin',
  companyName: 'Customer Test Account',
  contactRole: 'Test Customer',
  preferredLanguage: 'en',
  permissions: {
    canViewAllVehicles: true,
    canCreateBooking: true,
    canCancelBooking: true,
    canRescheduleBooking: true,
    canViewRepairProgress: true,
    canOrderParts: true,
    canViewInvoices: true,
    canViewNotifications: true,
  },
  deliveryAddresses: [
    {
      id: 'superadmin-address-1',
      contactName: 'Super Admin',
      address: 'Mewah AutoWorks Test Customer Address, Johor',
      contactPhone: '+60 00-000 0000',
      isDefault: true,
    },
  ],
  vehicles: [
    {
      id: 'superadmin-vehicle-1',
      companyId: 'test-company-superadmin',
      vecNo: 'TEST 001',
      regNo: 'TEST0001',
      equipment: 'Prime Mover',
      brand: 'Test Fleet',
      model: 'Demo Vehicle',
      mileage: 1000,
      year: 2026,
      insuranceExpiry: '2027-12-31',
      roadTaxExpiry: '2027-12-31',
      puspakomExpiry: '2027-12-31',
    },
  ],
};

export const mockSuperadminContacts: CustomerContact[] = [
  {
    id: 'superadmin-contact-1',
    name: 'Super Admin',
    email: 'contact@example.com',
    phone: '+60 00-000 0000',
    role: 'Test Customer',
    isDefault: true,
  },
];

export let mockBookings: Booking[] = [
  {
    id: 'b1',
    bookingNumber: 'BK2026030001',
    orderType: 'service',
    vehicleId: 'v1',
    serviceType: 'Maintenance',
    serviceDate: '2026-03-15T10:00:00',
    serviceCentre: 'Mewah AutoWorks Kuala Lumpur',
    status: 'converted',
    totalPrice: 450,
    notes: 'Regular service checkup',
    workOrderId: 'wo1',
    workOrderNumber: 'WO-2026-000123',
  },
  {
    id: 'b2',
    bookingNumber: 'BK2026020045',
    invoiceNumber: 'INV2026020045',
    orderType: 'service',
    vehicleId: 'v1',
    serviceType: 'Repair',
    serviceDate: '2026-02-10T14:30:00',
    serviceCentre: 'Mewah AutoWorks Petaling Jaya',
    status: 'completed',
    totalPrice: 1250,
    invoice: {
      id: 'inv-b2',
      invoiceNumber: 'INV2026020045',
      bookingId: 'b2',
      vehicleId: 'v1',
      issuedAt: '2026-02-10T16:15:00+08:00',
      dueAt: '2026-03-12T23:59:00+08:00',
      paidAt: '2026-02-12T10:00:00+08:00',
      workOrderId: 'WO-2026-000098',
      discount: 0,
      paidAmount: 1250,
      balance: 0,
      paymentInstructions: 'Bank transfer details are available from the accounts team.',
      status: 'paid',
      billingCompany: 'Example Fleet Company',
      workshopName: 'Mewah AutoWorks Petaling Jaya',
      items: [
        {
          id: 'i1',
          name: 'Brake Pad Replacement',
          category: 'service',
          quantity: 1,
          unitPrice: 350,
          total: 350
        },
        {
          id: 'i2',
          name: 'Front Brake Pads (Set)',
          category: 'part',
          quantity: 1,
          unitPrice: 420,
          total: 420
        },
        {
          id: 'i3',
          name: 'Brake Fluid Top-up',
          category: 'service',
          quantity: 1,
          unitPrice: 80,
          total: 80
        },
        {
          id: 'i4',
          name: 'Brake Rotors (Pair)',
          category: 'part',
          quantity: 1,
          unitPrice: 280,
          total: 280
        }
      ],
      laborCost: 430,
      subtotal: 1130,
      tax: 120,
      total: 1250
    }
  },
  {
    id: 'b4',
    bookingNumber: 'BK2026080007',
    orderType: 'service',
    vehicleId: 'v2',
    serviceType: 'Engine Oil Service',
    serviceDate: '2026-08-15T09:30:00+08:00',
    serviceCentre: 'Mewah AutoWorks Pasir Gudang HQ',
    status: 'confirmed',
    totalPrice: 0,
    contactName: 'Demo Contact One',
    reportedProblem: 'Scheduled engine oil and filter service',
    notes: 'Please inspect the brake system during service.',
    timeSlot: '09:30 AM',
    contactId: 'contact-1',
  },
  {
    id: 'b3',
    bookingNumber: 'BK2025120032',
    invoiceNumber: 'INV2025120032',
    orderType: 'service',
    vehicleId: 'v1',
    serviceType: 'Maintenance',
    serviceDate: '2025-12-05T09:00:00',
    serviceCentre: 'Mewah AutoWorks Kuala Lumpur',
    status: 'completed',
    totalPrice: 380,
    invoice: {
      id: 'inv-b3',
      invoiceNumber: 'INV2025120032',
      bookingId: 'b3',
      vehicleId: 'v1',
      issuedAt: '2025-12-05T16:00:00+08:00',
      dueAt: '2026-01-04T23:59:00+08:00',
      status: 'overdue',
      workOrderId: 'WO-2025-000842',
      discount: 0,
      paidAmount: 0,
      balance: 380,
      paymentInstructions: 'Please quote the invoice number when making a bank transfer.',
      billingCompany: 'Example Fleet Company',
      workshopName: 'Mewah AutoWorks Kuala Lumpur',
      items: [
        {
          id: 'i5',
          name: 'Engine Oil Change',
          category: 'service',
          quantity: 1,
          unitPrice: 120,
          total: 120
        },
        {
          id: 'i6',
          name: 'Synthetic Engine Oil 5W-30',
          category: 'part',
          quantity: 4,
          unitPrice: 45,
          total: 180
        },
        {
          id: 'i7',
          name: 'Oil Filter',
          category: 'part',
          quantity: 1,
          unitPrice: 35,
          total: 35
        }
      ],
      laborCost: 120,
      subtotal: 335,
      tax: 45,
      total: 380
    }
  },
  {
    id: 'p1',
    bookingNumber: 'ORD-1709876543210',
    orderType: 'parts',
    status: 'ready',
    totalPrice: 795,
    deliveryAddress: 'Configure a delivery address',
    serviceDate: '2026-03-05T14:30:00',
    notes: 'Please deliver in the morning',
    items: [
      {
        id: 'sp1',
        name: 'Engine Oil 5W-30 (4L)',
        quantity: 2,
        price: 180,
        image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400'
      },
      {
        id: 'sp4',
        name: 'Brake Pads (Front Set)',
        quantity: 1,
        price: 420,
        image: 'https://images.unsplash.com/photo-1623511061832-2381bcf0f7c4?w=400'
      }
    ]
  },
  {
    id: 'p2',
    bookingNumber: 'ORD-1709123456789',
    orderType: 'parts',
    status: 'completed',
    totalPrice: 215,
    deliveryAddress: 'Configure a delivery address',
    serviceDate: '2026-02-28T11:00:00',
    items: [
      {
        id: 'sp2',
        name: 'Oil Filter',
        quantity: 2,
        price: 35,
        image: 'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=400'
      },
      {
        id: 'sp3',
        name: 'Air Filter',
        quantity: 1,
        price: 55,
        image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400'
      },
      {
        id: 'sp8',
        name: 'Windshield Wipers (Pair)',
        quantity: 2,
        price: 65,
        image: 'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=400'
      }
    ]
  }
];

export const mockSpareParts: SparePart[] = [
  {
    id: 'sp1',
    name: 'Engine Oil 5W-30 (4L)',
    category: 'Oil and Filters',
    price: 180,
    image: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400',
    inStock: true
    ,brand: 'Castrol',
    description: 'Fully synthetic 5W-30 engine oil supplied in a sealed 4 litre container.',
    compatibleVehicles: ['Prime movers', 'Light commercial vehicles']
  },
  {
    id: 'sp2',
    name: 'Oil Filter',
    category: 'Oil and Filters',
    price: 35,
    image: 'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?w=400',
    inStock: true
  },
  {
    id: 'sp3',
    name: 'Air Filter',
    category: 'Oil and Filters',
    price: 55,
    image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400',
    inStock: true
  },
  {
    id: 'sp4',
    name: 'Brake Pads (Front Set)',
    category: 'Brake Parts',
    price: 420,
    image: 'https://images.unsplash.com/photo-1623511061832-2381bcf0f7c4?w=400',
    inStock: true
  },
  {
    id: 'sp5',
    name: 'Brake Rotors (Pair)',
    category: 'Brake Parts',
    price: 280,
    image: 'https://images.unsplash.com/photo-1619405399517-d7fce0f13302?w=400',
    inStock: true
  },
  {
    id: 'sp6',
    name: 'Spark Plugs (Set of 4)',
    category: 'Engine Parts',
    price: 160,
    image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400',
    inStock: true
  },
  {
    id: 'sp7',
    name: 'Battery 12V 60Ah',
    category: 'Engine Parts',
    price: 350,
    image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=400',
    inStock: true
  },
  {
    id: 'sp8',
    name: 'Windshield Wipers (Pair)',
    category: 'Accessories',
    price: 65,
    image: 'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=400',
    inStock: true
  },
  {
    id: 'sp9',
    name: 'Heavy Duty Floor Mats',
    category: 'Accessories',
    price: 120,
    image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=400',
    inStock: true
  }
];

export const mockReminder: ServiceReminder = {
  id: 'r1',
  vehicleId: 'v1',
  nextServiceDate: '2026-06-05',
  recommendedMileage: 50000,
  serviceType: 'Maintenance',
  notificationEnabled: true
};

export const mockReminders: ServiceReminder[] = [mockReminder];

export const mockWorkOrders: WorkOrder[] = [
  {
    id: 'wo1',
    workOrderNumber: 'WO-2026-000123',
    companyId: 'company-1',
    vehicleId: 'v1',
    bookingId: 'b1',
    status: 'under_repair',
    checkedInAt: '2026-03-15T09:42:00+08:00',
    expectedCompletionAt: '2026-07-25T17:00:00+08:00',
    latestCustomerUpdate: 'Repair work is in progress. We will notify you when the vehicle is ready.',
    customerVisibleItems: ['Brake inspection', 'Front brake pad replacement'],
    workshopPhone: '+60 00-000 0000',
    workshopName: 'Mewah AutoWorks Kuala Lumpur',
    assignedAdvisor: 'Demo Advisor',
    reportedProblem: 'Grinding noise under braking and reduced braking response.',
    diagnosis: 'Front brake pads are worn below the safe service limit.',
    estimatedTotal: 980,
    timeline: [
      { id: 'wo1-1', label: 'Vehicle checked in', description: 'Keys and vehicle condition recorded.', date: '2026-03-15T09:42:00+08:00', completed: true },
      { id: 'wo1-2', label: 'Inspection completed', description: 'Front brake wear confirmed.', date: '2026-03-15T11:20:00+08:00', completed: true },
      { id: 'wo1-3', label: 'Repair approved', description: 'Brake pad replacement approved by fleet manager.', date: '2026-03-15T13:10:00+08:00', completed: true },
      { id: 'wo1-4', label: 'Repair in progress', description: 'Technician is replacing the front brake pads.', date: '2026-07-24T09:00:00+08:00', completed: true },
      { id: 'wo1-5', label: 'Ready for collection', date: '2026-07-25T17:00:00+08:00', completed: false }
    ]
  }
];

export const serviceCentres = [
  { 
    id: 'sc1', 
    name: 'MEWAHTRANS LOGISTIC SDN BHD', 
    address: 'Configure your workshop address',
    phone: '+60 00-000 0000'
  }
];

// Helper function to add a new booking/order
export const addBooking = (booking: Booking) => {
  mockBookings.unshift(booking); // Add to the beginning of the array
};
