<?php
/**
 * Invoice Domain Module
 *
 * Handles work order invoices, AutoCount invoice linking/sync payload,
 * accounting invoices, debtor code resolution, and invoice routes.
 */

function requireWorkOrderInvoiceSchema($con) {
    if (!tableExists($con, 'work_order_invoice') || !tableExists($con, 'work_order_invoice_item')) {
        sendResponse(false, 'Invoice storage is unavailable. Apply migration 018_work_order_invoices.sql.', null, 409);
    }
    ensureColumn($con, 'work_order_invoice', 'is_back_order', 'TINYINT(1) NOT NULL DEFAULT 0');
}

function invoiceDisplayStatus($row) {
    $status = strtolower(strval($row['status'] ?? 'draft'));
    $dueDate = strval($row['due_date'] ?? '');
    $balance = floatval($row['balance'] ?? 0);
    if (in_array($status, ['issued', 'partially_paid'], true) && $balance > 0 && $dueDate !== '' && $dueDate < date('Y-m-d')) return 'overdue';
    return $status;
}

function accountingInvoicePaymentStatus($row) {
    $documentStatus = strtolower(strval($row['document_status'] ?? 'approved'));
    if (in_array($documentStatus, ['void', 'expired'], true)) return $documentStatus;
    $total = round(floatval($row['total'] ?? 0), 2);
    $outstanding = round(floatval($row['outstanding'] ?? 0), 2);
    if ($outstanding <= 0) return 'paid';
    if ($outstanding < $total) return 'partially_paid';
    return 'issued';
}

function accountingInvoiceItems($con, $invoiceId) {
    if (!tableExists($con, 'accounting_invoice_item')) return [];
    $items = [];
    $result = mysqli_query($con, "SELECT * FROM accounting_invoice_item WHERE invoice_id = " . intval($invoiceId) . " ORDER BY line_no, id");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $items[] = [
            'id' => intval($row['id']),
            'type' => $row['item_type'] ?? 'other',
            'code' => $row['item_code'] ?? '',
            'description' => $row['description'],
            'quantity' => floatval($row['quantity']),
            'unitPrice' => floatval($row['unit_price']),
            'taxCode' => $row['tax_code'] ?? '',
            'taxRate' => floatval($row['tax_rate'] ?? 0),
            'taxAmount' => floatval($row['tax_amount'] ?? 0),
            'amount' => floatval($row['amount'])
        ];
    }
    return $items;
}

function workOrderInvoice($con, $workOrderId) {
    if (!tableExists($con, 'work_order_invoice') || !tableExists($con, 'work_order_invoice_item')) return null;
    $workOrderId = intval($workOrderId);
    $result = mysqli_query($con, "SELECT * FROM work_order_invoice WHERE work_order_id = $workOrderId LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row) return null;
    $invoiceId = intval($row['id']);
    $items = [];
    $itemResult = mysqli_query($con, "SELECT * FROM work_order_invoice_item WHERE invoice_id = $invoiceId ORDER BY sort_order, id");
    while ($itemResult && $item = mysqli_fetch_assoc($itemResult)) {
        $items[] = [
            'id' => intval($item['id']),
            'type' => $item['item_type'],
            'serviceTypeId' => $item['service_type_id'] !== null ? intval($item['service_type_id']) : null,
            'code' => $item['item_code'] ?? '',
            'description' => $item['description'],
            'quantity' => floatval($item['quantity']),
            'unitPrice' => floatval($item['unit_price']),
            'taxCode' => $item['tax_code'] ?? '',
            'taxRate' => floatval($item['tax_rate'] ?? 0),
            'taxAmount' => floatval($item['tax_amount'] ?? 0),
            'amount' => floatval($item['amount'])
        ];
    }
    return [
        'id' => $invoiceId,
        'workOrderId' => $workOrderId,
        'docType' => strtoupper(trim(strval($row['doc_type'] ?? 'INVOICE'))),
        'quotationId' => $row['quotation_id'] !== null ? intval($row['quotation_id']) : null,
        'invoiceNo' => $row['invoice_no'] ?: ($row['internal_ref'] ?? ''),
        'internalRef' => $row['internal_ref'] ?? '',
        'autocountInvoiceNo' => $row['invoice_no'] ?? '',
        'autocountDoNo' => $row['autocount_do_no'] ?? '',
        'autocountJobNo' => $row['autocount_job_no'] ?? '',
        'debtorCode' => $row['debtor_code'] ?? '',
        'vehicleType' => $row['vehicle_type'] ?? '',
        'vehicleNo' => $row['vehicle_no'] ?? '',
        'creditTermDays' => intval($row['credit_term_days'] ?? 30),
        'currency' => $row['currency'] ?? 'MYR',
        'syncStatus' => $row['sync_status'] ?? 'not_queued',
        'syncRequestedAt' => $row['sync_requested_at'] ?? null,
        'syncedAt' => $row['synced_at'] ?? null,
        'syncError' => $row['sync_error'] ?? '',
        'mewahtransSyncStatus' => $row['mewahtrans_sync_status'] ?? 'not_queued',
        'mewahtransRefNo' => $row['mewahtrans_ref_no'] ?? '',
        'mewahtransSyncedAt' => $row['mewahtrans_synced_at'] ?? null,
        'mewahtransError' => $row['mewahtrans_error'] ?? '',
        'eInvoiceStatus' => $row['e_invoice_status'] ?? '',
        'eInvoiceUuid' => $row['e_invoice_uuid'] ?? '',
        'status' => invoiceDisplayStatus($row),
        'storedStatus' => $row['status'],
        'invoiceDate' => $row['invoice_date'],
        'dueDate' => $row['due_date'],
        'subtotal' => floatval($row['subtotal']),
        'discount' => floatval($row['discount']),
        'taxRate' => floatval($row['tax_rate']),
        'taxAmount' => floatval($row['tax_amount']),
        'total' => floatval($row['total']),
        'paidAmount' => floatval($row['paid_amount']),
        'balance' => floatval($row['balance']),
        'paymentMethod' => $row['payment_method'] ?? '',
        'notes' => $row['notes'] ?? '',
        'paymentInstructions' => $row['payment_instructions'] ?? '',
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'issuedAt' => $row['issued_at'],
        'paidAt' => $row['paid_at'],
        'voidedAt' => $row['voided_at'],
        'isBackOrder' => boolval($row['is_back_order'] ?? false),
        'items' => $items
    ];
}

function autoCountInvoiceSyncPayload($con, $invoiceId) {
    $invoiceId = intval($invoiceId);
    $result = mysqli_query($con, "SELECT work_order_id FROM work_order_invoice WHERE id = $invoiceId LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row) return null;
    $workOrderId = intval($row['work_order_id']);
    $invoice = workOrderInvoice($con, $workOrderId);
    $context = invoiceWorkOrderContext($con, $workOrderId);
    if (!$invoice || !$context) return null;
    return [
        'mawInvoiceId' => $invoiceId,
        'internalRef' => $invoice['internalRef'],
        'debtorCode' => $invoice['debtorCode'],
        'debtorName' => $context['companyName'],
        'invoiceDate' => $invoice['invoiceDate'],
        'creditTermDays' => $invoice['creditTermDays'],
        'currency' => $invoice['currency'],
        'jobNo' => $invoice['autocountJobNo'],
        'vehicleType' => $invoice['vehicleType'],
        'vehicleNo' => $invoice['vehicleNo'],
        'workOrderNo' => $context['workOrderNo'],
        'subtotal' => $invoice['subtotal'],
        'discount' => $invoice['discount'],
        'taxAmount' => $invoice['taxAmount'],
        'total' => $invoice['total'],
        'notes' => $invoice['notes'],
        'paymentInstructions' => $invoice['paymentInstructions'],
        'items' => array_map(function ($item, $index) {
            return [
                'lineNo' => $index + 1,
                'itemType' => $item['type'],
                'itemCode' => $item['code'],
                'description' => $item['description'],
                'quantity' => $item['quantity'],
                'unitPrice' => $item['unitPrice'],
                'taxCode' => $item['taxCode'],
                'taxRate' => $item['taxRate'],
                'taxAmount' => $item['taxAmount'],
                'amount' => $item['amount']
            ];
        }, $invoice['items'], array_keys($invoice['items']))
    ];
}

function resolveCompanyDebtorCode($con, $companyId, $companyName = '', $customerId = 0) {
    $companyId = intval($companyId);
    $debtorCode = '';
    if ($companyId > 0 && tableExists($con, 'company') && columnExists($con, 'company', 'autocount_debtor_code')) {
        $cRes = mysqli_query($con, "SELECT name, autocount_debtor_code FROM company WHERE id = $companyId LIMIT 1");
        if ($cRes && ($cRow = mysqli_fetch_assoc($cRes))) {
            $debtorCode = trim(strval($cRow['autocount_debtor_code'] ?? ''));
            if ($debtorCode !== '') return $debtorCode;
            if (empty($companyName)) $companyName = trim(strval($cRow['name'] ?? ''));
        }
    }

    // Try finding match from AutoCount Debtor master
    if (tableExists($con, 'Debtor')) {
        if (!empty($companyName) && $companyName !== '-') {
            $nameEsc = mysqli_real_escape_string($con, trim($companyName));
            $dRes = mysqli_query($con, "SELECT AccNo FROM Debtor WHERE CompanyName = '$nameEsc' OR CompanyName LIKE '%$nameEsc%' OR '$nameEsc' LIKE CONCAT('%', CompanyName, '%') ORDER BY CASE WHEN CompanyName = '$nameEsc' THEN 1 ELSE 2 END, AccNo ASC LIMIT 1");
            if ($dRes && ($dRow = mysqli_fetch_assoc($dRes))) {
                $debtorCode = trim(strval($dRow['AccNo']));
                if ($companyId > 0 && columnExists($con, 'company', 'autocount_debtor_code')) {
                    mysqli_query($con, "UPDATE company SET autocount_debtor_code = '$debtorCode' WHERE id = $companyId");
                }
                return $debtorCode;
            }
        }
        // Try customer match if available
        if ($customerId > 0 && tableExists($con, 'customer')) {
            $custRes = mysqli_query($con, "SELECT name FROM customer WHERE id = $customerId LIMIT 1");
            if ($custRes && ($custRow = mysqli_fetch_assoc($custRes))) {
                $custName = trim(strval($custRow['name'] ?? ''));
                if ($custName !== '' && $custName !== '-') {
                    $custNameEsc = mysqli_real_escape_string($con, $custName);
                    $dRes = mysqli_query($con, "SELECT AccNo FROM Debtor WHERE CompanyName = '$custNameEsc' OR CompanyName LIKE '%$custNameEsc%' LIMIT 1");
                    if ($dRes && ($dRow = mysqli_fetch_assoc($dRes))) {
                        $debtorCode = trim(strval($dRow['AccNo']));
                        if ($companyId > 0 && columnExists($con, 'company', 'autocount_debtor_code')) {
                            mysqli_query($con, "UPDATE company SET autocount_debtor_code = '$debtorCode' WHERE id = $companyId");
                        }
                        return $debtorCode;
                    }
                }
            }
        }
        // Fallback standard Cash Debtor or first debtor in Debtor table
        $dRes = mysqli_query($con, "SELECT AccNo FROM Debtor WHERE AccNo = '300-C0001' OR DebtorType = 'CASH' ORDER BY AccNo ASC LIMIT 1");
        if ($dRes && ($dRow = mysqli_fetch_assoc($dRes))) {
            return trim(strval($dRow['AccNo']));
        }
    }

    return '300-C0001';
}

function invoiceWorkOrderContext($con, $workOrderId) {
    $workOrderId = intval($workOrderId);
    $vehicleTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
    $vehicleReg = firstColumn($con, $vehicleTable, ['registration_no', 'reg_no', 'plate_no', 'vehicle_no', 'vec_no']);
    $vehicleUnit = firstColumn($con, $vehicleTable, ['unit_no', 'unit_number', 'vec_no', 'vehicle_no']);
    $vehicleBrand = firstColumn($con, $vehicleTable, ['brand', 'make', 'manufacturer']);
    $vehicleModel = firstColumn($con, $vehicleTable, ['model', 'series']);
    $vehicleEquipment = firstColumn($con, $vehicleTable, ['equipment', 'vehicle_type', 'type']);
    $customerPhone = firstColumn($con, 'customer', ['phone', 'phone_no', 'mobile']);

    $vehicleUnitSql = $vehicleUnit ? "NULLIF(TRIM(cv.`$vehicleUnit`), '')" : "NULL";
    $vehicleRegSql = $vehicleReg ? "NULLIF(TRIM(cv.`$vehicleReg`), '')" : "NULL";
    $selectReg = "COALESCE($vehicleUnitSql, $vehicleRegSql, '-')";
    $selectBrand = $vehicleBrand ? "cv.`$vehicleBrand`" : "''";
    $selectModel = $vehicleModel ? "cv.`$vehicleModel`" : "''";
    $selectEquipment = $vehicleEquipment ? "cv.`$vehicleEquipment`" : "''";
    $selectPhone = $customerPhone ? "cust.`$customerPhone`" : "''";
    $result = mysqli_query($con, "SELECT j.*, comp.name AS company_name, comp.autocount_debtor_code,
        cust.name AS contact_name,
        $selectPhone AS customer_phone, $selectReg AS vehicle_no, $selectBrand AS brand,
        $selectModel AS model, $selectEquipment AS equipment_type
        FROM job j
        LEFT JOIN company comp ON comp.id = j.company_id
        LEFT JOIN customer cust ON cust.id = j.customer_id
        LEFT JOIN `$vehicleTable` cv ON cv.id = j.vehicle_id
        WHERE j.id = $workOrderId LIMIT 1");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    if (!$row) return null;

    $companyId = intval($row['company_id']);
    $companyName = $row['company_name'] ?? '-';
    $customerId = intval($row['customer_id'] ?? 0);
    $debtorCode = trim(strval($row['autocount_debtor_code'] ?? ''));
    if ($debtorCode === '') {
        $debtorCode = resolveCompanyDebtorCode($con, $companyId, $companyName, $customerId);
    }

    return [
        'id' => intval($row['id']),
        'workOrderNo' => $row['work_order_no'] ?? 'WO-' . intval($row['id']),
        'canonicalStatus' => deriveCanonicalStatus($row),
        'companyId' => $companyId,
        'companyName' => $companyName,
        'debtorCode' => $debtorCode,
        'autocountJobNo' => $row['autocount_job_no'] ?? '',
        'customerId' => $customerId,
        'contactName' => $row['contact_name'] ?? '-',
        'customerPhone' => formatMalaysiaPhone($row['customer_phone'] ?? '-'),
        'vehicleId' => intval($row['vehicle_id']),
        'vehicleNo' => $row['vehicle_no'] ?? '-',
        'brand' => $row['brand'] ?? '',
        'model' => $row['model'] ?? '',
        'equipmentType' => $row['equipment_type'] ?? '',
        'serviceType' => $row['service_type'] ?? '',
        'serviceCentre' => $row['service_centre'] ?? '',
        'isBackOrder' => boolval($row['is_back_order'] ?? false),
        'sourceBookingId' => $row['source_booking_id'] ? intval($row['source_booking_id']) : null
    ];
}

function invoiceWorkOrderContextMap($con, array $workOrderIds) {
    $workOrderIds = array_values(array_filter(array_unique(array_map('intval', $workOrderIds))));
    if (empty($workOrderIds) || !tableExists($con, 'job')) return [];

    $vehicleTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
    $vehicleReg = firstColumn($con, $vehicleTable, ['registration_no', 'reg_no', 'plate_no', 'vehicle_no', 'vec_no']);
    $vehicleUnit = firstColumn($con, $vehicleTable, ['unit_no', 'unit_number', 'vec_no', 'vehicle_no']);
    $vehicleBrand = firstColumn($con, $vehicleTable, ['brand', 'make', 'manufacturer']);
    $vehicleModel = firstColumn($con, $vehicleTable, ['model', 'series']);
    $vehicleEquipment = firstColumn($con, $vehicleTable, ['equipment', 'vehicle_type', 'type']);
    $customerPhone = firstColumn($con, 'customer', ['phone', 'phone_no', 'mobile']);

    $vehicleUnitSql = $vehicleUnit ? "NULLIF(TRIM(cv.`$vehicleUnit`), '')" : "NULL";
    $vehicleRegSql = $vehicleReg ? "NULLIF(TRIM(cv.`$vehicleReg`), '')" : "NULL";
    $selectReg = "COALESCE($vehicleUnitSql, $vehicleRegSql, '-')";
    $selectBrand = $vehicleBrand ? "cv.`$vehicleBrand`" : "''";
    $selectModel = $vehicleModel ? "cv.`$vehicleModel`" : "''";
    $selectEquipment = $vehicleEquipment ? "cv.`$vehicleEquipment`" : "''";
    $selectPhone = $customerPhone ? "cust.`$customerPhone`" : "''";

    $map = [];
    $chunks = array_chunk($workOrderIds, 400);
    foreach ($chunks as $chunk) {
        $idList = implode(',', $chunk);
        $result = mysqli_query($con, "SELECT j.*, comp.name AS company_name, comp.autocount_debtor_code,
            cust.name AS contact_name,
            $selectPhone AS customer_phone, $selectReg AS vehicle_no, $selectBrand AS brand,
            $selectModel AS model, $selectEquipment AS equipment_type
            FROM job j
            LEFT JOIN company comp ON comp.id = j.company_id
            LEFT JOIN customer cust ON cust.id = j.customer_id
            LEFT JOIN `$vehicleTable` cv ON cv.id = j.vehicle_id
            WHERE j.id IN ($idList)");
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $woId = intval($row['id']);
            $companyId = intval($row['company_id']);
            $companyName = $row['company_name'] ?? '-';
            $customerId = intval($row['customer_id'] ?? 0);
            $debtorCode = trim(strval($row['autocount_debtor_code'] ?? ''));
            if ($debtorCode === '') {
                $debtorCode = resolveCompanyDebtorCode($con, $companyId, $companyName, $customerId);
            }
            $map[$woId] = [
                'id' => $woId,
                'workOrderNo' => $row['work_order_no'] ?? 'WO-' . $woId,
                'canonicalStatus' => deriveCanonicalStatus($row),
                'companyId' => $companyId,
                'companyName' => $companyName,
                'debtorCode' => $debtorCode,
                'autocountJobNo' => $row['autocount_job_no'] ?? '',
                'customerId' => $customerId,
                'contactName' => $row['contact_name'] ?? '-',
                'customerPhone' => formatMalaysiaPhone($row['customer_phone'] ?? '-'),
                'vehicleId' => intval($row['vehicle_id']),
                'vehicleNo' => $row['vehicle_no'] ?? '-',
                'brand' => $row['brand'] ?? '',
                'model' => $row['model'] ?? '',
                'equipmentType' => $row['equipment_type'] ?? '',
                'serviceType' => $row['service_type'] ?? '',
                'serviceCentre' => $row['service_centre'] ?? '',
                'isBackOrder' => boolval($row['is_back_order'] ?? false),
                'sourceBookingId' => $row['source_booking_id'] ? intval($row['source_booking_id']) : null
            ];
        }
    }
    return $map;
}

function normalizeInvoicePayload($inputData) {
    $rawItems = $inputData['items'] ?? [];
    if (!is_array($rawItems) || count($rawItems) < 1 || count($rawItems) > 100) sendResponse(false, 'Invoice must contain between 1 and 100 items.', null, 400);
    $items = [];
    $subtotal = 0.0;
    foreach ($rawItems as $index => $rawItem) {
        $type = strtolower(trim(strval($rawItem['type'] ?? 'part')));
        if (!in_array($type, ['part', 'labour', 'other'], true)) sendResponse(false, 'Invalid item type on line ' . ($index + 1) . '.', null, 400);
        $description = trim(strval($rawItem['description'] ?? ''));
        $itemCode = substr(trim(strval($rawItem['code'] ?? '')), 0, 80);
        if ($description === '') {
            $description = $itemCode !== '' ? $itemCode : 'Item';
        }
        $quantity = round(floatval($rawItem['quantity'] ?? 0), 2);
        $unitPrice = round(floatval($rawItem['unitPrice'] ?? 0), 2);
        if ($quantity <= 0 || $quantity > 99999999 || $unitPrice < 0 || $unitPrice > 9999999999) sendResponse(false, 'Invalid quantity or unit price on line ' . ($index + 1) . '.', null, 400);
        $amount = round($quantity * $unitPrice, 2);
        $taxRate = round(floatval($rawItem['taxRate'] ?? 0), 2);
        if ($taxRate < 0 || $taxRate > 100) sendResponse(false, 'Tax rate must be between 0% and 100% on line ' . ($index + 1) . '.', null, 400);
        $taxAmount = round($amount * $taxRate / 100, 2);
        $subtotal = round($subtotal + $amount, 2);
        $items[] = [
            'type' => $type,
            'serviceTypeId' => intval($rawItem['serviceTypeId'] ?? 0) ?: null,
            'code' => $itemCode,
            'description' => substr($description, 0, 5000),
            'quantity' => $quantity,
            'unitPrice' => $unitPrice,
            'taxCode' => substr(trim(strval($rawItem['taxCode'] ?? ($taxRate > 0 ? 'SV-8' : ''))), 0, 30),
            'taxRate' => $taxRate,
            'taxAmount' => $taxAmount,
            'amount' => $amount
        ];
    }
    $discount = round(floatval($inputData['discount'] ?? 0), 2);
    if ($discount < 0 || $discount > $subtotal) sendResponse(false, 'Discount must not exceed the invoice subtotal.', null, 400);
    $invoiceDate = trim(strval($inputData['invoiceDate'] ?? date('Y-m-d')));
    $dueDate = trim(strval($inputData['dueDate'] ?? ''));
    foreach ([$invoiceDate, $dueDate] as $value) {
        if ($value === '') continue;
        $parsed = DateTime::createFromFormat('!Y-m-d', $value);
        if (!$parsed || $parsed->format('Y-m-d') !== $value) sendResponse(false, 'Invoice and due dates must be valid dates.', null, 400);
    }
    if ($dueDate !== '' && $dueDate < $invoiceDate) sendResponse(false, 'Due date cannot be earlier than invoice date.', null, 400);
    $taxAmount = round(array_sum(array_column($items, 'taxAmount')), 2);
    $taxRates = array_values(array_unique(array_map(function ($item) { return floatval($item['taxRate']); }, $items)));
    $taxRate = count($taxRates) === 1 ? floatval($taxRates[0]) : 0;
    $taxable = round($subtotal - $discount, 2);
    return [
        'items' => $items, 'invoiceDate' => $invoiceDate, 'dueDate' => $dueDate,
        'subtotal' => $subtotal, 'discount' => $discount, 'taxRate' => $taxRate,
        'taxAmount' => $taxAmount, 'total' => round($taxable + $taxAmount, 2),
        'autocountJobNo' => substr(strtoupper(trim(strval($inputData['autocountJobNo'] ?? ''))), 0, 60),
        'debtorCode' => substr(strtoupper(trim(strval($inputData['debtorCode'] ?? ''))), 0, 40),
        'vehicleType' => substr(trim(strval($inputData['vehicleType'] ?? '')), 0, 100),
        'vehicleNo' => substr(strtoupper(trim(strval($inputData['vehicleNo'] ?? ''))), 0, 150),
        'creditTermDays' => max(0, min(3650, intval($inputData['creditTermDays'] ?? 30))),
        'currency' => 'MYR',
        'notes' => substr(trim(strval($inputData['notes'] ?? '')), 0, 5000),
        'paymentInstructions' => substr(trim(strval($inputData['paymentInstructions'] ?? '')), 0, 5000)
    ];
}

/**
 * Invoice route dispatcher
 */
// --- Legacy Invoice Helpers ---
function legacyInvoices($con) {
    if (!tableExists($con, 'customer_invoice')) {
        return null;
    }

    $invoices = [];
    $result = mysqli_query($con, "SELECT * FROM customer_invoice ORDER BY id DESC");
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $total = floatval(rowValue($row, ['total', 'grand_total', 'amount'], 0));
        $subtotal = floatval(rowValue($row, ['subtotal', 'sub_total'], $total));
        $tax = floatval(rowValue($row, ['tax', 'sst'], 0));
        $dateValue = rowValue($row, ['invoice_date', 'date', 'created_at'], date('Y-m-d H:i:s'));

        $invoices[] = [
            'id' => rowValue($row, ['invoice_no', 'invoice_number', 'id'], 'INV-' . rowValue($row, ['id'], '')),
            'invoiceNo' => rowValue($row, ['invoice_no', 'invoice_number', 'id'], 'INV-' . rowValue($row, ['id'], '')),
            'bookingId' => rowValue($row, ['appointment_no', 'booking_no', 'job_no', 'customer_appointment_id'], '-'),
            'customer' => rowValue($row, ['customer_name', 'name'], '-'),
            'vehicle' => rowValue($row, ['vehicle', 'vehicle_no', 'reg_no'], '-'),
            'date' => substr($dateValue, 0, 10),
            'services' => [[
                'name' => rowValue($row, ['service_name', 'description', 'remark'], 'Service'),
                'price' => $subtotal
            ]],
            'parts' => [],
            'labor' => floatval(rowValue($row, ['labor', 'labour', 'labor_cost'], 0)),
            'subtotal' => $subtotal,
            'tax' => $tax,
            'total' => $total,
            'status' => strtolower(rowValue($row, ['status', 'payment_status'], 'paid')) === 'paid' ? 'Paid' : 'Unpaid',
            'paymentMethod' => rowValue($row, ['payment_method', 'payment_type'], '-')
        ];
    }

    return $invoices;
}



function updateAdminInvoiceStatus($con, $invoiceNo, $status, $paymentMethod = 'Cash') {
    $useLegacy = tableExists($con, 'customer_invoice');
    $cleanInvoiceNo = mysqli_real_escape_string($con, $invoiceNo);
    $cleanStatus = mysqli_real_escape_string($con, $status);
    $cleanMethod = mysqli_real_escape_string($con, $paymentMethod);
    
    if ($useLegacy) {
        $statusCol = 'status';
        if (columnExists($con, 'customer_invoice', 'payment_status')) {
            $statusCol = 'payment_status';
        }
        
        $methodCol = 'payment_method';
        if (columnExists($con, 'customer_invoice', 'payment_type')) {
            $methodCol = 'payment_type';
        }
        
        $idCol = 'id';
        if (columnExists($con, 'customer_invoice', 'invoice_no')) {
            $idCol = 'invoice_no';
        } else if (columnExists($con, 'customer_invoice', 'invoice_number')) {
            $idCol = 'invoice_number';
        }
        
        $query = "UPDATE customer_invoice SET `$statusCol` = '$cleanStatus', `$methodCol` = '$cleanMethod' 
                  WHERE `$idCol` = '$cleanInvoiceNo' OR id = " . intval($cleanInvoiceNo);
        return mysqli_query($con, $query);
    } else {
        $dbStatus = strtolower($cleanStatus) === 'paid' ? 'paid' : 'unpaid';
        $query = "UPDATE bookings SET payment_status = '$dbStatus', payment_method = '$cleanMethod' 
                  WHERE invoice_number = '$cleanInvoiceNo'";
        return mysqli_query($con, $query);
    }
}



function handleInvoiceRoute($con, $mode, $inputData) {
    switch ($mode) {
        case 'admin-invoice-work-orders':
            requireWorkOrderInvoiceSchema($con);
            $statusSql = getCanonicalStatusSql($con, 'j');
            $result = mysqli_query($con, "SELECT j.id FROM job j
                WHERE ($statusSql) IN ('ready_for_collection', 'collected')
                  AND NOT EXISTS (SELECT 1 FROM work_order_invoice wi WHERE wi.work_order_id = j.id)
                ORDER BY COALESCE(j.collected_at, j.completed_at) DESC, j.id DESC");
            if (!$result) {
                sendResponse(false, 'Unable to load invoice-ready work orders: ' . mysqli_error($con), null, 500);
            }
            $candidates = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $context = invoiceWorkOrderContext($con, intval($row['id']));
                if ($context) {
                    $quotation = workOrderQuotation($con, intval($row['id']));
                    $context['quotationNo'] = $quotation && $quotation['status'] === 'approved' ? $quotation['quotationNo'] : null;
                    $context['quotationTotal'] = $quotation && $quotation['status'] === 'approved' ? $quotation['total'] : null;
                    $context['orderType'] = 'work_order';
                    $candidates[] = $context;
                }
            }

            // Also add Parts Orders as candidates
            $partsOrdersList = adminPartsOrders($con);
            foreach ($partsOrdersList as $po) {
                $candidates[] = [
                    'id' => 0,
                    'partsOrderId' => $po['id'],
                    'workOrderNo' => $po['id'],
                    'canonicalStatus' => strtolower($po['status'] ?? 'pending'),
                    'companyName' => $po['customer'] ?? 'Customer',
                    'contactName' => '',
                    'customerPhone' => '',
                    'vehicleNo' => 'Parts Order',
                    'brand' => '',
                    'model' => '',
                    'equipmentType' => 'Spare Parts',
                    'serviceType' => 'Parts Fulfilment',
                    'serviceCentre' => 'Mewah AutoWorks',
                    'orderType' => 'parts_order',
                    'quotationNo' => $po['autocountDoNo'] ?: null,
                    'quotationTotal' => floatval($po['total'] ?? 0),
                    'partsOrder' => $po
                ];
            }

            sendResponse(true, 'Invoice-ready work orders retrieved.', $candidates);
            break;

        case 'admin-get-work-order-invoice':
            requireWorkOrderInvoiceSchema($con);
            $jobId = intval($_GET['id'] ?? $inputData['id'] ?? 0);
            if ($jobId <= 0) sendResponse(false, 'Work order ID is required.', null, 400);
            $context = invoiceWorkOrderContext($con, $jobId);
            if (!$context) sendResponse(false, 'Work order not found.', null, 404);
            $inv = workOrderInvoice($con, $jobId);
            if (!$inv && tableExists($con, 'accounting_invoice')) {
                $accRes = mysqli_query($con, "SELECT * FROM accounting_invoice WHERE work_order_id = $jobId LIMIT 1");
                $accRow = $accRes ? mysqli_fetch_assoc($accRes) : null;
                if ($accRow) {
                    $accId = intval($accRow['id']);
                    $accItems = accountingInvoiceItems($con, $accId);
                    $tot = floatval($accRow['total']);
                    $bal = floatval($accRow['outstanding']);
                    $inv = [
                        'id' => $accId,
                        'workOrderId' => $jobId,
                        'docType' => 'INVOICE',
                        'quotationId' => null,
                        'invoiceNo' => $accRow['external_invoice_no'],
                        'internalRef' => $accRow['external_invoice_no'],
                        'autocountInvoiceNo' => $accRow['external_invoice_no'],
                        'autocountDoNo' => '',
                        'autocountJobNo' => $accRow['external_job_no'] ?: ($context['workOrderNo'] ?? ''),
                        'debtorCode' => $context['debtorCode'] ?? '',
                        'vehicleType' => $context['equipmentType'] ?? '',
                        'vehicleNo' => $accRow['vehicle_no_raw'] ?: ($context['vehicleNo'] ?? ''),
                        'creditTermDays' => 30,
                        'currency' => $accRow['currency'] ?: 'MYR',
                        'syncStatus' => 'synced',
                        'syncRequestedAt' => null,
                        'syncedAt' => $accRow['source_updated_at'] ?: $accRow['created_at'],
                        'syncError' => '',
                        'mewahtransSyncStatus' => 'not_queued',
                        'mewahtransRefNo' => '',
                        'mewahtransSyncedAt' => null,
                        'mewahtransError' => '',
                        'eInvoiceStatus' => $accRow['e_invoice_status'] ?? '',
                        'eInvoiceUuid' => $accRow['e_invoice_uuid'] ?? '',
                        'status' => 'issued',
                        'storedStatus' => 'issued',
                        'invoiceDate' => $accRow['invoice_date'],
                        'dueDate' => $accRow['invoice_date'],
                        'subtotal' => $tot,
                        'discount' => 0,
                        'taxRate' => 0,
                        'taxAmount' => 0,
                        'total' => $tot,
                        'paidAmount' => max(0, $tot - $bal),
                        'balance' => $bal,
                        'paymentMethod' => '',
                        'notes' => 'Synchronized from AutoCount accounting ledger.',
                        'paymentInstructions' => '',
                        'createdAt' => $accRow['created_at'],
                        'updatedAt' => $accRow['updated_at'],
                        'issuedAt' => $accRow['invoice_date'],
                        'paidAt' => null,
                        'voidedAt' => null,
                        'isBackOrder' => false,
                        'items' => count($accItems) > 0 ? $accItems : [
                            [
                                'id' => 1,
                                'type' => 'labour',
                                'serviceTypeId' => null,
                                'code' => 'SERVICE',
                                'description' => $context['serviceType'] ?: 'Workshop Service & Maintenance',
                                'quantity' => 1,
                                'unitPrice' => $tot,
                                'taxCode' => '@0%',
                                'taxRate' => 0,
                                'taxAmount' => 0,
                                'amount' => $tot
                            ]
                        ]
                    ];
                }
            }
            sendResponse(true, 'Work order invoice retrieved.', [
                'invoice' => $inv,
                'workOrder' => $context,
                'quotation' => workOrderQuotation($con, $jobId),
                'settings' => systemSettingsPayload($con)
            ]);
            break;

        case 'admin-save-work-order-invoice':
            requireWorkOrderInvoiceSchema($con);
            $jobId = intval($inputData['workOrderId'] ?? 0);
            $context = invoiceWorkOrderContext($con, $jobId);
            if (!$context) sendResponse(false, 'Work order not found.', null, 404);
            if (!in_array($context['canonicalStatus'], ['ready_for_collection', 'collected'], true)) {
                sendResponse(false, 'Invoice can only be created when the work order is Ready for Collection or Collected.', null, 409);
            }
            $existing = workOrderInvoice($con, $jobId);
            if ($existing) {
                if ($existing['syncStatus'] === 'synced') {
                    sendResponse(false, 'Invoices already synced to AutoCount cannot be edited.', null, 409);
                }
                if ($existing['syncStatus'] === 'processing') {
                    sendResponse(false, 'Wait for the current AutoCount sync attempt to finish before editing.', null, 409);
                }
                if ($existing['storedStatus'] === 'void') {
                    sendResponse(false, 'Void invoices cannot be edited.', null, 409);
                }
            }
            $invoice = normalizeInvoicePayload($inputData);
            $invoiceDate = mysqli_real_escape_string($con, $invoice['invoiceDate']);
            $dueDateSql = $invoice['dueDate'] === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $invoice['dueDate']) . "'";
            $notes = mysqli_real_escape_string($con, $invoice['notes']);
            $instructions = mysqli_real_escape_string($con, $invoice['paymentInstructions']);
            $autocountJobNo = mysqli_real_escape_string($con, $invoice['autocountJobNo'] ?: $context['workOrderNo']);
            $debtorCode = mysqli_real_escape_string($con, $invoice['debtorCode'] ?: ($context['debtorCode'] ?? ''));
            if ($debtorCode === '') {
                $debtorCode = mysqli_real_escape_string($con, resolveCompanyDebtorCode($con, $context['companyId'], $context['companyName'], $context['customerId']));
            }
            if ($debtorCode !== '' && $context['companyId'] > 0 && tableExists($con, 'company') && columnExists($con, 'company', 'autocount_debtor_code')) {
                mysqli_query($con, "UPDATE company SET autocount_debtor_code = '$debtorCode' WHERE id = {$context['companyId']}");
            }
            $vehicleType = mysqli_real_escape_string($con, $invoice['vehicleType'] ?: $context['equipmentType']);
            $vehicleNo = mysqli_real_escape_string($con, $invoice['vehicleNo'] ?: $context['vehicleNo']);
            $creditTermDays = intval($invoice['creditTermDays']);
            $isBackOrder = !empty($inputData['isBackOrder']) ? 1 : 0;
            $docType = strtoupper(trim(strval($inputData['docType'] ?? ($existing['docType'] ?? 'INVOICE'))));
            if (!in_array($docType, ['INVOICE', 'DO'], true)) $docType = 'INVOICE';
            $docTypeSql = mysqli_real_escape_string($con, $docType);
            $quotation = workOrderQuotation($con, $jobId);
            $quotationIdSql = $quotation && $quotation['status'] === 'approved' ? intval($quotation['id']) : 'NULL';
            $adminId = intval($_SESSION['admin_id'] ?? 0);
            mysqli_begin_transaction($con);
            try {
                $oldPartQuantities = [];
                if ($existing) {
                    $invoiceId = intval($existing['id']);
                    if ($existing['storedStatus'] !== 'draft' && empty($existing['isBackOrder'])) {
                        $oldItemsRes = mysqli_query($con, "SELECT item_code, quantity FROM work_order_invoice_item WHERE invoice_id = $invoiceId AND item_type = 'part'");
                        while ($it = $oldItemsRes ? mysqli_fetch_assoc($oldItemsRes) : null) {
                            $sku = strtoupper(trim(strval($it['item_code'] ?? '')));
                            if ($sku !== '') {
                                $oldPartQuantities[$sku] = ($oldPartQuantities[$sku] ?? 0) + floatval($it['quantity'] ?? 0);
                            }
                        }
                    }
                    if (!mysqli_query($con, "UPDATE work_order_invoice SET invoice_date = '$invoiceDate', due_date = $dueDateSql,
                        subtotal = {$invoice['subtotal']}, discount = {$invoice['discount']}, tax_rate = {$invoice['taxRate']},
                        tax_amount = {$invoice['taxAmount']}, total = {$invoice['total']}, balance = {$invoice['total']},
                        notes = '$notes', payment_instructions = '$instructions', quotation_id = $quotationIdSql,
                        autocount_job_no = '$autocountJobNo', debtor_code = '$debtorCode', vehicle_type = '$vehicleType',
                        vehicle_no = '$vehicleNo', credit_term_days = $creditTermDays, doc_type = '$docTypeSql', is_back_order = $isBackOrder, currency = 'MYR', updated_at = NOW()
                        WHERE id = $invoiceId")) throw new Exception(mysqli_error($con), 500);
                    if (!mysqli_query($con, "DELETE FROM work_order_invoice_item WHERE invoice_id = $invoiceId")) throw new Exception(mysqli_error($con), 500);
                } else {
                    if (!mysqli_query($con, "INSERT INTO work_order_invoice
                        (work_order_id, quotation_id, doc_type, status, invoice_date, due_date, credit_term_days, currency,
                         autocount_job_no, debtor_code, vehicle_type, vehicle_no, subtotal, discount, tax_rate,
                         tax_amount, total, balance, notes, payment_instructions, is_back_order, created_by)
                        VALUES ($jobId, $quotationIdSql, '$docTypeSql', 'draft', '$invoiceDate', $dueDateSql, $creditTermDays, 'MYR',
                         '$autocountJobNo', '$debtorCode', '$vehicleType', '$vehicleNo', {$invoice['subtotal']},
                         {$invoice['discount']}, {$invoice['taxRate']}, {$invoice['taxAmount']}, {$invoice['total']},
                         {$invoice['total']}, '$notes', '$instructions', $isBackOrder, $adminId)")) throw new Exception(mysqli_error($con), 500);
                    $invoiceId = intval(mysqli_insert_id($con));
                    $internalRef = sprintf('MAW-%s-%06d', date('Y'), $invoiceId);
                    if (!mysqli_query($con, "UPDATE work_order_invoice SET internal_ref = '$internalRef' WHERE id = $invoiceId")) throw new Exception(mysqli_error($con), 500);
                }
                if ($autocountJobNo !== '') mysqli_query($con, "UPDATE job SET autocount_job_no = '$autocountJobNo' WHERE id = $jobId");
                foreach ($invoice['items'] as $sortOrder => $item) {
                    $type = mysqli_real_escape_string($con, $item['type']);
                    $serviceTypeId = !empty($item['serviceTypeId']) ? intval($item['serviceTypeId']) : 'NULL';
                    $code = mysqli_real_escape_string($con, $item['code']);
                    $description = mysqli_real_escape_string($con, $item['description']);
                    $taxCode = mysqli_real_escape_string($con, $item['taxCode']);
                    if (!mysqli_query($con, "INSERT INTO work_order_invoice_item
                        (invoice_id, item_type, service_type_id, item_code, description, quantity, unit_price,
                         tax_code, tax_rate, tax_amount, amount, sort_order)
                        VALUES ($invoiceId, '$type', $serviceTypeId, '$code', '$description', {$item['quantity']},
                         {$item['unitPrice']}, '$taxCode', {$item['taxRate']}, {$item['taxAmount']}, {$item['amount']}, " . intval($sortOrder) . ")")) throw new Exception(mysqli_error($con), 500);
                }

                if ($existing && $existing['storedStatus'] !== 'draft') {
                    // Reconcile parts inventory stock difference if not a Back Order
                    if (!$isBackOrder) {
                        $newPartQuantities = [];
                        foreach ($invoice['items'] as $item) {
                            if (strtolower(trim(strval($item['type'] ?? ''))) === 'part') {
                                $sku = strtoupper(trim(strval($item['code'] ?? '')));
                                if ($sku !== '') {
                                    $newPartQuantities[$sku] = ($newPartQuantities[$sku] ?? 0) + floatval($item['quantity'] ?? 0);
                                }
                            }
                        }
                        $allSkus = array_unique(array_merge(array_keys($oldPartQuantities), array_keys($newPartQuantities)));
                        $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
                        if ($partTable && !empty($allSkus)) {
                            $skuCol = firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
                            $stockCol = firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity']);
                            $inStockCol = firstColumn($con, $partTable, ['in_stock']);
                            if ($skuCol && $stockCol) {
                                foreach ($allSkus as $sku) {
                                    $oldQty = $oldPartQuantities[$sku] ?? 0;
                                    $newQty = $newPartQuantities[$sku] ?? 0;
                                    $delta = $newQty - $oldQty;
                                    if ($delta != 0) {
                                        $escapedSku = mysqli_real_escape_string($con, $sku);
                                        $inStockSql = $inStockCol ? ", `$inStockCol` = IF(`$stockCol` - $delta > 0, 1, 0)" : '';
                                        mysqli_query($con, "UPDATE `$partTable` SET `$stockCol` = `$stockCol` - $delta $inStockSql WHERE UPPER(TRIM(`$skuCol`)) = '$escapedSku'");

                                        $pRes = mysqli_query($con, "SELECT id, `$stockCol` AS stock_balance FROM `$partTable` WHERE UPPER(TRIM(`$skuCol`)) = '$escapedSku' LIMIT 1");
                                        $pRow = $pRes ? mysqli_fetch_assoc($pRes) : null;
                                        if ($pRow && function_exists('recordPartStockTransaction')) {
                                            $partId = intval($pRow['id']);
                                            $newBal = floatval($pRow['stock_balance']);
                                            $invDocNo = !empty($existing['invoiceNo']) ? $existing['invoiceNo'] : ($existing['internalRef'] ?? "INV-$invoiceId");
                                            recordPartStockTransaction($con, [
                                                'part_id' => $partId,
                                                'transaction_type' => $delta > 0 ? 'job_consume' : 'return',
                                                'doc_type' => 'INVOICE',
                                                'doc_id' => $invoiceId,
                                                'doc_no' => $invDocNo,
                                                'party_code' => $debtorCode,
                                                'party_name' => $company['name'] ?? null,
                                                'quantity_change' => -$delta,
                                                'balance_after' => $newBal,
                                                'notes' => ($delta > 0 ? 'Parts consumed on invoice adjustment' : 'Parts returned on invoice adjustment') . " ($invDocNo)",
                                                'created_by' => $_SESSION['admin_id'] ?? null
                                            ]);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    mysqli_query($con, "UPDATE work_order_invoice SET status = 'pending_sync', sync_status = 'queued', sync_error = NULL, mewahtrans_sync_status = 'pending', mewahtrans_error = NULL, updated_at = NOW() WHERE id = $invoiceId");
                    if (tableExists($con, 'autocount_invoice_sync_queue')) {
                        mysqli_query($con, "INSERT INTO autocount_invoice_sync_queue (invoice_id, operation, status) VALUES ($invoiceId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                    }
                    if (tableExists($con, 'mewahtrans_invoice_sync_queue')) {
                        mysqli_query($con, "INSERT INTO mewahtrans_invoice_sync_queue (invoice_id, operation, status) VALUES ($invoiceId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                    }
                    if ($docType === 'DO' && tableExists($con, 'autocount_parts_order_sync_queue')) {
                        $cleanRef = mysqli_real_escape_string($con, $existing['internalRef']);
                        $doPayload = [
                            'orderId' => $existing['internalRef'],
                            'workOrderId' => $jobId,
                            'docType' => 'DO',
                            'docDate' => $invoice['invoiceDate'],
                            'debtorCode' => $debtorCode,
                            'customerName' => $context['companyName'] ?? 'Customer',
                            'deliveryAddress' => $invoice['vehicleNo'] ?: '',
                            'vehicleNo' => $invoice['vehicleNo'],
                            'vehicleType' => $invoice['vehicleType'],
                            'totalAmount' => floatval($invoice['total']),
                            'items' => array_map(function ($item, $index) {
                                return [
                                    'lineNo' => $index + 1,
                                    'itemType' => $item['type'],
                                    'itemCode' => $item['code'] ?? '',
                                    'description' => $item['description'],
                                    'quantity' => floatval($item['quantity']),
                                    'unitPrice' => floatval($item['unitPrice']),
                                    'amount' => floatval($item['amount'])
                                ];
                            }, $invoice['items'], array_keys($invoice['items']))
                        ];
                        $doPayloadJson = mysqli_real_escape_string($con, json_encode($doPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                        mysqli_query($con, "INSERT INTO autocount_parts_order_sync_queue 
                            (order_id, doc_type, debtor_code, customer_name, delivery_address, payload_json, operation, status)
                            VALUES ('$cleanRef', 'DO', '$debtorCode', '" . mysqli_real_escape_string($con, $context['companyName'] ?? 'Customer') . "', '$vehicleNo', '$doPayloadJson', 'create', 'pending')
                            ON DUPLICATE KEY UPDATE payload_json = '$doPayloadJson', status = 'pending', attempt_count = 0, locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                    }
                }

                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to save invoice: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, ($existing && $existing['storedStatus'] !== 'draft') ? 'Invoice updated and sync queue refreshed.' : 'Invoice draft saved.', workOrderInvoice($con, $jobId));
            break;

        case 'admin-issue-work-order-invoice':
            requireWorkOrderInvoiceSchema($con);
            $jobId = intval($inputData['workOrderId'] ?? 0);
            $invoice = workOrderInvoice($con, $jobId);
            if (!$invoice) sendResponse(false, 'Save the invoice draft before issuing it.', null, 409);
            if ($invoice['storedStatus'] !== 'draft') sendResponse(false, 'Only a draft invoice can be queued.', null, 409);
            $invoiceId = intval($invoice['id']);
            $debtorCode = trim(strval($invoice['debtorCode'] ?? ''));
            $context = invoiceWorkOrderContext($con, $jobId);
            $hasCorporate = $context && intval($context['companyId'] ?? 0) > 0;
            if ($debtorCode === '' || ($hasCorporate && $debtorCode === '300-C0001')) {
                $resolved = $context ? ($context['debtorCode'] ?: resolveCompanyDebtorCode($con, $context['companyId'], $context['companyName'], $context['customerId'])) : '';
                if ($resolved !== '' && $resolved !== '300-C0001') {
                    $debtorCode = $resolved;
                } elseif ($hasCorporate) {
                    sendResponse(false, 'Debtor Code is required for corporate customer (' . ($context['companyName'] ?? 'Company') . '). Please assign an AutoCount Debtor Code in Company settings before issuing.', null, 422);
                } else {
                    $debtorCode = '300-C0001';
                }
                $debtorCodeEsc = mysqli_real_escape_string($con, $debtorCode);
                mysqli_query($con, "UPDATE work_order_invoice SET debtor_code = '$debtorCodeEsc' WHERE id = $invoiceId");
            }
            if (trim(strval($invoice['autocountJobNo'] ?? '')) === '') sendResponse(false, 'AutoCount Job No. is required.', null, 409);
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE work_order_invoice SET status = 'pending_sync', sync_status = 'queued', mewahtrans_sync_status = 'pending', mewahtrans_error = NULL, sync_requested_at = NOW(), sync_error = NULL, updated_at = NOW() WHERE id = $invoiceId")) throw new Exception(mysqli_error($con), 500);

                // Deduct stock in MAW parts inventory for all part line items in the invoice unless marked as Back Order
                $isBackOrderInvoice = !empty($invoice['isBackOrder']);
                $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
                if (!$isBackOrderInvoice && $partTable && !empty($invoice['items'])) {
                    $skuCol = firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
                    $stockCol = firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity']);
                    $inStockCol = firstColumn($con, $partTable, ['in_stock']);
                    if ($skuCol && $stockCol) {
                        foreach ($invoice['items'] as $item) {
                            $itemType = strtolower(trim(strval($item['type'] ?? '')));
                            $itemCode = trim(strval($item['code'] ?? ''));
                            $qty = floatval($item['quantity'] ?? 0);
                            if ($itemType === 'part' && $itemCode !== '' && $qty > 0) {
                                $escapedCode = mysqli_real_escape_string($con, $itemCode);
                                $inStockSql = $inStockCol ? ", `$inStockCol` = IF(`$stockCol` - $qty > 0, 1, 0)" : '';
                                mysqli_query($con, "UPDATE `$partTable` SET `$stockCol` = `$stockCol` - $qty $inStockSql WHERE UPPER(TRIM(`$skuCol`)) = UPPER(TRIM('$escapedCode'))");

                                $pRes = mysqli_query($con, "SELECT id, `$stockCol` AS stock_balance FROM `$partTable` WHERE UPPER(TRIM(`$skuCol`)) = UPPER(TRIM('$escapedCode')) LIMIT 1");
                                $pRow = $pRes ? mysqli_fetch_assoc($pRes) : null;
                                if ($pRow && function_exists('recordPartStockTransaction')) {
                                    $partId = intval($pRow['id']);
                                    $newBal = floatval($pRow['stock_balance']);
                                    $invDocNo = !empty($invoice['invoiceNo']) ? $invoice['invoiceNo'] : ($invoice['internalRef'] ?? "INV-$invoiceId");
                                    recordPartStockTransaction($con, [
                                        'part_id' => $partId,
                                        'transaction_type' => 'job_consume',
                                        'doc_type' => 'INVOICE',
                                        'doc_id' => $invoiceId,
                                        'doc_no' => $invDocNo,
                                        'party_code' => $debtorCode,
                                        'party_name' => $context['companyName'] ?? ($context['customerName'] ?? 'Customer'),
                                        'quantity_change' => -$qty,
                                        'balance_after' => $newBal,
                                        'unit_cost' => floatval($item['cost'] ?? 0),
                                        'notes' => "Dispatched for Job WO-{$jobId} (Invoice: $invDocNo)",
                                        'created_by' => $_SESSION['admin_id'] ?? null
                                    ]);
                                }
                            }
                        }
                    }
                }

                $docType = strtoupper(trim(strval($invoice['docType'] ?? 'INVOICE')));
                if ($docType === 'DO') {
                    $context = invoiceWorkOrderContext($con, $jobId);
                    $doPayload = [
                        'orderId' => $invoice['internalRef'],
                        'workOrderId' => $jobId,
                        'docType' => 'DO',
                        'docDate' => $invoice['invoiceDate'],
                        'debtorCode' => $debtorCode,
                        'customerName' => $context['companyName'] ?? 'Customer',
                        'deliveryAddress' => $invoice['vehicleNo'] ?: '',
                        'vehicleNo' => $invoice['vehicleNo'],
                        'vehicleType' => $invoice['vehicleType'],
                        'totalAmount' => floatval($invoice['total']),
                        'items' => array_map(function ($item, $index) {
                            return [
                                'lineNo' => $index + 1,
                                'itemType' => $item['type'],
                                'itemCode' => $item['code'] ?? '',
                                'description' => $item['description'],
                                'quantity' => floatval($item['quantity']),
                                'unitPrice' => floatval($item['unitPrice']),
                                'amount' => floatval($item['amount'])
                            ];
                        }, $invoice['items'], array_keys($invoice['items']))
                    ];
                    $doPayloadJson = mysqli_real_escape_string($con, json_encode($doPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                    $cleanRef = mysqli_real_escape_string($con, $invoice['internalRef']);
                    $cleanDebtor = mysqli_real_escape_string($con, $debtorCode);
                    $cleanCustomer = mysqli_real_escape_string($con, $context['companyName'] ?? 'Customer');
                    $cleanVehicle = mysqli_real_escape_string($con, $invoice['vehicleNo'] ?? '');
                    
                    if (tableExists($con, 'autocount_parts_order_sync_queue')) {
                        mysqli_query($con, "INSERT INTO autocount_parts_order_sync_queue 
                            (order_id, doc_type, debtor_code, customer_name, delivery_address, payload_json, operation, status)
                            VALUES ('$cleanRef', 'DO', '$cleanDebtor', '$cleanCustomer', '$cleanVehicle', '$doPayloadJson', 'create', 'pending')
                            ON DUPLICATE KEY UPDATE payload_json = '$doPayloadJson', status = 'pending', attempt_count = 0, locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                    }
                } else {
                    if (tableExists($con, 'mewahtrans_invoice_sync_queue')) {
                        mysqli_query($con, "INSERT INTO mewahtrans_invoice_sync_queue (invoice_id, operation, status) VALUES ($invoiceId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                    }
                    if (tableExists($con, 'autocount_invoice_sync_queue')) {
                        mysqli_query($con, "INSERT INTO autocount_invoice_sync_queue (invoice_id, operation, status) VALUES ($invoiceId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                    }
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to queue invoice: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            sendResponse(true, $docType === 'DO' ? 'Delivery Order (DO) issued and queued for AutoCount sync.' : 'Invoice issued and queued for AutoCount sync.', workOrderInvoice($con, $jobId));
            break;

        case 'admin-retry-autocount-invoice-sync':
            $invoiceId = intval($inputData['invoiceId'] ?? 0);
            $row = mysqli_query($con, "SELECT id, work_order_id, status, sync_status FROM work_order_invoice WHERE id = $invoiceId LIMIT 1");
            $invoiceRow = $row ? mysqli_fetch_assoc($row) : null;
            if (!$invoiceRow || $invoiceRow['sync_status'] === 'synced' || $invoiceRow['status'] === 'void') {
                sendResponse(false, 'Only active, unsynced or failed invoices can be queued for sync.', null, 409);
            }
            mysqli_query($con, "UPDATE work_order_invoice SET status = 'pending_sync', sync_status = 'queued', sync_requested_at = NOW(), sync_error = NULL WHERE id = $invoiceId AND status != 'void'");
            if (tableExists($con, 'autocount_invoice_sync_queue')) {
                mysqli_query($con, "INSERT INTO autocount_invoice_sync_queue (invoice_id, operation, status) VALUES ($invoiceId, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
            }
            sendResponse(true, 'Invoice queued for AutoCount sync.', workOrderInvoice($con, intval($invoiceRow['work_order_id'])));
            break;

        case 'admin-batch-retry-autocount-invoice-sync':
            requireWorkOrderInvoiceSchema($con);
            $invoiceIds = $inputData['invoiceIds'] ?? [];
            if (!is_array($invoiceIds) || empty($invoiceIds)) {
                sendResponse(false, 'No invoice IDs provided for batch sync.', null, 400);
            }
            $cleanWorkOrderIds = [];
            $cleanPartsOrderIds = [];
            foreach ($invoiceIds as $rawId) {
                $strId = trim(strval($rawId));
                if (strpos($strId, 'po_') === 0) {
                    $cleanPartsOrderIds[] = substr($strId, 3);
                } elseif (strpos($strId, 'ai') === 0) {
                    // Historical AutoCount accounting invoice, already synced
                } elseif (is_numeric($strId)) {
                    $cleanWorkOrderIds[] = intval($strId);
                } else {
                    $cleanPartsOrderIds[] = $strId;
                }
            }
            if (empty($cleanWorkOrderIds) && empty($cleanPartsOrderIds)) {
                sendResponse(false, 'Valid invoice or parts order IDs required.', null, 400);
            }

            $queuedCount = 0;
            if (!empty($cleanWorkOrderIds)) {
                $idList = implode(',', $cleanWorkOrderIds);
                mysqli_begin_transaction($con);
                try {
                    mysqli_query($con, "UPDATE work_order_invoice SET status = 'pending_sync', sync_status = 'queued', sync_requested_at = NOW(), sync_error = NULL WHERE id IN ($idList) AND status != 'paid' AND status != 'void'");
                    if (tableExists($con, 'autocount_invoice_sync_queue')) {
                        foreach ($cleanWorkOrderIds as $id) {
                            mysqli_query($con, "INSERT INTO autocount_invoice_sync_queue (invoice_id, operation, status) VALUES ($id, 'create', 'pending') ON DUPLICATE KEY UPDATE status = 'pending', locked_at = NULL, completed_at = NULL, error_message = NULL, updated_at = NOW()");
                        }
                    }
                    mysqli_commit($con);
                    $queuedCount += count($cleanWorkOrderIds);
                } catch (Exception $e) {
                    mysqli_rollback($con);
                    sendResponse(false, 'Failed to batch queue work order invoices: ' . $e->getMessage(), null, 500);
                }
            }

            if (!empty($cleanPartsOrderIds)) {
                foreach ($cleanPartsOrderIds as $pId) {
                    if (enqueuePartsOrderAutoCountSync($con, $pId)) {
                        $queuedCount++;
                    }
                }
            }

            sendResponse(true, $queuedCount . ' document(s) queued for AutoCount sync.');
            break;

        case 'admin-record-work-order-invoice-payment':
            requireWorkOrderInvoiceSchema($con);
            $invoiceId = intval($inputData['invoiceId'] ?? 0);
            $amount = round(floatval($inputData['amount'] ?? 0), 2);
            $method = trim(strval($inputData['paymentMethod'] ?? ''));
            $result = mysqli_query($con, "SELECT * FROM work_order_invoice WHERE id = $invoiceId LIMIT 1");
            $row = $result ? mysqli_fetch_assoc($result) : null;
            if (!$row || !in_array($row['status'], ['issued', 'partially_paid'], true)) sendResponse(false, 'Only an issued unpaid invoice can receive a payment.', null, 409);
            if (($row['sync_status'] ?? 'not_queued') !== 'not_queued') sendResponse(false, 'Payment is maintained in AutoCount and must be returned through the sync program.', null, 409);
            $balance = floatval($row['balance']);
            if ($amount <= 0 || $amount > $balance) sendResponse(false, 'Payment must be greater than zero and cannot exceed the current balance.', null, 400);
            if ($method === '' || strlen($method) > 60) sendResponse(false, 'Payment method is required.', null, 400);
            $newPaid = round(floatval($row['paid_amount']) + $amount, 2);
            $newBalance = round(max(0, floatval($row['total']) - $newPaid), 2);
            $newStatus = $newBalance <= 0 ? 'paid' : 'partially_paid';
            $paidAtSql = $newStatus === 'paid' ? 'NOW()' : 'NULL';
            $methodSql = mysqli_real_escape_string($con, $method);
            if (!mysqli_query($con, "UPDATE work_order_invoice SET paid_amount = $newPaid, balance = $newBalance, status = '$newStatus', payment_method = '$methodSql', paid_at = $paidAtSql, updated_at = NOW() WHERE id = $invoiceId")) sendResponse(false, 'Unable to record payment: ' . mysqli_error($con), null, 500);
            $updatedResult = mysqli_query($con, "SELECT work_order_id FROM work_order_invoice WHERE id = $invoiceId LIMIT 1");
            $updatedRow = $updatedResult ? mysqli_fetch_assoc($updatedResult) : null;
            $updatedWorkOrderId = intval($updatedRow['work_order_id'] ?? 0);
            $updatedInvoice = workOrderInvoice($con, $updatedWorkOrderId);
            $context = invoiceWorkOrderContext($con, $updatedWorkOrderId);
            if ($context && $updatedInvoice) notifyVehicleCustomer($con, $context['vehicleId'], 'customer', $context['companyId'], $context['customerId'], 'Invoice payment recorded', $updatedInvoice['invoiceNo'] . ' balance is now RM ' . number_format($updatedInvoice['balance'], 2) . '.', 'invoice', 'invoice', 'wi' . $invoiceId, '/invoice/wi' . $invoiceId);
            sendResponse(true, 'Payment recorded.', $updatedInvoice);
            break;

        case 'admin-void-work-order-invoice':
            requireWorkOrderInvoiceSchema($con);
            $invoiceId = intval($inputData['invoiceId'] ?? 0);
            $result = mysqli_query($con, "SELECT * FROM work_order_invoice WHERE id = $invoiceId LIMIT 1");
            $row = $result ? mysqli_fetch_assoc($result) : null;
            if (!$row || $row['status'] === 'paid' || floatval($row['paid_amount']) > 0) sendResponse(false, 'Paid or partially paid invoices cannot be voided.', null, 409);
            if (($row['sync_status'] ?? '') === 'synced') sendResponse(false, 'Void this invoice in AutoCount; the sync program will return its updated status to MAW.', null, 409);
            if (($row['sync_status'] ?? '') === 'processing') sendResponse(false, 'Wait for the current AutoCount sync attempt to finish before voiding.', null, 409);
            mysqli_begin_transaction($con);
            try {
                if (!mysqli_query($con, "UPDATE work_order_invoice SET status = 'void', sync_status = 'not_queued', voided_at = NOW(), updated_at = NOW() WHERE id = $invoiceId")) throw new Exception(mysqli_error($con), 500);
                if (tableExists($con, 'autocount_invoice_sync_queue') && !mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'cancelled', locked_at = NULL, completed_at = NOW(), error_message = 'Cancelled in MAW before sync' WHERE invoice_id = $invoiceId AND status IN ('pending', 'failed')")) throw new Exception(mysqli_error($con), 500);

                // Restore deducted parts inventory if invoice was issued and was not a Back Order
                $isBackOrder = !empty($row['is_back_order']);
                $context = invoiceWorkOrderContext($con, intval($row['work_order_id']));
                if (!$isBackOrder && ($row['status'] !== 'draft' || !empty($row['issued_at']))) {
                    $partTable = tableExists($con, 'parts') ? 'parts' : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
                    if ($partTable) {
                        $skuCol = firstColumn($con, $partTable, ['sku', 'part_no', 'code', 'part_code', 'item_code']);
                        $stockCol = firstColumn($con, $partTable, ['stock', 'quantity', 'qty', 'stock_quantity']);
                        $inStockCol = firstColumn($con, $partTable, ['in_stock']);
                        if ($skuCol && $stockCol) {
                            $itemsRes = mysqli_query($con, "SELECT item_code, quantity FROM work_order_invoice_item WHERE invoice_id = $invoiceId AND item_type = 'part'");
                            while ($it = $itemsRes ? mysqli_fetch_assoc($itemsRes) : null) {
                                $sku = mysqli_real_escape_string($con, strtoupper(trim(strval($it['item_code'] ?? ''))));
                                $qty = floatval($it['quantity'] ?? 0);
                                if ($sku !== '' && $qty > 0) {
                                    $inStockSql = $inStockCol ? ", `$inStockCol` = 1" : '';
                                    mysqli_query($con, "UPDATE `$partTable` SET `$stockCol` = `$stockCol` + $qty $inStockSql WHERE UPPER(TRIM(`$skuCol`)) = '$sku'");

                                    $pRes = mysqli_query($con, "SELECT id, `$stockCol` AS stock_balance FROM `$partTable` WHERE UPPER(TRIM(`$skuCol`)) = '$sku' LIMIT 1");
                                    $pRow = $pRes ? mysqli_fetch_assoc($pRes) : null;
                                    if ($pRow && function_exists('recordPartStockTransaction')) {
                                        $partId = intval($pRow['id']);
                                        $newBal = floatval($pRow['stock_balance']);
                                        $voidDocNo = !empty($row['invoice_no']) ? $row['invoice_no'] : ($row['internal_ref'] ?? "INV-$invoiceId");
                                        $voidJobId = intval($row['work_order_id'] ?? 0);
                                        recordPartStockTransaction($con, [
                                            'part_id' => $partId,
                                            'transaction_type' => 'return',
                                            'doc_type' => 'INVOICE_VOID',
                                            'doc_id' => $invoiceId,
                                            'doc_no' => $voidDocNo,
                                            'party_code' => $row['debtor_code'] ?? null,
                                            'party_name' => $context['companyName'] ?? ($context['customerName'] ?? null),
                                            'quantity_change' => $qty,
                                            'balance_after' => $newBal,
                                            'notes' => "Restored into stock from voided invoice $voidDocNo" . ($voidJobId > 0 ? " (Job WO-$voidJobId)" : ""),
                                            'created_by' => $_SESSION['admin_id'] ?? null
                                        ]);
                                    }
                                }
                            }
                        }
                    }
                }
                mysqli_commit($con);
            } catch (Exception $e) {
                mysqli_rollback($con);
                sendResponse(false, 'Unable to void invoice: ' . $e->getMessage(), null, $e->getCode() ?: 500);
            }
            $context = invoiceWorkOrderContext($con, intval($row['work_order_id']));
            if ($context) notifyVehicleCustomer($con, $context['vehicleId'], 'customer', $context['companyId'], $context['customerId'], 'Invoice voided', strval($row['invoice_no']) . ' has been voided by the workshop.', 'invoice', 'invoice', 'wi' . $invoiceId, '/invoices');
            sendResponse(true, 'Invoice voided.', workOrderInvoice($con, intval($row['work_order_id'])));
            break;

        case 'admin-link-autocount-invoice':
            if (!tableExists($con, 'accounting_invoice')) sendResponse(false, 'Apply migration 023_autocount_ready_workflow before linking AutoCount invoices.', null, 409);
            $workOrderId = intval($inputData['workOrderId'] ?? 0);
            $context = invoiceWorkOrderContext($con, $workOrderId);
            if (!$context) sendResponse(false, 'Select an existing work order.', null, 400);
            $invoiceNoValue = strtoupper(trim(strval($inputData['invoiceNo'] ?? '')));
            $jobNoValue = strtoupper(trim(strval($inputData['autocountJobNo'] ?? '')));
            $vehicleNoRawValue = trim(strval($inputData['vehicleNoRaw'] ?? $context['vehicleNo']));
            $invoiceDate = trim(strval($inputData['invoiceDate'] ?? ''));
            $documentStatusValue = strtolower(trim(strval($inputData['documentStatus'] ?? 'approved')));
            $eInvoiceStatusValue = strtolower(trim(strval($inputData['eInvoiceStatus'] ?? '')));
            $eInvoiceUuidValue = trim(strval($inputData['eInvoiceUuid'] ?? ''));
            $total = round(floatval($inputData['total'] ?? 0), 2);
            $outstanding = round(floatval($inputData['outstanding'] ?? 0), 2);
            if ($invoiceNoValue === '' || strlen($invoiceNoValue) > 60) sendResponse(false, 'AutoCount Invoice No. is required.', null, 400);
            if ($jobNoValue !== '' && strlen($jobNoValue) > 60) sendResponse(false, 'AutoCount Job No. is too long.', null, 400);
            $parsedInvoiceDate = DateTime::createFromFormat('!Y-m-d', $invoiceDate);
            if (!$parsedInvoiceDate || $parsedInvoiceDate->format('Y-m-d') !== $invoiceDate) sendResponse(false, 'Enter a valid Invoice Date.', null, 400);
            if ($total < 0 || $outstanding < 0 || $outstanding > $total) sendResponse(false, 'Outstanding must be between zero and the Invoice Total.', null, 400);
            if (!in_array($documentStatusValue, ['approved', 'void', 'expired'], true)) sendResponse(false, 'Invalid AutoCount document status.', null, 400);
            if (!in_array($eInvoiceStatusValue, ['', 'valid', 'cancelled', 'invalid'], true)) sendResponse(false, 'Invalid e-Invoice status.', null, 400);
            if (strlen($vehicleNoRawValue) > 150 || strlen($eInvoiceUuidValue) > 120) sendResponse(false, 'Vehicle No. or e-Invoice UUID is too long.', null, 400);
            $invoiceNo = mysqli_real_escape_string($con, $invoiceNoValue);
            $existingResult = mysqli_query($con, "SELECT id, work_order_id FROM accounting_invoice WHERE source = 'autocount' AND external_invoice_no = '$invoiceNo' LIMIT 1");
            $existing = $existingResult ? mysqli_fetch_assoc($existingResult) : null;
            if ($existing && intval($existing['work_order_id']) !== $workOrderId) sendResponse(false, 'This AutoCount Invoice No. is already linked to another work order.', null, 409);
            $companyId = intval($context['companyId']);
            $vehicleId = intval($context['vehicleId']);
            $jobNo = mysqli_real_escape_string($con, $jobNoValue);
            $vehicleNoRaw = mysqli_real_escape_string($con, $vehicleNoRawValue);
            $documentStatus = mysqli_real_escape_string($con, $documentStatusValue);
            $eInvoiceStatusSql = $eInvoiceStatusValue === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $eInvoiceStatusValue) . "'";
            $eInvoiceUuidSql = $eInvoiceUuidValue === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $eInvoiceUuidValue) . "'";
            $jobNoSql = $jobNoValue === '' ? 'NULL' : "'$jobNo'";
            $adminId = intval($_SESSION['admin_id'] ?? 0);
            if ($jobNoValue !== '') {
                $currentJobNo = trim(strval(scalarQuery($con, "SELECT autocount_job_no FROM job WHERE id = $workOrderId", 'autocount_job_no', '')));
                if ($currentJobNo !== '' && strcasecmp($currentJobNo, $jobNoValue) !== 0) sendResponse(false, 'This work order already has a different AutoCount Job No.', null, 409);
            }
            if ($existing) {
                $invoiceId = intval($existing['id']);
                $query = "UPDATE accounting_invoice SET company_id = $companyId, vehicle_id = $vehicleId,
                    external_job_no = $jobNoSql, vehicle_no_raw = '$vehicleNoRaw', invoice_date = '$invoiceDate',
                    total = $total, outstanding = $outstanding, document_status = '$documentStatus',
                    e_invoice_status = $eInvoiceStatusSql, e_invoice_uuid = $eInvoiceUuidSql,
                    source_updated_at = NOW(), updated_at = NOW() WHERE id = $invoiceId";
            } else {
                $query = "INSERT INTO accounting_invoice
                    (source, external_invoice_no, company_id, work_order_id, vehicle_id, external_job_no,
                     vehicle_no_raw, invoice_date, total, outstanding, document_status, e_invoice_status,
                     e_invoice_uuid, summary_only, source_updated_at, created_by)
                    VALUES ('autocount', '$invoiceNo', $companyId, $workOrderId, $vehicleId, $jobNoSql,
                     '$vehicleNoRaw', '$invoiceDate', $total, $outstanding, '$documentStatus', $eInvoiceStatusSql,
                     $eInvoiceUuidSql, 1, NOW(), $adminId)";
            }
            if (!mysqli_query($con, $query)) sendResponse(false, 'Unable to link AutoCount invoice: ' . mysqli_error($con), null, 500);
            if ($jobNoValue !== '') {
                mysqli_query($con, "UPDATE job SET autocount_job_no = '$jobNo' WHERE id = $workOrderId");
            }
            sendResponse(true, $existing ? 'AutoCount invoice link updated.' : 'AutoCount invoice linked.', ['invoiceNo' => $invoiceNoValue]);
            break;

        case 'admin-invoices':
            if (tableExists($con, 'work_order_invoice') || tableExists($con, 'accounting_invoice')) {
                $invoices = [];
                if (tableExists($con, 'accounting_invoice')) {
                    $accVTable = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
                    $accVReg = firstColumn($con, $accVTable, ['registration_no', 'reg_no', 'plate_no', 'vehicle_no', 'vec_no']);
                    $accVUnit = firstColumn($con, $accVTable, ['unit_no', 'unit_number', 'vec_no', 'vehicle_no']);
                    $accVUnitSql = $accVUnit ? "NULLIF(TRIM(cv.`$accVUnit`), '')" : "NULL";
                    $accVRegSql = $accVReg ? "NULLIF(TRIM(cv.`$accVReg`), '')" : "NULL";
                    $accVSelect = "COALESCE($accVUnitSql, $accVRegSql, '-')";
                    $accountingResult = mysqli_query($con, "SELECT ai.*, comp.name AS company_name,
                        j.work_order_no, j.status AS job_status, j.checkin_at, j.inspected_at, j.approved_at,
                        j.completed_at, j.collected_at, $accVSelect AS linked_vehicle_no
                        FROM accounting_invoice ai
                        LEFT JOIN company comp ON comp.id = ai.company_id
                        LEFT JOIN job j ON j.id = ai.work_order_id
                        LEFT JOIN `$accVTable` cv ON cv.id = ai.vehicle_id
                        ORDER BY ai.invoice_date DESC, ai.id DESC
                        LIMIT 500");

                    $aiRows = [];
                    $aiIds = [];
                    $aiWoIds = [];
                    while ($accountingResult && $invoiceRow = mysqli_fetch_assoc($accountingResult)) {
                        $aiRows[] = $invoiceRow;
                        $aiIds[] = intval($invoiceRow['id']);
                        if (!empty($invoiceRow['work_order_id'])) {
                            $aiWoIds[] = intval($invoiceRow['work_order_id']);
                        }
                    }

                    $aiItemsMap = [];
                    if (!empty($aiIds) && tableExists($con, 'accounting_invoice_item')) {
                        $chunks = array_chunk($aiIds, 400);
                        foreach ($chunks as $chunk) {
                            $idList = implode(',', $chunk);
                            $itemsRes = mysqli_query($con, "SELECT * FROM accounting_invoice_item WHERE invoice_id IN ($idList) ORDER BY invoice_id, line_no, id");
                            while ($itemsRes && $item = mysqli_fetch_assoc($itemsRes)) {
                                $invId = intval($item['invoice_id']);
                                $aiItemsMap[$invId][] = [
                                    'id' => intval($item['id']),
                                    'lineNo' => intval($item['line_no']),
                                    'type' => $item['item_type'],
                                    'code' => $item['item_code'] ?? '',
                                    'description' => $item['description'],
                                    'quantity' => floatval($item['quantity']),
                                    'unitPrice' => floatval($item['unit_price']),
                                    'taxCode' => $item['tax_code'] ?? '',
                                    'taxRate' => floatval($item['tax_rate']),
                                    'taxAmount' => floatval($item['tax_amount']),
                                    'amount' => floatval($item['amount'])
                                ];
                            }
                        }
                    }

                    $aiWoMap = invoiceWorkOrderContextMap($con, $aiWoIds);

                    foreach ($aiRows as $invoiceRow) {
                        $invoiceId = intval($invoiceRow['id']);
                        $status = accountingInvoicePaymentStatus($invoiceRow);
                        $accountingItems = $aiItemsMap[$invoiceId] ?? [];
                        $itemSubtotal = 0.0;
                        $itemTaxAmount = 0.0;
                        foreach ($accountingItems as $accountingItem) {
                            $itemSubtotal += floatval($accountingItem['amount'] ?? 0);
                            $itemTaxAmount += floatval($accountingItem['taxAmount'] ?? 0);
                        }
                        $woId = intval($invoiceRow['work_order_id'] ?? 0);
                        $workOrder = ($woId > 0 && isset($aiWoMap[$woId])) ? $aiWoMap[$woId] : null;
                        if (!$workOrder) {
                            $workOrder = [
                                'id' => 0,
                                'workOrderNo' => $invoiceRow['external_job_no'] ?: 'Historical AutoCount',
                                'canonicalStatus' => 'collected',
                                'companyId' => intval($invoiceRow['company_id']),
                                'companyName' => $invoiceRow['company_name'] ?? '-',
                                'vehicleId' => intval($invoiceRow['vehicle_id'] ?? 0),
                                'vehicleNo' => $invoiceRow['vehicle_no_raw'] ?: ($invoiceRow['linked_vehicle_no'] ?? '-'),
                                'brand' => '', 'model' => '', 'equipmentType' => '', 'serviceType' => 'Workshop Service', 'serviceCentre' => 'Mewah AutoWorks'
                            ];
                        }
                        $totalValue = floatval($invoiceRow['total']);
                        $balanceValue = floatval($invoiceRow['outstanding']);
                        $invoices[] = [
                            'id' => 'ai' . $invoiceId,
                            'source' => 'autocount',
                            'summaryOnly' => boolval($invoiceRow['summary_only']),
                            'workOrderId' => $woId,
                            'invoiceNo' => $invoiceRow['external_invoice_no'],
                            'autocountInvoiceNo' => $invoiceRow['external_invoice_no'],
                            'debtorCode' => $workOrder['debtorCode'] ?? '',
                            'status' => $status,
                            'storedStatus' => $status,
                            'documentStatus' => $invoiceRow['document_status'],
                            'eInvoiceStatus' => $invoiceRow['e_invoice_status'] ?? '',
                            'eInvoiceUuid' => $invoiceRow['e_invoice_uuid'] ?? '',
                            'autocountJobNo' => $invoiceRow['external_job_no'] ?? '',
                            'vehicleNoRaw' => $invoiceRow['vehicle_no_raw'] ?? '',
                            'invoiceDate' => $invoiceRow['invoice_date'],
                            'subtotal' => count($accountingItems) > 0 ? $itemSubtotal : $totalValue,
                            'discount' => 0,
                            'taxRate' => 0,
                            'taxAmount' => $itemTaxAmount,
                            'total' => $totalValue,
                            'paidAmount' => max(0, $totalValue - $balanceValue),
                            'balance' => $balanceValue,
                            'paymentMethod' => '', 'notes' => '', 'paymentInstructions' => '',
                            'createdAt' => $invoiceRow['created_at'], 'updatedAt' => $invoiceRow['updated_at'],
                            'issuedAt' => $invoiceRow['invoice_date'], 'paidAt' => null, 'voidedAt' => null,
                            'creditTermDays' => 30,
                            'isBackOrder' => false,
                            'orderType' => 'work_order',
                            'vehicleNo' => $invoiceRow['vehicle_no_raw'] ?: ($invoiceRow['linked_vehicle_no'] ?? '-'),
                            'items' => $accountingItems,
                            'workOrder' => $workOrder
                        ];
                    }
                }

                if (tableExists($con, 'work_order_invoice')) {
                    $woiResult = mysqli_query($con, 'SELECT * FROM work_order_invoice ORDER BY invoice_date DESC, id DESC LIMIT 500');
                    $woiRows = [];
                    $woiIds = [];
                    $woiWoIds = [];
                    while ($woiResult && $row = mysqli_fetch_assoc($woiResult)) {
                        $woiRows[] = $row;
                        $woiIds[] = intval($row['id']);
                        $woiWoIds[] = intval($row['work_order_id']);
                    }

                    $woiItemsMap = [];
                    if (!empty($woiIds) && tableExists($con, 'work_order_invoice_item')) {
                        $chunks = array_chunk($woiIds, 400);
                        foreach ($chunks as $chunk) {
                            $idList = implode(',', $chunk);
                            $itemResult = mysqli_query($con, "SELECT * FROM work_order_invoice_item WHERE invoice_id IN ($idList) ORDER BY invoice_id, sort_order, id");
                            while ($itemResult && $item = mysqli_fetch_assoc($itemResult)) {
                                $invId = intval($item['invoice_id']);
                                $woiItemsMap[$invId][] = [
                                    'id' => intval($item['id']),
                                    'type' => $item['item_type'],
                                    'serviceTypeId' => $item['service_type_id'] !== null ? intval($item['service_type_id']) : null,
                                    'code' => $item['item_code'] ?? '',
                                    'description' => $item['description'],
                                    'quantity' => floatval($item['quantity']),
                                    'unitPrice' => floatval($item['unit_price']),
                                    'taxCode' => $item['tax_code'] ?? '',
                                    'taxRate' => floatval($item['tax_rate'] ?? 0),
                                    'taxAmount' => floatval($item['tax_amount'] ?? 0),
                                    'amount' => floatval($item['amount'])
                                ];
                            }
                        }
                    }

                    $woiContextMap = invoiceWorkOrderContextMap($con, $woiWoIds);

                    foreach ($woiRows as $row) {
                        $invId = intval($row['id']);
                        $woId = intval($row['work_order_id']);
                        $context = $woiContextMap[$woId] ?? invoiceWorkOrderContext($con, $woId);
                        if (!$context) continue;

                        $invItems = $woiItemsMap[$invId] ?? [];
                        $invPayload = [
                            'id' => $invId,
                            'workOrderId' => $woId,
                            'docType' => strtoupper(trim(strval($row['doc_type'] ?? 'INVOICE'))),
                            'orderType' => 'work_order',
                            'isBackOrder' => boolval($row['is_back_order'] ?? false),
                            'quotationId' => $row['quotation_id'] !== null ? intval($row['quotation_id']) : null,
                            'invoiceNo' => $row['invoice_no'] ?: ($row['internal_ref'] ?? ''),
                            'internalRef' => $row['internal_ref'] ?? '',
                            'autocountInvoiceNo' => $row['invoice_no'] ?? '',
                            'autocountDoNo' => $row['autocount_do_no'] ?? '',
                            'autocountJobNo' => $row['autocount_job_no'] ?? '',
                            'debtorCode' => $row['debtor_code'] ?? '',
                            'vehicleType' => $row['vehicle_type'] ?? '',
                            'vehicleNo' => $row['vehicle_no'] ?? '',
                            'creditTermDays' => intval($row['credit_term_days'] ?? 30),
                            'currency' => $row['currency'] ?? 'MYR',
                            'syncStatus' => $row['sync_status'] ?? 'not_queued',
                            'syncRequestedAt' => $row['sync_requested_at'] ?? null,
                            'syncedAt' => $row['synced_at'] ?? null,
                            'syncError' => $row['sync_error'] ?? '',
                            'mewahtransSyncStatus' => $row['mewahtrans_sync_status'] ?? 'not_queued',
                            'mewahtransRefNo' => $row['mewahtrans_ref_no'] ?? '',
                            'mewahtransSyncedAt' => $row['mewahtrans_synced_at'] ?? null,
                            'mewahtransError' => $row['mewahtrans_error'] ?? '',
                            'eInvoiceStatus' => $row['e_invoice_status'] ?? '',
                            'eInvoiceUuid' => $row['e_invoice_uuid'] ?? '',
                            'status' => invoiceDisplayStatus($row),
                            'storedStatus' => $row['status'],
                            'invoiceDate' => $row['invoice_date'],
                            'dueDate' => $row['due_date'],
                            'subtotal' => floatval($row['subtotal']),
                            'discount' => floatval($row['discount']),
                            'taxRate' => floatval($row['tax_rate']),
                            'taxAmount' => floatval($row['tax_amount']),
                            'total' => floatval($row['total']),
                            'paidAmount' => floatval($row['paid_amount']),
                            'balance' => floatval($row['balance']),
                            'paymentMethod' => $row['payment_method'] ?? '',
                            'notes' => $row['notes'] ?? '',
                            'paymentInstructions' => $row['payment_instructions'] ?? '',
                            'createdAt' => $row['created_at'],
                            'updatedAt' => $row['updated_at'],
                            'issuedAt' => $row['issued_at'],
                            'paidAt' => $row['paid_at'],
                            'voidedAt' => $row['voided_at'],
                            'source' => 'maw',
                            'summaryOnly' => false,
                            'items' => $invItems,
                            'workOrder' => $context
                        ];
                        $invoices[] = $invPayload;
                    }
                }

                // Also include Parts Orders in Invoices list
                $partsOrdersList = adminPartsOrders($con);
                foreach ($partsOrdersList as $po) {
                    $status = strtolower($po['status'] ?? 'pending');
                    $invStatus = 'issued';
                    if ($status === 'delivered' || $status === 'completed') $invStatus = 'paid';
                    elseif ($status === 'pending') $invStatus = 'pending_sync';

                    $poItems = [];
                    foreach (($po['items'] ?? []) as $it) {
                        $poItems[] = [
                            'type' => 'part',
                            'code' => $it['code'] ?? '',
                            'description' => $it['name'] ?? 'Part',
                            'quantity' => floatval($it['quantity'] ?? 1),
                            'unitPrice' => floatval($it['price'] ?? 0),
                            'amount' => floatval(($it['quantity'] ?? 1) * ($it['price'] ?? 0)),
                            'taxCode' => '@0%',
                            'taxRate' => 0,
                        ];
                    }

                    $invoices[] = [
                        'id' => 'po_' . $po['id'],
                        'source' => 'parts_order',
                        'orderType' => 'parts_order',
                        'summaryOnly' => false,
                        'workOrderId' => 0,
                        'invoiceNo' => $po['autocountDoNo'] ?: $po['id'],
                        'status' => $invStatus,
                        'storedStatus' => $invStatus,
                        'syncStatus' => $po['autocountSyncStatus'] ?: ($status === 'pending' ? 'queued' : 'synced'),
                        'autocountJobNo' => $po['id'],
                        'autocountDoNo' => $po['autocountDoNo'] ?? '',
                        'invoiceDate' => $po['orderDate'] ?? date('Y-m-d'),
                        'subtotal' => floatval($po['total']),
                        'discount' => 0,
                        'taxRate' => 0,
                        'taxAmount' => 0,
                        'total' => floatval($po['total']),
                        'paidAmount' => $invStatus === 'paid' ? floatval($po['total']) : 0,
                        'balance' => $invStatus === 'paid' ? 0 : floatval($po['total']),
                        'paymentMethod' => 'Bank Transfer',
                        'notes' => '',
                        'paymentInstructions' => '',
                        'createdAt' => $po['orderDate'] ?? date('Y-m-d H:i:s'),
                        'updatedAt' => $po['orderDate'] ?? date('Y-m-d H:i:s'),
                        'issuedAt' => $po['orderDate'] ?? date('Y-m-d'),
                        'items' => $poItems,
                        'partsOrder' => $po,
                        'workOrder' => [
                            'id' => 0,
                            'workOrderNo' => $po['id'],
                            'canonicalStatus' => $po['status'],
                            'companyName' => $po['customer'],
                            'vehicleNo' => 'Parts Order',
                            'serviceType' => 'Parts Fulfilment',
                            'debtorCode' => $po['debtorCode'] ?? '',
                        ]
                    ];
                }

                sendResponse(true, 'Admin invoices retrieved.', $invoices);
            }
            $legacyInvoices = legacyInvoices($con);
            if ($legacyInvoices !== null) {
                sendResponse(true, 'Admin invoices retrieved', $legacyInvoices);
            }

            $invoices = [];
            $query = "SELECT b.*, u.name AS customer_name, v.reg_no, v.brand, v.model
                      FROM bookings b
                      JOIN users u ON b.user_id = u.id
                      LEFT JOIN vehicles v ON b.vehicle_id = v.id
                      WHERE b.invoice_number IS NOT NULL
                      ORDER BY b.service_date DESC";
            $result = mysqli_query($con, $query);
            while ($result && $row = mysqli_fetch_assoc($result)) {
                $items = fetchBookingItems($con, intval($row['id']));
                $services = [];
                $parts = [];
                foreach ($items as $item) {
                    if ($item['category'] === 'service') {
                        $services[] = ['name' => $item['name'], 'price' => $item['total']];
                    } else {
                        $parts[] = ['name' => $item['name'], 'quantity' => $item['quantity'], 'price' => $item['unitPrice']];
                    }
                }

                $invoices[] = [
                    'id' => $row['invoice_number'],
                    'invoiceNo' => $row['invoice_number'],
                    'bookingId' => $row['booking_number'],
                    'customer' => $row['customer_name'],
                    'vehicle' => trim(($row['reg_no'] ?? '-') . ' - ' . ($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')),
                    'date' => substr($row['service_date'], 0, 10),
                    'services' => $services,
                    'parts' => $parts,
                    'labor' => floatval($row['labor_cost']),
                    'subtotal' => floatval($row['subtotal']),
                    'tax' => floatval($row['tax']),
                    'total' => floatval($row['total_price']),
                    'status' => $row['payment_status'] === 'paid' ? 'Paid' : 'Unpaid',
                    'paymentMethod' => $row['payment_method'] ?: '-'
                ];
            }
            sendResponse(true, 'Admin invoices retrieved', $invoices);
            break;

        case 'admin-update-invoice-status':
            $invoiceNo = $inputData['invoiceNo'] ?? '';
            $status = $inputData['status'] ?? 'Paid';
            $paymentMethod = $inputData['paymentMethod'] ?? 'Cash';
            if (!$invoiceNo) {
                sendResponse(false, 'Invoice Number is required', null, 400);
            }
            if (updateAdminInvoiceStatus($con, $invoiceNo, $status, $paymentMethod)) {
                $invoiceNoSql = mysqli_real_escape_string($con, $invoiceNo);
                $invoiceRoute = '/invoice/' . rawurlencode($invoiceNo);
                if (tableExists($con, 'customer_invoice')) {
                    $numberColumn = firstColumn($con, 'customer_invoice', ['invoice_no', 'invoice_number']);
                    $invoiceResult = $numberColumn
                        ? mysqli_query(
                            $con,
                            "SELECT * FROM customer_invoice
                             WHERE `$numberColumn` = '$invoiceNoSql' OR id = " . intval($invoiceNo) . "
                             LIMIT 1"
                        )
                        : null;
                    $invoiceRow = $invoiceResult ? mysqli_fetch_assoc($invoiceResult) : null;
                    if ($invoiceRow) {
                        $contactId = intval(rowValue($invoiceRow, ['customer_id', 'user_id'], 0));
                        $companyId = intval(rowValue($invoiceRow, ['company_id'], 0));
                        if ($companyId <= 0 && $contactId > 0 && tableExists($con, 'customer')) {
                            $contactResult = mysqli_query($con, "SELECT company_id FROM customer WHERE id = $contactId LIMIT 1");
                            $contact = $contactResult ? mysqli_fetch_assoc($contactResult) : null;
                            $companyId = intval($contact['company_id'] ?? 0);
                        }
                        createCustomerRecordNotification(
                            $con,
                            'customer',
                            $companyId,
                            $contactId,
                            'Invoice updated',
                            "Invoice $invoiceNo is now $status.",
                            'system',
                            'invoice',
                            $invoiceNo,
                            $invoiceRoute
                        );
                    }
                } elseif (tableExists($con, 'bookings') && tableExists($con, 'users')) {
                    $invoiceResult = mysqli_query(
                        $con,
                        "SELECT b.user_id, u.company_id
                         FROM bookings b
                         JOIN users u ON u.id = b.user_id
                         WHERE b.invoice_number = '$invoiceNoSql'
                         LIMIT 1"
                    );
                    $invoiceRow = $invoiceResult ? mysqli_fetch_assoc($invoiceResult) : null;
                    if ($invoiceRow) {
                        createCustomerRecordNotification(
                            $con,
                            'users',
                            intval($invoiceRow['company_id'] ?? 0),
                            intval($invoiceRow['user_id']),
                            'Invoice updated',
                            "Invoice $invoiceNo is now $status.",
                            'system',
                            'invoice',
                            $invoiceNo,
                            $invoiceRoute
                        );
                    }
                }
                sendResponse(true, 'Invoice status updated successfully', ['invoiceNo' => $invoiceNo, 'status' => $status]);
            }
            sendResponse(false, 'Failed to update invoice status: ' . mysqli_error($con), null, 500);
            break;

    case 'sync-pull-autocount-invoice':
        requireAutoCountSyncToken();
        if (!tableExists($con, 'autocount_invoice_sync_queue')) sendResponse(false, 'Apply migration 024_maw_invoice_autocount_outbox.sql.', null, 409);
        mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'pending', locked_at = NULL WHERE status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
        $queueResult = mysqli_query($con, "SELECT * FROM autocount_invoice_sync_queue WHERE status = 'pending' ORDER BY created_at, id LIMIT 1");
        $queue = $queueResult ? mysqli_fetch_assoc($queueResult) : null;
        if (!$queue) sendResponse(true, 'No queued AutoCount invoices.', null);
        $queueId = intval($queue['id']);
        $invoiceId = intval($queue['invoice_id']);
        if (!mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'processing', attempt_count = attempt_count + 1, locked_at = NOW() WHERE id = $queueId AND status = 'pending'")) sendResponse(false, 'Unable to lock sync queue item.', null, 500);
        mysqli_query($con, "UPDATE work_order_invoice SET sync_status = 'processing', sync_error = NULL WHERE id = $invoiceId");
        $payload = autoCountInvoiceSyncPayload($con, $invoiceId);
        if (!$payload) sendResponse(false, 'Queued invoice is unavailable.', null, 409);
        sendResponse(true, 'AutoCount invoice ready.', ['queueId' => $queueId, 'operation' => $queue['operation'], 'invoice' => $payload]);
        break;

    case 'sync-ack-autocount-invoice':
        requireAutoCountSyncToken();
        $queueId = intval($inputData['queueId'] ?? 0);
        $success = filter_var($inputData['success'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $queueResult = mysqli_query($con, "SELECT * FROM autocount_invoice_sync_queue WHERE id = $queueId LIMIT 1");
        $queue = $queueResult ? mysqli_fetch_assoc($queueResult) : null;
        if (!$queue) sendResponse(false, 'Sync queue item not found.', null, 404);
        $invoiceId = intval($queue['invoice_id']);
        $responseJson = mysqli_real_escape_string($con, json_encode($inputData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if (!$success) {
            $message = substr(trim(strval($inputData['error'] ?? 'AutoCount rejected the invoice.')), 0, 5000);
            $errorSql = mysqli_real_escape_string($con, $message);
            mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'failed', error_message = '$errorSql', response_payload = '$responseJson', locked_at = NULL WHERE id = $queueId");
            mysqli_query($con, "UPDATE work_order_invoice SET sync_status = 'failed', sync_error = '$errorSql' WHERE id = $invoiceId");
            sendResponse(true, 'Sync failure recorded.', ['invoiceId' => $invoiceId]);
        }
        $invoiceNoValue = strtoupper(trim(strval($inputData['autocountInvoiceNo'] ?? '')));
        if ($invoiceNoValue === '' || strlen($invoiceNoValue) > 60) sendResponse(false, 'AutoCount Invoice No. is required for a successful acknowledgement.', null, 400);
        $invoiceNo = mysqli_real_escape_string($con, $invoiceNoValue);
        $eStatusValue = substr(trim(strval($inputData['eInvoiceStatus'] ?? '')), 0, 24);
        $eUuidValue = substr(trim(strval($inputData['eInvoiceUuid'] ?? '')), 0, 120);
        $eStatus = mysqli_real_escape_string($con, $eStatusValue);
        $eUuid = mysqli_real_escape_string($con, $eUuidValue);
        mysqli_begin_transaction($con);
        try {
            if (!mysqli_query($con, "UPDATE work_order_invoice SET invoice_no = '$invoiceNo', status = 'issued', sync_status = 'synced', synced_at = NOW(), issued_at = COALESCE(issued_at, NOW()), sync_error = NULL, e_invoice_status = '$eStatus', e_invoice_uuid = '$eUuid' WHERE id = $invoiceId")) throw new Exception(mysqli_error($con), 500);
            if (!mysqli_query($con, "UPDATE autocount_invoice_sync_queue SET status = 'succeeded', completed_at = NOW(), locked_at = NULL, error_message = NULL, response_payload = '$responseJson' WHERE id = $queueId")) throw new Exception(mysqli_error($con), 500);
            mysqli_commit($con);
        } catch (Exception $e) {
            mysqli_rollback($con);
            sendResponse(false, 'Unable to record AutoCount result: ' . $e->getMessage(), null, $e->getCode() ?: 500);
        }
        $workOrderId = intval(scalarQuery($con, "SELECT work_order_id FROM work_order_invoice WHERE id = $invoiceId", 'work_order_id', 0));
        $context = invoiceWorkOrderContext($con, $workOrderId);
        if ($context) notifyVehicleCustomer($con, $context['vehicleId'], 'customer', $context['companyId'], $context['customerId'], 'Invoice issued', $invoiceNoValue . ' is ready to view.', 'invoice', 'invoice', 'wi' . $invoiceId, '/invoice/wi' . $invoiceId);
        sendResponse(true, 'AutoCount sync completed.', workOrderInvoice($con, $workOrderId));
        break;

    case 'sync-update-autocount-invoice':
        requireAutoCountSyncToken();
        $invoiceNoValue = strtoupper(trim(strval($inputData['autocountInvoiceNo'] ?? '')));
        $internalRefValue = strtoupper(trim(strval($inputData['internalRef'] ?? '')));
        if ($invoiceNoValue === '' && $internalRefValue === '') sendResponse(false, 'AutoCount Invoice No. or MAW internal reference is required.', null, 400);
        $lookup = $invoiceNoValue !== ''
            ? "invoice_no = '" . mysqli_real_escape_string($con, $invoiceNoValue) . "'"
            : "internal_ref = '" . mysqli_real_escape_string($con, $internalRefValue) . "'";
        $result = mysqli_query($con, "SELECT * FROM work_order_invoice WHERE $lookup LIMIT 1");
        $row = $result ? mysqli_fetch_assoc($result) : null;
        if (!$row) sendResponse(false, 'MAW invoice not found.', null, 404);
        if (($row['sync_status'] ?? '') !== 'synced') sendResponse(false, 'Invoice has not completed AutoCount sync.', null, 409);
        $invoiceId = intval($row['id']);
        $total = round(floatval($row['total']), 2);
        $outstanding = round(floatval($inputData['outstanding'] ?? $row['balance']), 2);
        if ($outstanding < 0 || $outstanding > $total) sendResponse(false, 'Outstanding must be between zero and the invoice total.', null, 400);
        $documentStatus = strtolower(trim(strval($inputData['documentStatus'] ?? 'approved')));
        if (!in_array($documentStatus, ['approved', 'void'], true)) sendResponse(false, 'Document status must be approved or void.', null, 400);
        $paidAmount = round($total - $outstanding, 2);
        $status = $documentStatus === 'void' ? 'void' : ($outstanding <= 0 ? 'paid' : ($outstanding < $total ? 'partially_paid' : 'issued'));
        if ($status === 'void') { $outstanding = 0; $paidAmount = 0; }
        $paidAtSql = $status === 'paid' ? 'COALESCE(paid_at, NOW())' : 'NULL';
        $voidedAtSql = $status === 'void' ? 'COALESCE(voided_at, NOW())' : 'NULL';
        $eStatus = mysqli_real_escape_string($con, substr(trim(strval($inputData['eInvoiceStatus'] ?? $row['e_invoice_status'] ?? '')), 0, 24));
        $eUuid = mysqli_real_escape_string($con, substr(trim(strval($inputData['eInvoiceUuid'] ?? $row['e_invoice_uuid'] ?? '')), 0, 120));
        if (!mysqli_query($con, "UPDATE work_order_invoice SET status = '$status', paid_amount = $paidAmount, balance = $outstanding, paid_at = $paidAtSql, voided_at = $voidedAtSql, e_invoice_status = '$eStatus', e_invoice_uuid = '$eUuid', updated_at = NOW() WHERE id = $invoiceId")) sendResponse(false, 'Unable to update AutoCount invoice status: ' . mysqli_error($con), null, 500);
        sendResponse(true, 'AutoCount invoice status updated.', workOrderInvoice($con, intval($row['work_order_id'])));
        break;


        default:
            sendResponse(false, "Unsupported invoice action: $mode", null, 400);
            break;
    }
}
