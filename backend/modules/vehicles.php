<?php
/**
 * Vehicles & Fleet Asset Domain Module
 *
 * Handles vehicle inventory, customer vehicles, fleet associations,
 * compliance document management (Grant, Insurance, Road Tax, Puspakom),
 * document storage and secure streaming, and vehicle lookup.
 */

function normalizeOperationalVehicleStatus($status): string {
    $valid = ['Active', 'Inactive', 'Under Maintenance', 'Out of Service', 'Disposed'];
    if (in_array($status, $valid, true)) {
        return $status;
    }
    foreach ($valid as $v) {
        if (strcasecmp(strval($status), $v) === 0) {
            return $v;
        }
    }
    return 'Active';
}

function legacyVehicles($con) {
    if (!tableExists($con, 'customer_vehicle')) {
        return null;
    }

    $vehicles = [];
    $vehicleHasCompany = columnExists($con, 'customer_vehicle', 'company_id');
    $customerHasCompany = columnExists($con, 'customer', 'company_id');
    $contactColumn = firstColumn($con, 'customer_vehicle', ['customer_id', 'user_id', 'owner_id']);
    $driverColumn = firstColumn($con, 'customer_vehicle', ['driver_profile_id', 'assigned_driver_id', 'driver_id']);
    $contactSelect = $contactColumn
        ? "v.`$contactColumn` AS linked_contact_id"
        : '0 AS linked_contact_id';
    $contactJoin = $contactColumn
        ? "LEFT JOIN customer cust ON v.`$contactColumn` = cust.id"
        : 'LEFT JOIN customer cust ON 1 = 0';
    $driverSelect = $driverColumn
        ? "v.`$driverColumn` AS linked_driver_id"
        : '0 AS linked_driver_id';
    $driverJoin = $driverColumn
        ? ($driverColumn === 'driver_profile_id'
            ? "LEFT JOIN company_driver assigned_driver ON v.`$driverColumn` = assigned_driver.id"
            : "LEFT JOIN customer assigned_driver ON v.`$driverColumn` = assigned_driver.id")
        : 'LEFT JOIN customer assigned_driver ON 1 = 0';
    $companySelect = $vehicleHasCompany
        ? 'v.company_id AS linked_company_id'
        : ($customerHasCompany ? 'cust.company_id AS linked_company_id' : '0 AS linked_company_id');
    $companyJoin = $vehicleHasCompany
        ? 'LEFT JOIN company comp ON v.company_id = comp.id'
        : ($customerHasCompany ? 'LEFT JOIN company comp ON cust.company_id = comp.id' : 'LEFT JOIN company comp ON 1 = 0');
        $result = mysqli_query(
        $con,
        "SELECT v.*, $contactSelect, $driverSelect, $companySelect, comp.name AS company_name,
                cust.name AS contact_name, assigned_driver.name AS driver_name
         FROM customer_vehicle v
         $contactJoin
         $driverJoin
         $companyJoin
         ORDER BY v.id DESC"
    );
    if (!$result) {
        sendResponse(false, 'Unable to load vehicles: ' . mysqli_error($con), null, 500);
    }
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $equipmentProfile = normalizeContainerFleetProfile(
            rowValue($row, ['equipment', 'type', 'vehicle_type'], '-'),
            rowValue($row, ['container_length'], '')
        );
        $verificationStatus = strtolower(rowValue(
            $row,
            ['verification_status'],
            rowValue($row, ['status'], '') === 'Pending Verification' ? 'pending' : 'approved'
        ));
        $conditionStatus = rowValue($row, ['status'], 'Good');
        if ($conditionStatus === 'Pending Verification') $conditionStatus = 'Good';
        $companyName = rowValue($row, ['company_name'], '-');
        $ownerName = $companyName !== '-' ? $companyName : rowValue($row, ['customer_name', 'owner'], '-');
        $linkedContactId = intval(rowValue($row, ['customer_id', 'user_id', 'owner_id', 'linked_contact_id'], 0));
        $assignedDriverId = intval(rowValue($row, ['driver_profile_id', 'assigned_driver_id', 'linked_driver_id'], 0));
        if ($ownerName === '-' && $linkedContactId > 0 && tableExists($con, 'customer')) {
            $ownerName = rowValue($row, ['contact_name'], '-');
        }

            $regNo = rowValue($row, ['reg_no', 'registration_no', 'plate_no', 'vehicle_plate', 'car_plate'], '-');
            $unitNo = rowValue($row, ['unit_no', 'vec_no', 'vehicle_no', 'unit_number', 'truck_no', 'asset_no'], '');
            $vecNo = $unitNo !== '' ? $unitNo : ($regNo !== '-' ? $regNo : 'V-' . rowValue($row, ['id'], ''));
            $effectiveMileage = intval(rowValue($row, ['mileage', 'current_mileage'], 0));

            $lastServiceDate = rowValue($row, ['last_service_date'], '');
            $lastServiceMileage = intval(rowValue($row, ['last_service_mileage'], 0));

            $vehicles[] = [
                'id' => intval(rowValue($row, ['id'], 0)),
                'vecNo' => $vecNo,
                'unitNo' => $unitNo,
                'regNo' => $regNo,
            'equipment' => $equipmentProfile['equipment'],
            'brand' => rowValue($row, ['brand', 'make'], '-'),
            'model' => rowValue($row, ['model'], '-'),
            'year' => intval(rowValue($row, ['year'], 0)),
            'mileage' => $effectiveMileage . ' km',
            'owner' => $ownerName,
            'ownerId' => intval(rowValue($row, ['company_id', 'linked_company_id'], 0)),
            'companyId' => intval(rowValue($row, ['company_id', 'linked_company_id'], 0)),
            'companyName' => $companyName,
            'driverId' => $assignedDriverId,
            'driverName' => rowValue($row, ['driver_name'], '-'),
            'chassisNo' => rowValue($row, ['chassis_no'], ''),
            'engineNo' => rowValue($row, ['engine_no'], ''),
            'containerLength' => $equipmentProfile['containerLength'],
            'axleConfiguration' => rowValue($row, ['axle_configuration'], ''),
            'insurance' => rowValue($row, ['insurance_expiry', 'insurance', 'insurance_date'], '-'),
            'roadTax' => rowValue($row, ['road_tax_expiry', 'roadtax_expiry', 'road_tax'], '-'),
            'puspakom' => rowValue($row, ['puspakom_expiry', 'puspakom'], '-'),
            'lastServiceDate' => $lastServiceDate,
            'lastServiceMileage' => $lastServiceMileage,
            'nextServiceDate' => rowValue($row, ['next_service_date', 'service_due_date'], ''),
            'nextServiceMileage' => intval(rowValue($row, ['next_service_mileage', 'service_due_mileage'], 0)),
            'status' => $verificationStatus === 'rejected' ? 'Inactive' : $conditionStatus,
            'vehicleStatus' => $verificationStatus === 'rejected' ? 'Inactive' : normalizeOperationalVehicleStatus(rowValue($row, ['vehicle_status', 'operational_status'], 'Active')),
            'verificationStatus' => $verificationStatus,
            'rejectionReason' => rowValue($row, ['rejection_reason'], ''),
            'reviewedBy' => intval(rowValue($row, ['reviewed_by'], 0)),
            'reviewedAt' => rowValue($row, ['reviewed_at'], ''),
            'createdSource' => rowValue($row, ['created_source'], 'admin_panel')
        ];
    }

    $documentMap = vehicleDocumentMap($con, array_column($vehicles, 'id'));
    $workOrderMap = vehicleActiveWorkOrderMap($con, array_column($vehicles, 'id'));
    foreach ($vehicles as &$vehicle) {
        $vehicleId = intval($vehicle['id']);
        $vehicle['documents'] = $documentMap[$vehicleId] ?? [];
        $activeWo = $workOrderMap[$vehicleId] ?? null;
        $vehicle['activeWorkOrder'] = $activeWo;
        if ($activeWo !== null) {
            $vehicle['vehicleStatus'] = 'Under Maintenance';
        }
    }
    unset($vehicle);

    return $vehicles;
}

function requireVehicleDocumentSchema($con) {
    if (!tableExists($con, 'vehicle_document')) {
        sendResponse(false, 'Vehicle document storage is not configured. Apply migration 036_vehicle_documents.sql.', null, 409);
    }
}

function vehicleDocumentTypeLabel($type) {
    $labels = [
        'insurance' => 'Insurance',
        'road_tax' => 'Road Tax',
        'puspakom' => 'PUSPAKOM',
    ];
    return $labels[$type] ?? 'Vehicle Document';
}

function vehicleDocumentMap($con, $vehicleIds) {
    $map = [];
    $ids = array_values(array_unique(array_filter(array_map('intval', $vehicleIds), function ($id) { return $id > 0; })));
    if (!$ids || !tableExists($con, 'vehicle_document')) return $map;
    $chunks = array_chunk($ids, 500);
    foreach ($chunks as $chunk) {
        $result = mysqli_query(
            $con,
            'SELECT * FROM vehicle_document WHERE vehicle_id IN (' . implode(',', $chunk) . ') ORDER BY created_at DESC, id DESC'
        );
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $vehicleId = intval($row['vehicle_id']);
            $map[$vehicleId][] = [
                'id' => intval($row['id']),
                'vehicleId' => 'v' . $vehicleId,
                'type' => $row['document_type'],
                'expiryDate' => $row['expiry_date'],
                'originalName' => $row['original_name'],
                'mimeType' => $row['mime_type'],
                'byteSize' => intval($row['byte_size']),
                'status' => $row['status'],
                'reviewReason' => $row['review_reason'] ?? '',
                'reviewedBy' => intval($row['reviewed_by'] ?? 0) ?: null,
                'reviewedAt' => $row['reviewed_at'] ?? null,
                'createdAt' => $row['created_at'] ?? null,
            ];
        }
    }
    return $map;
}

function vehicleActiveWorkOrderMap($con, $vehicleIds = null) {
    $map = [];
    if (!tableExists($con, 'job')) return $map;

    $statusSql = function_exists('getCanonicalStatusSql')
        ? getCanonicalStatusSql($con, 'j')
        : "CASE 
            WHEN j.collected_at IS NOT NULL AND j.collected_at > '1970-01-01 00:00:00' THEN 'collected'
            WHEN j.completed_at IS NOT NULL AND j.completed_at > '1970-01-01 00:00:00' THEN 'ready_for_collection'
            WHEN j.status = 6 THEN 'under_repair'
            WHEN j.status = 5 THEN 'parts_ready'
            WHEN j.status = 4 THEN 'approved'
            WHEN j.status = 3 THEN 'quotation_issued'
            WHEN j.status = 2 THEN 'checked_in'
            WHEN j.status = 1 THEN 'scheduled'
            ELSE 'unknown'
        END";

    $result = mysqli_query(
        $con,
        "SELECT j.id, j.work_order_no, j.vehicle_id, j.status, j.checkin_at,
                ($statusSql) AS canonical_status
         FROM job j
         WHERE (j.collected_at IS NULL OR j.collected_at <= '1970-01-01 00:00:00')
           AND j.status <> 0
           AND ($statusSql) NOT IN ('collected', 'cancelled', 'scheduled', 'unknown')
         ORDER BY j.id DESC"
    );

    $labelMap = [
        'checked_in' => 'Check In',
        'inspected' => 'Inspection',
        'quotation_issued' => 'Quotation',
        'approved' => 'Approved',
        'pending_parts' => 'Pending Parts',
        'parts_ready' => 'Parts Ready',
        'under_repair' => 'In Service',
        'ready_for_collection' => 'Ready for Collection'
    ];

    while ($result && $row = mysqli_fetch_assoc($result)) {
        $vehicleId = intval($row['vehicle_id']);
        if (!isset($map[$vehicleId])) {
            $cStatus = strval($row['canonical_status'] ?? '');
            $map[$vehicleId] = [
                'id' => intval($row['id']),
                'workOrderNo' => strval($row['work_order_no'] ?? ''),
                'canonicalStatus' => $cStatus,
                'statusLabel' => $labelMap[$cStatus] ?? 'In Service',
                'checkinAt' => $row['checkin_at'] ?? null,
            ];
        }
    }
    return $map;
}

function storeVehicleDocumentUpload($con, $vehicleId, $documentType, $expiryDate, $upload, $customerId, $customerSource = 'customer') {
    requireVehicleDocumentSchema($con);
    $validTypes = ['insurance', 'road_tax', 'puspakom'];
    if (!in_array($documentType, $validTypes, true)) {
        throw new RuntimeException('Select a valid vehicle document type.', 422);
    }
    if (!validOptionalDate($expiryDate) || trim(strval($expiryDate)) === '') {
        throw new RuntimeException('A valid document expiry date is required.', 422);
    }
    if (trim(strval($expiryDate)) < date('Y-m-d')) {
        throw new RuntimeException('The renewed document expiry date cannot be in the past.', 422);
    }
    $vehicleId = intval($vehicleId);
    $vehicleTable = unifiedVehicleTable($con);
    if ($vehicleTable && $vehicleId > 0) {
        $vehicleResult = mysqli_query($con, "SELECT * FROM `$vehicleTable` WHERE id = $vehicleId LIMIT 1");
        $vehicle = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
        $expiryFields = [
            'insurance' => ['insurance_expiry', 'insurance_date', 'insurance_expiry_date', 'insurance'],
            'road_tax' => ['road_tax_expiry', 'roadtax_expiry', 'road_tax_date', 'road_tax'],
            'puspakom' => ['puspakom_expiry', 'puspakom_date', 'puspakom'],
        ];
        $currentExpiry = $vehicle ? trim(strval(rowValue($vehicle, $expiryFields[$documentType], ''))) : '';
        if (validOptionalDate($currentExpiry) && $currentExpiry !== '' && trim(strval($expiryDate)) < $currentExpiry) {
            throw new RuntimeException('The renewed document expiry date cannot be earlier than the current expiry date.', 422);
        }
    }
    if (!$upload || !isset($upload['error']) || intval($upload['error']) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Choose a document file to upload.', 422);
    }
    $maxBytes = 10 * 1024 * 1024;
    $byteSize = intval($upload['size'] ?? 0);
    if ($byteSize <= 0 || $byteSize > $maxBytes) {
        throw new RuntimeException('Document must be smaller than 10 MB.', 422);
    }

    $mime = '';
    if (class_exists('finfo')) {
        try {
            $finfo = new finfo(FILEINFO_MIME_TYPE);
            $mime = strval($finfo->file($upload['tmp_name']));
        } catch (Throwable $error) {
            $mime = '';
        }
    }
    if (!$mime && function_exists('mime_content_type')) $mime = strval(@mime_content_type($upload['tmp_name']));
    $extensions = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/heif' => 'heif',
    ];
    $originalExtension = strtolower(pathinfo(strval($upload['name'] ?? ''), PATHINFO_EXTENSION));
    $extensionMime = [
        'pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png', 'webp' => 'image/webp', 'heic' => 'image/heic', 'heif' => 'image/heif',
    ];
    if (!isset($extensions[$mime]) && in_array($mime, ['', 'application/octet-stream'], true) && isset($extensionMime[$originalExtension])) {
        $mime = $extensionMime[$originalExtension];
    }
    if (!isset($extensions[$mime])) {
        throw new RuntimeException('Upload a PDF, JPEG, PNG, WebP, HEIC, or HEIF document.', 422);
    }

    $datePath = date('Y/m');
    $storageRoot = getVehicleDocumentStorageRoot(true);
    $destinationDir = $storageRoot . '/' . $datePath;
    if (!is_dir($destinationDir)) @mkdir($destinationDir, 0755, true);
    if (!is_dir($destinationDir)) throw new RuntimeException('Unable to prepare vehicle document storage.', 500);
    $fileName = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    $relativePath = $datePath . '/' . $fileName;
    $destination = $storageRoot . '/' . $relativePath;
    if (!@move_uploaded_file($upload['tmp_name'], $destination) && !@copy($upload['tmp_name'], $destination)) {
        throw new RuntimeException('Unable to save the uploaded document.', 500);
    }
    @chmod($destination, 0644);

    $typeSql = mysqli_real_escape_string($con, $documentType);
    $expirySql = mysqli_real_escape_string($con, trim(strval($expiryDate)));
    $pathSql = mysqli_real_escape_string($con, $relativePath);
    $nameSql = mysqli_real_escape_string($con, basename(strval($upload['name'] ?? 'document')));
    $mimeSql = mysqli_real_escape_string($con, $mime);
    $customerId = intval($customerId);
    $customerSourceSql = mysqli_real_escape_string($con, strval($customerSource));
    if (!mysqli_query($con, "UPDATE vehicle_document SET status = 'superseded' WHERE vehicle_id = $vehicleId AND document_type = '$typeSql' AND status = 'pending'")) {
        @unlink($destination);
        throw new RuntimeException('Unable to replace the previous pending document.', 500);
    }
    if (!mysqli_query(
        $con,
        "INSERT INTO vehicle_document (vehicle_id, document_type, expiry_date, storage_path, original_name, mime_type, byte_size, uploaded_by_customer_id, uploaded_by_source, status) VALUES ($vehicleId, '$typeSql', '$expirySql', '$pathSql', '$nameSql', '$mimeSql', $byteSize, " . ($customerId > 0 ? $customerId : 'NULL') . ", '$customerSourceSql', 'pending')"
    )) {
        @unlink($destination);
        throw new RuntimeException('Unable to record the uploaded document: ' . mysqli_error($con), 500);
    }
    return intval(mysqli_insert_id($con));
}

function getVehicleDocumentStorageRoot($createIfMissing = false) {
    $candidateRoots = [
        dirname(__DIR__) . '/storage/vehicle-documents',
        __DIR__ . '/storage/vehicle-documents',
        dirname(dirname(__DIR__)) . '/storage/vehicle-documents',
    ];

    foreach ($candidateRoots as $root) {
        if (is_dir($root)) return $root;
    }

    if ($createIfMissing) {
        $primary = dirname(__DIR__) . '/storage/vehicle-documents';
        if (!is_dir($primary)) @mkdir($primary, 0755, true);
        if (is_dir($primary)) return $primary;

        $fallback = __DIR__ . '/storage/vehicle-documents';
        if (!is_dir($fallback)) @mkdir($fallback, 0755, true);
        if (is_dir($fallback)) return $fallback;
    }

    return dirname(__DIR__) . '/storage/vehicle-documents';
}

function resolveVehicleDocumentFile($storagePath) {
    $cleanPath = str_replace(['..', '\\'], ['', '/'], ltrim(strval($storagePath), '/'));
    if ($cleanPath === '') return false;

    $candidateRoots = [
        dirname(__DIR__) . '/storage/vehicle-documents',
        __DIR__ . '/storage/vehicle-documents',
        dirname(dirname(__DIR__)) . '/storage/vehicle-documents',
        dirname(__DIR__) . '/uploads/vehicle-documents',
    ];

    foreach ($candidateRoots as $root) {
        $realRoot = realpath($root);
        if ($realRoot && is_dir($realRoot)) {
            $realFile = realpath($realRoot . '/' . $cleanPath);
            if ($realFile && is_file($realFile) && strpos($realFile, $realRoot) === 0) {
                return $realFile;
            }
        }
    }
    return false;
}

function streamVehicleDocument($con, $documentId) {
    requireVehicleDocumentSchema($con);
    $documentId = intval($documentId);
    $result = mysqli_query(
        $con,
        "SELECT d.*, v.company_id FROM vehicle_document d JOIN customer_vehicle v ON v.id = d.vehicle_id WHERE d.id = $documentId LIMIT 1"
    );
    $document = $result ? mysqli_fetch_assoc($result) : null;
    if (!$document) sendResponse(false, 'Vehicle document not found.', null, 404);

    $allowed = !empty($_SESSION['admin_id']) && !empty($_SESSION['admin_role']);
    if (!$allowed && !empty($_SESSION['customer_user_id'])) {
        $auth = [
            'userId' => intval($_SESSION['customer_user_id'] ?? 0),
            'companyId' => intval($_SESSION['customer_company_id'] ?? 0),
            'source' => $_SESSION['customer_source'] ?? '',
            'isSuperadmin' => !empty($_SESSION['customer_is_superadmin']),
        ];
        if (!empty($auth['isSuperadmin']) || intval($document['company_id']) === $auth['companyId']) {
            $scope = customerVehicleAccessScope($con, $auth);
            $allowed = !$scope['scoped'] || in_array(intval($document['vehicle_id']), $scope['vehicleIds'], true);
        }
    }
    if (!$allowed) sendResponse(false, 'You are not authorised to view this vehicle document.', null, 403);

    $file = resolveVehicleDocumentFile($document['storage_path']);
    if (!$file || !is_file($file)) {
        sendResponse(false, 'Vehicle document file is unavailable.', null, 404);
    }
    $downloadName = preg_replace('/[^A-Za-z0-9._-]+/', '-', strval($document['original_name'] ?: ('vehicle-document-' . $documentId)));
    header_remove('Content-Type');
    header('Content-Type: ' . ($document['mime_type'] ?: 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="' . $downloadName . '"');
    header('Cache-Control: private, max-age=300');
    readfile($file);
    exit;
}

function vehicleBookingComplianceError($con, $vehicleId, $vehicleRow) {
    $today = date('Y-m-d');
    $fields = [
        'insurance' => rowValue($vehicleRow, ['insurance_expiry'], ''),
        'road_tax' => rowValue($vehicleRow, ['road_tax_expiry', 'roadtax_expiry'], ''),
    ];
    foreach ($fields as $type => $expiry) {
        if ($expiry === '' || $expiry === null || $expiry === '0000-00-00' || $expiry < $today) {
            return vehicleDocumentTypeLabel($type) . ' is missing or expired. Upload a renewed document before booking.';
        }
    }
    if (tableExists($con, 'vehicle_document')) {
        $vehicleId = intval($vehicleId);
        if (countRows($con, 'vehicle_document', "vehicle_id = $vehicleId AND status = 'pending'") > 0) {
            return 'A vehicle document is awaiting admin approval. Booking will be available after approval.';
        }
    }
    return '';
}

function customerVehicles($con, $auth) {
    $table = tableExists($con, 'customer_vehicle') ? 'customer_vehicle' : 'vehicles';
    if (!tableExists($con, $table) || !columnExists($con, $table, 'company_id')) return [];
    $companyId = intval($auth['companyId']);
    $scope = customerVehicleAccessScope($con, $auth);
    $activeJobVehicleSql = "";
    if (tableExists($con, 'job') && columnExists($con, 'job', 'company_id')) {
        $activeJobVehicleSql = " OR id IN (SELECT vehicle_id FROM job WHERE company_id = $companyId)";
    }
    $where = !empty($auth['isSuperadmin']) ? '' : " WHERE (company_id = $companyId$activeJobVehicleSql)";
    if ($scope['scoped']) {
        $where .= empty($scope['vehicleIds']) ? ' AND 1 = 0' : ' AND id IN (' . implode(',', array_map('intval', $scope['vehicleIds'])) . ')';
    }
    $result = mysqli_query($con, "SELECT * FROM `$table`$where ORDER BY id");
    $vehicles = [];
    while ($result && $row = mysqli_fetch_assoc($result)) {
        $equipmentProfile = normalizeContainerFleetProfile(
            rowValue($row, ['equipment', 'vehicle_type', 'type'], 'Vehicle'),
            rowValue($row, ['container_length'], '')
        );
        $verificationStatus = strtolower(rowValue(
            $row,
            ['verification_status'],
            rowValue($row, ['status'], '') === 'Pending Verification' ? 'pending' : 'approved'
        ));
        $conditionStatus = rowValue($row, ['status'], 'Good');
        if ($conditionStatus === 'Pending Verification') $conditionStatus = 'Good';
        $vehicles[] = [
            'id' => 'v' . intval($row['id']),
            'companyId' => 'company-' . intval($row['company_id'] ?? $companyId),
            'vecNo' => rowValue($row, ['vec_no', 'vehicle_no', 'unit_no'], '-'),
            'regNo' => rowValue($row, ['reg_no', 'registration_no', 'plate_no'], '-'),
            'equipment' => $equipmentProfile['equipment'],
            'brand' => rowValue($row, ['brand', 'make'], '-'),
            'model' => rowValue($row, ['model'], '-'),
            'mileage' => intval(rowValue($row, ['mileage', 'current_mileage'], 0)),
            'year' => intval(rowValue($row, ['year'], 0)),
            'chassisNo' => rowValue($row, ['chassis_no'], ''),
            'engineNo' => rowValue($row, ['engine_no'], ''),
            'containerLength' => $equipmentProfile['containerLength'],
            'axleConfiguration' => rowValue($row, ['axle_configuration'], ''),
            'insuranceExpiry' => rowValue($row, ['insurance_expiry'], null),
            'roadTaxExpiry' => rowValue($row, ['road_tax_expiry', 'roadtax_expiry'], null),
            'puspakomExpiry' => rowValue($row, ['puspakom_expiry'], null),
            'lastServiceDate' => rowValue($row, ['last_service_date'], null),
            'lastServiceMileage' => intval(rowValue($row, ['last_service_mileage'], 0)) ?: null,
            'nextServiceDate' => rowValue($row, ['next_service_date', 'service_due_date'], null),
            'nextServiceMileage' => intval(rowValue($row, ['next_service_mileage', 'service_due_mileage'], 0)) ?: null,
            'status' => $verificationStatus === 'rejected' ? 'Inactive' : $conditionStatus,
            'vehicleStatus' => $verificationStatus === 'rejected' ? 'Inactive' : normalizeOperationalVehicleStatus(rowValue($row, ['vehicle_status', 'operational_status'], 'Active')),
            'verificationStatus' => $verificationStatus,
            'rejectionReason' => rowValue($row, ['rejection_reason'], ''),
            'reviewedAt' => rowValue($row, ['reviewed_at'], null),
            'createdSource' => rowValue($row, ['created_source'], 'admin_panel')
        ];
    }
    $documentMap = vehicleDocumentMap($con, array_map(function ($vehicle) {
        return intval(preg_replace('/\D+/', '', strval($vehicle['id'])));
    }, $vehicles));
    $workOrderMap = vehicleActiveWorkOrderMap($con, array_map(function ($vehicle) {
        return intval(preg_replace('/\D+/', '', strval($vehicle['id'])));
    }, $vehicles));
    foreach ($vehicles as &$vehicle) {
        $numericVehicleId = intval(preg_replace('/\D+/', '', strval($vehicle['id'])));
        $vehicle['documents'] = $documentMap[$numericVehicleId] ?? [];
        $activeWo = $workOrderMap[$numericVehicleId] ?? null;
        $vehicle['activeWorkOrder'] = $activeWo;
        if ($activeWo !== null) {
            $vehicle['vehicleStatus'] = 'Under Maintenance';
        }
    }
    unset($vehicle);
    return $vehicles;
}

function pendingAdminVehicleCount($con) {
    if (tableExists($con, 'customer_vehicle')) {
        $hasVerification = columnExists($con, 'customer_vehicle', 'verification_status');
        $hasStatus = columnExists($con, 'customer_vehicle', 'status');
        $conditions = [];
        if ($hasVerification) {
            $conditions[] = "LOWER(TRIM(CAST(verification_status AS CHAR))) = 'pending'";
        }
        if ($hasStatus) {
            $conditions[] = "LOWER(TRIM(CAST(status AS CHAR))) = 'pending verification'";
        }
        if (empty($conditions)) return 0;
        $whereSql = implode(' OR ', $conditions);
        return intval(scalarQuery(
            $con,
            "SELECT COUNT(*) AS total FROM customer_vehicle WHERE $whereSql",
            'total',
            0
        ));
    }

    if (tableExists($con, 'vehicles')) {
        $hasVerification = columnExists($con, 'vehicles', 'verification_status');
        $hasStatus = columnExists($con, 'vehicles', 'status');
        $conditions = [];
        if ($hasVerification) {
            $conditions[] = "LOWER(TRIM(CAST(verification_status AS CHAR))) = 'pending'";
        }
        if ($hasStatus) {
            $conditions[] = "LOWER(TRIM(CAST(status AS CHAR))) = 'pending verification'";
        }
        if (empty($conditions)) return 0;
        $whereSql = implode(' OR ', $conditions);
        return intval(scalarQuery(
            $con,
            "SELECT COUNT(*) AS total FROM vehicles WHERE $whereSql",
            'total',
            0
        ));
    }

    return 0;
}

/**
 * Handle vehicle and vehicle document routes.
 */
function handleVehicleRoute($con, $mode, $inputData) {
    switch ($mode) {
    case 'vehicle-document-file':
        streamVehicleDocument($con, intval($_GET['id'] ?? 0));
        break;

    case 'customer-upload-vehicle-document':
        $auth = requireCustomerSession();
        if (!empty($auth['isSuperadmin'])) {
            sendResponse(false, 'Please manage vehicle documents from Admin Panel when signed in as superadmin.', null, 409);
        }
        $vehicleId = intval(preg_replace('/\D+/', '', strval($inputData['vehicleId'] ?? '')));
        $documentType = strtolower(trim(strval($inputData['documentType'] ?? '')));
        $expiryDate = trim(strval($inputData['expiryDate'] ?? ''));
        $table = unifiedVehicleTable($con);
        $companyId = intval($auth['companyId']);
        if (!$table || $vehicleId <= 0) sendResponse(false, 'A valid vehicle is required.', null, 422);
        $scope = customerVehicleAccessScope($con, $auth);
        $where = "id = $vehicleId AND company_id = $companyId";
        if ($scope['scoped']) $where .= customerScopedVehicleSql($scope, 'id');
        $vehicleResult = mysqli_query($con, "SELECT * FROM `$table` WHERE $where LIMIT 1");
        $vehicle = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
        if (!$vehicle) sendResponse(false, 'Vehicle not found or not accessible.', null, 404);
        if (strtolower($vehicle['verification_status'] ?? '') === 'rejected') {
            sendResponse(false, 'Cannot upload documents for a rejected vehicle.', null, 422);
        }
        try {
            mysqli_begin_transaction($con);
            $documentId = storeVehicleDocumentUpload(
                $con,
                $vehicleId,
                $documentType,
                $expiryDate,
                $_FILES['document'] ?? null,
                intval($auth['userId']),
                'customer_app'
            );
            mysqli_commit($con);
        } catch (Throwable $error) {
            mysqli_rollback($con);
            sendResponse(false, $error->getMessage(), null, intval($error->getCode()) ?: 500);
        }
        $regNo = rowValue($vehicle, ['reg_no', 'registration_no', 'plate_no'], 'Vehicle');
        createCustomerRecordNotification(
            $con,
            $auth['source'],
            $companyId,
            intval($auth['userId']),
            'Document uploaded',
            "Uploaded $documentType document for $regNo.",
            'system',
            'vehicle',
            'v' . $vehicleId,
            '/vehicle/v' . $vehicleId
        );
        if (function_exists('createAdminSystemNotification')) {
            createAdminSystemNotification(
                $con,
                'Vehicle document uploaded',
                "$regNo " . vehicleDocumentTypeLabel($documentType) . ' document is awaiting admin review.',
                'system',
                'vehicle',
                'v' . $vehicleId,
                '/vehicle/v' . $vehicleId
            );
        }
        $map = vehicleDocumentMap($con, [$vehicleId]);
        $document = null;
        foreach (($map[$vehicleId] ?? []) as $item) {
            if (intval($item['id']) === $documentId) $document = $item;
        }
        sendResponse(true, 'Vehicle document submitted for review.', $document, 201);
        break;

    case 'customer-create-vehicle':
        $auth = requireCustomerSession();
        if (!empty($auth['isSuperadmin'])) {
            sendResponse(false, 'Please add vehicles from Admin Panel when signed in as superadmin.', null, 409);
        }
        $table = unifiedVehicleTable($con);
        if (!$table) sendResponse(false, 'Vehicle storage is not configured.', null, 409);

        $companyId = intval($auth['companyId']);
        $contactId = unifiedVehicleContact($con, $table, $companyId, intval($auth['userId']));
        $driverId = 0;
        $regNo = strtoupper(trim($inputData['regNo'] ?? ''));
        $equipment = trim($inputData['equipment'] ?? '');
        $brand = normalizeVehicleBrand($inputData['brand'] ?? '');
        $model = normalizeVehicleText($inputData['model'] ?? '');
        $containerLength = trim($inputData['containerLength'] ?? '');
        $axleConfiguration = trim($inputData['axleConfiguration'] ?? '');
        $equipmentProfile = normalizeContainerFleetProfile($equipment, $containerLength);
        $equipment = $equipmentProfile['equipment'];
        $containerLength = $equipmentProfile['containerLength'];
        $yearInput = trim(strval($inputData['year'] ?? ''));
        $mileageInput = trim(strval($inputData['mileage'] ?? ''));
        $year = $yearInput === '' ? 0 : intval($yearInput);
        $mileage = $mileageInput === '' ? 0 : intval($mileageInput);
        $vehicleStatus = trim($inputData['vehicleStatus'] ?? 'Active');
        $validVehicleStatuses = ['Active', 'Inactive', 'Under Maintenance', 'Out of Service', 'Disposed'];
        if ($companyId <= 0 || $contactId <= 0) {
            sendResponse(false, 'Your company vehicle access is not configured.', null, 409);
        }
        $isPrimeMover = $equipment === 'Prime Mover';
        $isContainerChassis = $equipment === 'Container Chassis / Skeletal Trailer';
        if ($regNo === '' || $equipment === '') {
            sendResponse(false, 'Equipment type and registration number are required.', null, 422);
        }
        if ($isPrimeMover && ($brand === '' || $model === '')) {
            sendResponse(false, 'Prime Mover brand and model are required.', null, 422);
        }
        if ($isContainerChassis && !in_array($containerLength, ['20 ft', '40 ft', '45 ft', '20/40 ft Extendable', 'Other'], true)) {
            sendResponse(false, 'Please select a valid container length.', null, 422);
        }
        if ($isContainerChassis && !in_array($axleConfiguration, ['2 Axle', '3 Axle', 'Other'], true)) {
            sendResponse(false, 'Please select a valid axle configuration.', null, 422);
        }
        if ($yearInput !== '' && (!preg_match('/^\d{4}$/', $yearInput) || $year < 1900 || $year > intval(date('Y')) + 1)) {
            sendResponse(false, 'Please enter a valid vehicle year.', null, 422);
        }
        if ($mileageInput !== '' && !preg_match('/^\d+$/', $mileageInput)) {
            sendResponse(false, 'Current mileage must be a non-negative whole number.', null, 422);
        }
        if (!in_array($vehicleStatus, $validVehicleStatuses, true)) {
            sendResponse(false, 'Please select a valid vehicle status.', null, 422);
        }
        foreach (['insuranceExpiry', 'roadTaxExpiry', 'puspakomExpiry'] as $dateField) {
            if (!validOptionalDate($inputData[$dateField] ?? '')) {
                sendResponse(false, 'Please enter valid dates.', null, 422);
            }
        }
        $dupInfo = unifiedVehicleDuplicateInfo($con, $table, $regNo, '', $companyId);
        $targetVehicleId = 0;
        if ($dupInfo) {
            if (!empty($dupInfo['isRejected']) && !empty($dupInfo['isSameCompany'])) {
                // Customer is re-submitting their previously rejected vehicle
                $targetVehicleId = intval($dupInfo['id']);
            } else if ($dupInfo['type'] === 'registration') {
                sendResponse(false, 'This registration / plate number is already registered.', null, 409);
            } else if ($dupInfo['type'] === 'vehicle') {
                sendResponse(false, 'This vehicle number is already used by your company.', null, 409);
            }
        }
        $data = [
            'contactId' => $contactId,
            'driverId' => $driverId,
            'ownerName' => customerCompanyName($con, $companyId),
            'companyId' => $companyId,
            'vecNo' => null,
            'regNo' => $regNo,
            'equipment' => $equipment,
            'brand' => $brand,
            'model' => $model,
            'year' => $year,
            'mileage' => max(0, $mileage),
            'chassisNo' => strtoupper(trim($inputData['chassisNo'] ?? '')),
            'engineNo' => strtoupper(trim($inputData['engineNo'] ?? '')),
            'containerLength' => $containerLength,
            'axleConfiguration' => $axleConfiguration,
            'insurance' => $inputData['insuranceExpiry'] ?? '',
            'roadTax' => $inputData['roadTaxExpiry'] ?? '',
            'puspakom' => $inputData['puspakomExpiry'] ?? '',
            'status' => 'Pending Verification',
            'vehicleStatus' => $vehicleStatus,
            'verificationStatus' => 'pending',
            'rejectionReason' => '',
            'reviewedBy' => 0,
            'reviewedAt' => '',
            'createdSource' => 'customer_app'
        ];
        if ($targetVehicleId > 0) {
            if (!saveUnifiedVehicle($con, $table, $data, $targetVehicleId)) {
                $dbError = mysqli_error($con);
                sendResponse(false, 'Unable to update vehicle: ' . ($dbError ?: 'Database update failed.'), null, 500);
            }
            $newVehicleId = $targetVehicleId;
        } else {
            if (!saveUnifiedVehicle($con, $table, $data)) {
                $dbError = mysqli_error($con);
                error_log('Customer vehicle insert failed: ' . $dbError);
                sendResponse(false, 'Unable to save vehicle: ' . ($dbError ?: 'Database insert failed.'), null, 500);
            }
            $newVehicleId = mysqli_insert_id($con);
        }
        $isResubmit = ($targetVehicleId > 0);
        $notifTitle = $isResubmit ? 'Vehicle re-submitted' : 'Vehicle submitted';
        $notifBody = $isResubmit
            ? "$regNo was re-submitted for verification."
            : "$regNo was submitted and is awaiting verification.";
        createCustomerRecordNotification(
            $con,
            $auth['source'],
            $companyId,
            intval($auth['userId']),
            $notifTitle,
            $notifBody,
            'system',
            'vehicle',
            'v' . $newVehicleId,
            '/vehicle/v' . $newVehicleId
        );
        if (function_exists('createAdminSystemNotification')) {
            createAdminSystemNotification(
                $con,
                $notifTitle,
                "$regNo was " . ($isResubmit ? 're-submitted' : 'submitted') . " by " . customerCompanyName($con, $companyId) . ' and is awaiting verification.',
                'system',
                'vehicle',
                'v' . $newVehicleId,
                '/equipment?vehicleId=' . $newVehicleId
            );
        }
        sendResponse(true, $isResubmit ? 'Vehicle re-submitted for verification.' : 'Vehicle submitted for verification.', [
            'id' => 'v' . $newVehicleId,
            'status' => 'Pending Verification'
        ], 201);
        break;

    case 'admin-pending-vehicles-alert':
        $pendingCount = pendingAdminVehicleCount($con);
        sendResponse(true, 'Pending vehicle count retrieved', [
            'hasPendingVehicles' => $pendingCount > 0,
            'count' => $pendingCount
        ]);
        break;

    case 'admin-vehicles':
        $legacyVehicles = legacyVehicles($con);
        if ($legacyVehicles !== null) {
            sendResponse(true, 'Admin vehicles retrieved', $legacyVehicles);
        }

        $vehicles = [];
        $vehicleHasCompany = columnExists($con, 'vehicles', 'company_id');
        $userHasCompany = columnExists($con, 'users', 'company_id');
        $companySelect = $vehicleHasCompany
            ? 'v.company_id AS linked_company_id'
            : ($userHasCompany ? 'u.company_id AS linked_company_id' : '0 AS linked_company_id');
        $companyJoin = $vehicleHasCompany
            ? 'LEFT JOIN company comp ON v.company_id = comp.id'
            : ($userHasCompany ? 'LEFT JOIN company comp ON u.company_id = comp.id' : 'LEFT JOIN company comp ON 1 = 0');
        $driverColumn = firstColumn($con, 'vehicles', ['driver_profile_id', 'assigned_driver_id', 'driver_id']);
        $driverSelect = $driverColumn
            ? "v.`$driverColumn` AS linked_driver_id, assigned_driver.name AS driver_name"
            : "0 AS linked_driver_id, '-' AS driver_name";
        $driverJoin = $driverColumn
            ? ($driverColumn === 'driver_profile_id'
                ? "LEFT JOIN company_driver assigned_driver ON v.`$driverColumn` = assigned_driver.id"
                : "LEFT JOIN users assigned_driver ON v.`$driverColumn` = assigned_driver.id")
            : '';
        $orderColumn = columnExists($con, 'vehicles', 'created_at') ? 'v.created_at DESC' : 'v.id DESC';
        $query = "SELECT v.*, u.name AS owner, $driverSelect, $companySelect, comp.name AS company_name
                  FROM vehicles v
                  JOIN users u ON v.user_id = u.id
                  $driverJoin
                  $companyJoin
                  ORDER BY $orderColumn";
        $result = mysqli_query($con, $query);
        if (!$result) {
            sendResponse(false, 'Unable to load vehicles: ' . mysqli_error($con), null, 500);
        }
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $equipmentProfile = normalizeContainerFleetProfile(
                $row['equipment'] ?? '',
                $row['container_length'] ?? ''
            );
            $status = 'Good';
            $soon = strtotime('+30 days');
            if (($row['insurance_expiry'] && strtotime($row['insurance_expiry']) <= $soon)
                || ($row['road_tax_expiry'] && strtotime($row['road_tax_expiry']) <= $soon)
                || ($row['puspakom_expiry'] && strtotime($row['puspakom_expiry']) <= $soon)) {
                $status = 'Need Repair';
            }

            $vehicles[] = [
                'id' => intval($row['id']),
                'vecNo' => $row['vec_no'],
                'unitNo' => rowValue($row, ['unit_no', 'vec_no', 'vehicle_no', 'unit_number', 'truck_no'], $row['vec_no'] ?? ''),
                'regNo' => $row['reg_no'],
                'equipment' => $equipmentProfile['equipment'],
                'brand' => $row['brand'],
                'model' => $row['model'],
                'year' => intval($row['year']),
                'mileage' => number_format(intval($row['mileage'])) . ' km',
                'owner' => $row['owner'],
                'ownerId' => intval($row['user_id']),
                'companyId' => intval(rowValue($row, ['company_id', 'linked_company_id'], 0)),
                'companyName' => rowValue($row, ['company_name'], '-'),
                'driverId' => intval($row['linked_driver_id'] ?? 0),
                'driverName' => rowValue($row, ['driver_name'], '-'),
                'chassisNo' => $row['chassis_no'] ?? '',
                'engineNo' => $row['engine_no'] ?? '',
                'containerLength' => $equipmentProfile['containerLength'],
                'axleConfiguration' => $row['axle_configuration'] ?? '',
                'insurance' => $row['insurance_expiry'],
                'roadTax' => $row['road_tax_expiry'],
                'puspakom' => $row['puspakom_expiry'],
                'lastServiceDate' => $row['last_service_date'] ?? '',
                'lastServiceMileage' => intval($row['last_service_mileage'] ?? 0),
                'nextServiceDate' => $row['next_service_date'] ?? ($row['service_due_date'] ?? ''),
                'nextServiceMileage' => intval($row['next_service_mileage'] ?? ($row['service_due_mileage'] ?? 0)),
                'status' => strtolower($row['verification_status'] ?? '') === 'rejected' ? 'Inactive' : $status,
                'vehicleStatus' => strtolower($row['verification_status'] ?? '') === 'rejected' ? 'Inactive' : normalizeOperationalVehicleStatus(rowValue($row, ['vehicle_status', 'operational_status'], 'Active')),
                'verificationStatus' => strtolower($row['verification_status'] ?? 'approved'),
                'rejectionReason' => $row['rejection_reason'] ?? '',
                'reviewedBy' => intval($row['reviewed_by'] ?? 0),
                'reviewedAt' => $row['reviewed_at'] ?? '',
                'createdSource' => $row['created_source'] ?? 'admin_panel',
                'autocountProjectNo' => rowValue($row, ['autocount_project_no', 'autocount_ref', 'autocount_project_code'], ''),
                'autocountSyncAt' => rowValue($row, ['autocount_sync_at'], '')
            ];
        }
        $documentMap = vehicleDocumentMap($con, array_column($vehicles, 'id'));
        $workOrderMap = vehicleActiveWorkOrderMap($con, array_column($vehicles, 'id'));
        foreach ($vehicles as &$vehicle) {
            $vehicleId = intval($vehicle['id']);
            $vehicle['documents'] = $documentMap[$vehicleId] ?? [];
            $activeWo = $workOrderMap[$vehicleId] ?? null;
            $vehicle['activeWorkOrder'] = $activeWo;
            if ($activeWo !== null) {
                $vehicle['vehicleStatus'] = 'Under Maintenance';
            }
        }
        unset($vehicle);
        sendResponse(true, 'Admin vehicles retrieved', $vehicles);
        break;

    case 'admin-create-vehicle':
        $table = unifiedVehicleTable($con);
        if (!$table) sendResponse(false, 'Vehicle storage is not configured.', null, 409);
        $vecNo = strtoupper(trim($inputData['vecNo'] ?? ''));
        $regNo = strtoupper(trim($inputData['regNo'] ?? ''));
        $equipment = trim($inputData['equipment'] ?? '');
        $brand = normalizeVehicleBrand($inputData['brand'] ?? '');
        $model = normalizeVehicleText($inputData['model'] ?? '');
        $containerLength = trim($inputData['containerLength'] ?? '');
        $axleConfiguration = trim($inputData['axleConfiguration'] ?? '');
        $equipmentProfile = normalizeContainerFleetProfile($equipment, $containerLength);
        $equipment = $equipmentProfile['equipment'];
        $containerLength = $equipmentProfile['containerLength'];
        $yearInput = trim(strval($inputData['year'] ?? ''));
        $mileageInput = trim(strval($inputData['mileage'] ?? ''));
        $lastServiceMileageInput = trim(strval($inputData['lastServiceMileage'] ?? ''));
        $nextServiceMileageInput = trim(strval($inputData['nextServiceMileage'] ?? ''));
        $year = $yearInput === '' ? 0 : intval($yearInput);
        $mileage = $mileageInput === '' ? 0 : intval($mileageInput);
        $companyId = intval($inputData['companyId'] ?? $inputData['ownerId'] ?? 0);
        $contactId = unifiedVehicleContact($con, $table, $companyId);
        $requestedDriverId = intval($inputData['driverId'] ?? 0);
        $driverId = unifiedVehicleDriver($con, $companyId, $requestedDriverId);
        $vehicleStatus = trim($inputData['vehicleStatus'] ?? 'Active');
        $validVehicleStatuses = ['Active', 'Inactive', 'Under Maintenance', 'Out of Service', 'Disposed'];
        $isPrimeMover = $equipment === 'Prime Mover';
        $isContainerChassis = $equipment === 'Container Chassis / Skeletal Trailer';
        if ($regNo === '' || $equipment === '' || $companyId <= 0) {
            sendResponse(false, 'Company, equipment type and registration number are required.', null, 422);
        }
        if (strlen($vecNo) > 50) {
            sendResponse(false, 'Unit / fleet number must not exceed 50 characters.', null, 422);
        }
        if ($isPrimeMover && ($brand === '' || $model === '')) {
            sendResponse(false, 'Prime Mover brand and model are required.', null, 422);
        }
        if ($isContainerChassis && !in_array($containerLength, ['20 ft', '40 ft', '45 ft', '20/40 ft Extendable', 'Other'], true)) {
            sendResponse(false, 'Please select a valid container length.', null, 422);
        }
        if ($isContainerChassis && !in_array($axleConfiguration, ['2 Axle', '3 Axle', 'Other'], true)) {
            sendResponse(false, 'Please select a valid axle configuration.', null, 422);
        }
        if ($yearInput !== '' && (!preg_match('/^\d{4}$/', $yearInput) || $year < 1900 || $year > intval(date('Y')) + 1)) {
            sendResponse(false, 'Please enter a valid vehicle year.', null, 422);
        }
        if ($mileageInput !== '' && !preg_match('/^\d+$/', $mileageInput)) {
            sendResponse(false, 'Current mileage must be a non-negative whole number.', null, 422);
        }
        if ($lastServiceMileageInput !== '' && !preg_match('/^\d+$/', $lastServiceMileageInput)) {
            sendResponse(false, 'Last service mileage must be a non-negative whole number.', null, 422);
        }
        if ($nextServiceMileageInput !== '' && !preg_match('/^\d+$/', $nextServiceMileageInput)) {
            sendResponse(false, 'Next service mileage must be a non-negative whole number.', null, 422);
        }
        if ($mileageInput !== '' && $lastServiceMileageInput !== '' && intval($lastServiceMileageInput) > $mileage) {
            sendResponse(false, 'Last service mileage cannot exceed current mileage.', null, 422);
        }
        if (
            $lastServiceMileageInput !== '' &&
            $nextServiceMileageInput !== '' &&
            intval($nextServiceMileageInput) < intval($lastServiceMileageInput)
        ) {
            sendResponse(false, 'Next service mileage cannot be lower than last service mileage.', null, 422);
        }
        if (!in_array($vehicleStatus, $validVehicleStatuses, true)) {
            sendResponse(false, 'Please select a valid vehicle status.', null, 422);
        }
        if ($contactId <= 0 && $table === 'vehicles') {
            sendResponse(false, 'Create a customer contact for this company before adding its vehicle.', null, 409);
        }
        if ($requestedDriverId > 0 && $driverId <= 0) {
            sendResponse(false, 'The selected driver does not belong to this company.', null, 422);
        }
        foreach (['insurance', 'roadTax', 'puspakom', 'lastServiceDate', 'nextServiceDate'] as $dateField) {
            if (!validOptionalDate($inputData[$dateField] ?? '')) sendResponse(false, 'Please enter valid dates.', null, 422);
        }
        if (
            !empty($inputData['lastServiceDate']) &&
            !empty($inputData['nextServiceDate']) &&
            $inputData['nextServiceDate'] < $inputData['lastServiceDate']
        ) {
            sendResponse(false, 'Next service date cannot be before last service date.', null, 422);
        }
        $dupInfo = unifiedVehicleDuplicateInfo($con, $table, $regNo, $vecNo, $companyId);
        $targetVehicleId = 0;
        if ($dupInfo) {
            if (!empty($dupInfo['isRejected']) && !empty($dupInfo['isSameCompany'])) {
                // Admin is adding/re-activating a previously rejected vehicle for this company
                $targetVehicleId = intval($dupInfo['id']);
            } else if ($dupInfo['type'] === 'registration') {
                sendResponse(false, 'This registration / plate number is already registered.', null, 409);
            } else if ($dupInfo['type'] === 'vehicle') {
                sendResponse(false, 'This vehicle number is already used by this company.', null, 409);
            }
        }
        $data = [
            'contactId' => $contactId > 0 ? $contactId : null,
            'driverId' => $driverId,
            'ownerName' => trim($inputData['ownerName'] ?? ''),
            'companyId' => $companyId,
            'vecNo' => $vecNo === '' ? null : $vecNo,
            'regNo' => $regNo,
            'equipment' => $equipment,
            'brand' => $brand,
            'model' => $model,
            'year' => $year,
            'mileage' => $mileage,
            'chassisNo' => strtoupper(trim($inputData['chassisNo'] ?? '')),
            'engineNo' => strtoupper(trim($inputData['engineNo'] ?? '')),
            'containerLength' => $containerLength,
            'axleConfiguration' => $axleConfiguration,
            'insurance' => $inputData['insurance'] ?? '',
            'roadTax' => $inputData['roadTax'] ?? '',
            'puspakom' => $inputData['puspakom'] ?? '',
            'lastServiceDate' => $inputData['lastServiceDate'] ?? '',
            'lastServiceMileage' => $lastServiceMileageInput === '' ? null : intval($lastServiceMileageInput),
            'nextServiceDate' => $inputData['nextServiceDate'] ?? '',
            'nextServiceMileage' => $nextServiceMileageInput === '' ? null : intval($nextServiceMileageInput),
            'vehicleStatus' => $vehicleStatus,
            'verificationStatus' => 'approved',
            'rejectionReason' => '',
            'reviewedBy' => intval($_SESSION['admin_id'] ?? 0),
            'reviewedAt' => date('Y-m-d H:i:s'),
            'createdSource' => 'admin_panel',
            'autocountProjectNo' => trim($inputData['autocountProjectNo'] ?? '')
        ];
        if ($targetVehicleId > 0) {
            if (saveUnifiedVehicle($con, $table, $data, $targetVehicleId)) {
                sendResponse(true, 'Vehicle added and activated successfully', ['id' => $targetVehicleId]);
            }
        } else {
            if (saveUnifiedVehicle($con, $table, $data, 0)) {
                $newId = mysqli_insert_id($con);
                sendResponse(true, 'Vehicle added successfully', ['id' => $newId]);
            }
        }
        sendResponse(false, 'Failed to add vehicle: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-update-vehicle':
        $vehicleId = intval($inputData['id'] ?? 0);
        $table = unifiedVehicleTable($con);
        if (!$table) sendResponse(false, 'Vehicle storage is not configured.', null, 409);
        $vecNo = strtoupper(trim($inputData['vecNo'] ?? ''));
        $regNo = strtoupper(trim($inputData['regNo'] ?? ''));
        $equipment = trim($inputData['equipment'] ?? '');
        $brand = normalizeVehicleBrand($inputData['brand'] ?? '');
        $model = normalizeVehicleText($inputData['model'] ?? '');
        $containerLength = trim($inputData['containerLength'] ?? '');
        $axleConfiguration = trim($inputData['axleConfiguration'] ?? '');
        $equipmentProfile = normalizeContainerFleetProfile($equipment, $containerLength);
        $equipment = $equipmentProfile['equipment'];
        $containerLength = $equipmentProfile['containerLength'];
        $yearInput = trim(strval($inputData['year'] ?? ''));
        $mileageInput = trim(strval($inputData['mileage'] ?? ''));
        $lastServiceMileageInput = trim(strval($inputData['lastServiceMileage'] ?? ''));
        $nextServiceMileageInput = trim(strval($inputData['nextServiceMileage'] ?? ''));
        $year = $yearInput === '' ? 0 : intval($yearInput);
        $mileage = $mileageInput === '' ? 0 : intval($mileageInput);
        $companyId = intval($inputData['companyId'] ?? $inputData['ownerId'] ?? 0);
        $contactId = unifiedVehicleContact($con, $table, $companyId);
        $requestedDriverId = intval($inputData['driverId'] ?? 0);
        $driverId = unifiedVehicleDriver($con, $companyId, $requestedDriverId);
        $vehicleStatus = trim($inputData['vehicleStatus'] ?? 'Active');
        $validVehicleStatuses = ['Active', 'Inactive', 'Under Maintenance', 'Out of Service', 'Disposed'];
        $isPrimeMover = $equipment === 'Prime Mover';
        $isContainerChassis = $equipment === 'Container Chassis / Skeletal Trailer';
        if ($vehicleId <= 0 || $regNo === '' || $equipment === '' || $companyId <= 0) {
            sendResponse(false, 'Vehicle ID, company, equipment type and registration number are required.', null, 422);
        }
        if (strlen($vecNo) > 50) {
            sendResponse(false, 'Unit / fleet number must not exceed 50 characters.', null, 422);
        }
        if ($isPrimeMover && ($brand === '' || $model === '')) {
            sendResponse(false, 'Prime Mover brand and model are required.', null, 422);
        }
        if ($isContainerChassis && !in_array($containerLength, ['20 ft', '40 ft', '45 ft', '20/40 ft Extendable', 'Other'], true)) {
            sendResponse(false, 'Please select a valid container length.', null, 422);
        }
        if ($isContainerChassis && !in_array($axleConfiguration, ['2 Axle', '3 Axle', 'Other'], true)) {
            sendResponse(false, 'Please select a valid axle configuration.', null, 422);
        }
        if ($yearInput !== '' && (!preg_match('/^\d{4}$/', $yearInput) || $year < 1900 || $year > intval(date('Y')) + 1)) {
            sendResponse(false, 'Please enter a valid vehicle year.', null, 422);
        }
        if ($mileageInput !== '' && !preg_match('/^\d+$/', $mileageInput)) {
            sendResponse(false, 'Current mileage must be a non-negative whole number.', null, 422);
        }
        if ($lastServiceMileageInput !== '' && !preg_match('/^\d+$/', $lastServiceMileageInput)) {
            sendResponse(false, 'Last service mileage must be a non-negative whole number.', null, 422);
        }
        if ($nextServiceMileageInput !== '' && !preg_match('/^\d+$/', $nextServiceMileageInput)) {
            sendResponse(false, 'Next service mileage must be a non-negative whole number.', null, 422);
        }
        if ($mileageInput !== '' && $lastServiceMileageInput !== '' && intval($lastServiceMileageInput) > $mileage) {
            sendResponse(false, 'Last service mileage cannot exceed current mileage.', null, 422);
        }
        if (
            $lastServiceMileageInput !== '' &&
            $nextServiceMileageInput !== '' &&
            intval($nextServiceMileageInput) < intval($lastServiceMileageInput)
        ) {
            sendResponse(false, 'Next service mileage cannot be lower than last service mileage.', null, 422);
        }
        if (!in_array($vehicleStatus, $validVehicleStatuses, true)) {
            sendResponse(false, 'Please select a valid vehicle status.', null, 422);
        }
        $reverifyAction = strtolower(trim(strval($inputData['reverifyAction'] ?? $inputData['verificationStatus'] ?? '')));
        $isReverifying = in_array($reverifyAction, ['approved', 'pending'], true);

        if ($table && $vehicleId > 0) {
            $vCheck = mysqli_query($con, "SELECT verification_status FROM `$table` WHERE id = $vehicleId LIMIT 1");
            $vRow = $vCheck ? mysqli_fetch_assoc($vCheck) : null;
            if (strtolower($vRow['verification_status'] ?? '') === 'rejected') {
                if (!$isReverifying) {
                    sendResponse(false, 'Rejected vehicles cannot be modified unless re-verifying as pending or approved.', null, 422);
                }
            }
        }
        if ($contactId <= 0) sendResponse(false, 'Create a customer contact for this company before saving its vehicle.', null, 409);
        if ($requestedDriverId > 0 && $driverId <= 0) {
            sendResponse(false, 'The selected driver does not belong to this company.', null, 422);
        }
        foreach (['insurance', 'roadTax', 'puspakom', 'lastServiceDate', 'nextServiceDate'] as $dateField) {
            if (!validOptionalDate($inputData[$dateField] ?? '')) sendResponse(false, 'Please enter valid dates.', null, 422);
        }
        if (
            !empty($inputData['lastServiceDate']) &&
            !empty($inputData['nextServiceDate']) &&
            $inputData['nextServiceDate'] < $inputData['lastServiceDate']
        ) {
            sendResponse(false, 'Next service date cannot be before last service date.', null, 422);
        }
        $duplicate = unifiedVehicleDuplicate($con, $table, $regNo, $vecNo, $companyId, $vehicleId, true);
        if ($duplicate === 'registration') sendResponse(false, 'This registration / plate number is already registered.', null, 409);
        if ($duplicate === 'vehicle') sendResponse(false, 'This vehicle number is already used by this company.', null, 409);
        $data = [
            'contactId' => $contactId,
            'driverId' => $driverId,
            'ownerName' => trim($inputData['ownerName'] ?? ''),
            'companyId' => $companyId,
            'vecNo' => $vecNo === '' ? null : $vecNo,
            'regNo' => $regNo,
            'equipment' => $equipment,
            'brand' => $brand,
            'model' => $model,
            'year' => $year,
            'mileage' => $mileage,
            'chassisNo' => strtoupper(trim($inputData['chassisNo'] ?? '')),
            'engineNo' => strtoupper(trim($inputData['engineNo'] ?? '')),
            'containerLength' => $containerLength,
            'axleConfiguration' => $axleConfiguration,
            'insurance' => $inputData['insurance'] ?? '',
            'roadTax' => $inputData['roadTax'] ?? '',
            'puspakom' => $inputData['puspakom'] ?? '',
            'lastServiceDate' => $inputData['lastServiceDate'] ?? '',
            'lastServiceMileage' => $lastServiceMileageInput === '' ? null : intval($lastServiceMileageInput),
            'nextServiceDate' => $inputData['nextServiceDate'] ?? '',
            'nextServiceMileage' => $nextServiceMileageInput === '' ? null : intval($nextServiceMileageInput),
            'vehicleStatus' => ($isReverifying && $reverifyAction === 'pending') ? 'Inactive' : $vehicleStatus
        ];
        if ($isReverifying) {
            $data['verificationStatus'] = $reverifyAction;
            $data['rejectionReason'] = '';
            if ($reverifyAction === 'approved') {
                $data['reviewedBy'] = intval($_SESSION['admin_id'] ?? 0);
                $data['reviewedAt'] = date('Y-m-d H:i:s');
                $data['status'] = 'Good';
            } else {
                $data['reviewedBy'] = 0;
                $data['reviewedAt'] = '';
                $data['status'] = 'Pending Verification';
            }
        }
        if (saveUnifiedVehicle($con, $table, $data, $vehicleId)) {
            sendResponse(true, 'Vehicle updated successfully', [
                'id' => $vehicleId,
                'verificationStatus' => $isReverifying ? $reverifyAction : null,
            ]);
        }
        sendResponse(false, 'Failed to update vehicle: ' . mysqli_error($con), null, 500);
        break;

    case 'admin-review-vehicle':
        $vehicleId = intval($inputData['id'] ?? 0);
        $decision = strtolower(trim($inputData['decision'] ?? ''));
        $reason = trim($inputData['reason'] ?? '');
        $table = unifiedVehicleTable($con);
        if (!$table || $vehicleId <= 0 || !in_array($decision, ['approved', 'rejected'], true)) {
            sendResponse(false, 'Vehicle and a valid review decision are required.', null, 422);
        }
        if ($decision === 'rejected' && $reason === '') {
            sendResponse(false, 'A rejection reason is required.', null, 422);
        }
        $result = mysqli_query($con, "SELECT * FROM `$table` WHERE id = $vehicleId LIMIT 1");
        $vehicle = $result ? mysqli_fetch_assoc($result) : null;
        if (!$vehicle) sendResponse(false, 'Vehicle not found.', null, 404);

        $companyId = intval($vehicle['company_id'] ?? 0);
        $contactId = intval(rowValue(
            $vehicle,
            $table === 'customer_vehicle'
                ? ['customer_id', 'user_id', 'owner_id']
                : ['user_id', 'customer_id', 'owner_id'],
            0
        ));
        $regNo = rowValue($vehicle, ['reg_no', 'registration_no', 'plate_no'], 'Vehicle');
        $reviewData = [
            'verificationStatus' => $decision,
            'vehicleStatus' => $decision === 'rejected' ? 'Inactive' : 'Active',
            'status' => $decision === 'rejected' ? 'Inactive' : 'Good',
            'rejectionReason' => $decision === 'rejected' ? $reason : '',
            'reviewedBy' => intval($_SESSION['admin_id'] ?? 0),
            'reviewedAt' => date('Y-m-d H:i:s')
        ];
        if (!saveUnifiedVehicle($con, $table, $reviewData, $vehicleId)) {
            sendResponse(false, 'Unable to save vehicle review: ' . mysqli_error($con), null, 500);
        }
        createVehicleReviewNotification(
            $con,
            $companyId,
            $contactId,
            $vehicleId,
            $regNo,
            $decision,
            $reason
        );
        sendResponse(true, $decision === 'approved' ? 'Vehicle approved.' : 'Vehicle rejected.', [
            'id' => $vehicleId,
            'verificationStatus' => $decision,
            'reviewedAt' => date('Y-m-d H:i:s')
        ]);
        break;

    case 'admin-review-vehicle-document':
        requireVehicleDocumentSchema($con);
        $documentId = intval($inputData['id'] ?? 0);
        $decision = strtolower(trim(strval($inputData['decision'] ?? '')));
        $reason = trim(strval($inputData['reason'] ?? ''));
        if ($documentId <= 0 || !in_array($decision, ['approved', 'rejected'], true)) {
            sendResponse(false, 'Document and a valid review decision are required.', null, 422);
        }
        if ($decision === 'rejected' && $reason === '') {
            sendResponse(false, 'A rejection reason is required.', null, 422);
        }
        $result = mysqli_query(
            $con,
            "SELECT d.*, v.company_id, v.registration_no FROM vehicle_document d JOIN customer_vehicle v ON v.id = d.vehicle_id WHERE d.id = $documentId LIMIT 1"
        );
        $document = $result ? mysqli_fetch_assoc($result) : null;
        if (!$document) sendResponse(false, 'Vehicle document not found.', null, 404);
        if (($document['status'] ?? '') !== 'pending') {
            sendResponse(false, 'Only pending vehicle documents can be reviewed.', null, 409);
        }
        $vehicleId = intval($document['vehicle_id']);
        $type = strval($document['document_type']);
        $expiryDate = strval($document['expiry_date']);
        $reasonSql = mysqli_real_escape_string($con, $decision === 'rejected' ? $reason : '');
        $adminId = intval($_SESSION['admin_id'] ?? 0);
        try {
            mysqli_begin_transaction($con);
            if ($decision === 'approved') {
                $fieldMap = ['insurance' => 'insurance', 'road_tax' => 'roadTax', 'puspakom' => 'puspakom'];
                if (!isset($fieldMap[$type]) || !saveUnifiedVehicle($con, 'customer_vehicle', [$fieldMap[$type] => $expiryDate], $vehicleId)) {
                    throw new RuntimeException('Unable to update the vehicle expiry date: ' . mysqli_error($con), 500);
                }
                $typeSql = mysqli_real_escape_string($con, $type);
                if (!mysqli_query($con, "UPDATE vehicle_document SET status = 'superseded' WHERE vehicle_id = $vehicleId AND document_type = '$typeSql' AND status = 'approved'")) {
                    throw new RuntimeException('Unable to archive the previous approved document.', 500);
                }
            }
            if (!mysqli_query(
                $con,
                "UPDATE vehicle_document SET status = '$decision', review_reason = '$reasonSql', reviewed_by = $adminId, reviewed_at = NOW() WHERE id = $documentId AND status = 'pending'"
            )) {
                throw new RuntimeException('Unable to save the document review.', 500);
            }
            mysqli_commit($con);
        } catch (Throwable $error) {
            mysqli_rollback($con);
            sendResponse(false, $error->getMessage(), null, intval($error->getCode()) ?: 500);
        }
        $customerId = intval($document['uploaded_by_customer_id'] ?? 0);
        if ($customerId > 0) {
            createCustomerRecordNotification(
                $con,
                'customer',
                intval($document['company_id'] ?? 0),
                $customerId,
                $decision === 'approved' ? 'Document approved' : 'Document rejected',
                ($document['registration_no'] ?? 'Vehicle') . ' ' . vehicleDocumentTypeLabel($type) . ($decision === 'approved' ? ' document was approved.' : " document was rejected: $reason"),
                'system',
                'vehicle',
                'v' . $vehicleId,
                '/vehicle/v' . $vehicleId
            );
        }
        sendResponse(true, $decision === 'approved' ? 'Vehicle document approved.' : 'Vehicle document rejected.', [
            'id' => $documentId,
            'vehicleId' => $vehicleId,
            'status' => $decision,
            'expiryDate' => $expiryDate,
        ]);
        break;

    case 'admin-upload-vehicle-document':
        requireVehicleDocumentSchema($con);
        $vehicleId = intval(preg_replace('/\D+/', '', strval($_POST['vehicleId'] ?? $inputData['vehicleId'] ?? '')));
        $documentType = strtolower(trim(strval($_POST['documentType'] ?? $inputData['documentType'] ?? '')));
        $expiryDate = trim(strval($_POST['expiryDate'] ?? $inputData['expiryDate'] ?? ''));
        $table = unifiedVehicleTable($con);
        if (!$table || $vehicleId <= 0) sendResponse(false, 'A valid vehicle is required.', null, 422);

        $vehicleResult = mysqli_query($con, "SELECT * FROM `$table` WHERE id = $vehicleId LIMIT 1");
        $vehicle = $vehicleResult ? mysqli_fetch_assoc($vehicleResult) : null;
        if (!$vehicle) sendResponse(false, 'Vehicle not found.', null, 404);

        $adminId = intval($_SESSION['admin_id'] ?? 0);
        try {
            mysqli_begin_transaction($con);
            $documentId = storeVehicleDocumentUpload(
                $con,
                $vehicleId,
                $documentType,
                $expiryDate,
                $_FILES['document'] ?? null,
                $adminId,
                'admin_panel'
            );

            // Since Admin uploaded this document, auto-approve it
            $fieldMap = ['insurance' => 'insurance', 'road_tax' => 'roadTax', 'puspakom' => 'puspakom'];
            if (isset($fieldMap[$documentType]) && $expiryDate !== '') {
                saveUnifiedVehicle($con, $table, [$fieldMap[$documentType] => $expiryDate], $vehicleId);
            }
            $typeSql = mysqli_real_escape_string($con, $documentType);
            mysqli_query($con, "UPDATE vehicle_document SET status = 'superseded' WHERE vehicle_id = $vehicleId AND document_type = '$typeSql' AND status = 'approved' AND id <> $documentId");
            mysqli_query($con, "UPDATE vehicle_document SET status = 'approved', reviewed_by = $adminId, reviewed_at = NOW() WHERE id = $documentId");

            mysqli_commit($con);
        } catch (Throwable $error) {
            mysqli_rollback($con);
            sendResponse(false, $error->getMessage(), null, intval($error->getCode()) ?: 500);
        }

        $documentMap = vehicleDocumentMap($con, [$vehicleId]);
        sendResponse(true, 'Document uploaded successfully.', [
            'documentId' => $documentId,
            'documents' => $documentMap[$vehicleId] ?? []
        ]);
        break;

    case 'admin-delete-vehicle-document':
        requireVehicleDocumentSchema($con);
        $documentId = intval($inputData['documentId'] ?? $_POST['documentId'] ?? 0);
        if ($documentId <= 0) sendResponse(false, 'Invalid document ID.', null, 400);
        $docRes = mysqli_query($con, "SELECT * FROM vehicle_document WHERE id = $documentId LIMIT 1");
        $doc = $docRes ? mysqli_fetch_assoc($docRes) : null;
        if (!$doc) sendResponse(false, 'Document not found.', null, 404);

        $storageFile = resolveVehicleDocumentFile($doc['storage_path']);
        if ($storageFile && file_exists($storageFile)) @unlink($storageFile);

        mysqli_query($con, "DELETE FROM vehicle_document WHERE id = $documentId");
        sendResponse(true, 'Document deleted successfully.');
        break;

    case 'admin-delete-vehicle':
        sendResponse(false, 'Vehicle master records are managed in AutoCount and cannot be deleted from the workshop panel.', null, 403);
        break;

    case 'admin-vehicle-search':
        $q = mysqli_real_escape_string($con, trim($inputData['q'] ?? $_GET['q'] ?? ''));
        if (strlen($q) < 2) {
            sendResponse(true, 'Search term too short', []);
            break;
        }
        $query = "SELECT cv.*, comp.name AS company_name, cust.name AS driver_name
                  FROM customer_vehicle cv
                  LEFT JOIN company comp ON cv.company_id = comp.id
                  LEFT JOIN customer cust ON cv.customer_id = cust.id
                  WHERE cv.reg_no LIKE '%$q%' OR cv.vec_no LIKE '%$q%'
                  LIMIT 10";
        $result = mysqli_query($con, $query);
        $vehicles = [];
        while ($result && $row = mysqli_fetch_assoc($result)) {
            $vehicles[] = [
                'id' => intval($row['id']),
                'regNo' => $row['reg_no'],
                'vecNo' => $row['vec_no'],
                'brand' => $row['brand'],
                'model' => $row['model'],
                'companyId' => intval($row['company_id']),
                'companyName' => $row['company_name'] ?? '-',
                'customerId' => $row['customer_id'] ? intval($row['customer_id']) : null,
                'driverName' => $row['driver_name'] ?? '-'
            ];
        }
        sendResponse(true, 'Vehicles found', $vehicles);
        break;

    case 'admin-vehicle-history':
    case 'customer-vehicle-history':
        $vehicleId = intval($inputData['vehicleId'] ?? $_GET['vehicleId'] ?? 0);
        $plate = mysqli_real_escape_string($con, trim($inputData['plate'] ?? $_GET['plate'] ?? ''));
        
        if ($vehicleId <= 0 && $plate !== '') {
            $vFindRes = mysqli_query($con, "SELECT id FROM customer_vehicle WHERE registration_no = '$plate' OR vehicle_no = '$plate' LIMIT 1");
            if ($vFindRes && $vRow = mysqli_fetch_assoc($vFindRes)) {
                $vehicleId = intval($vRow['id']);
            }
        }
        
        if ($vehicleId <= 0) {
            sendResponse(false, 'Vehicle ID or plate is required.', null, 400);
            break;
        }

        if (strpos($mode, 'customer-') === 0 && function_exists('requireCustomerSession')) {
            $auth = requireCustomerSession($con);
            $companyId = intval($auth['companyId'] ?? 0);
            if (empty($auth['isSuperadmin'])) {
                $vehOwnerCheck = mysqli_query($con, "SELECT id FROM customer_vehicle WHERE id = $vehicleId AND company_id = $companyId LIMIT 1");
                if (!$vehOwnerCheck || mysqli_num_rows($vehOwnerCheck) === 0) {
                    sendResponse(false, 'Vehicle not found or access denied.', null, 403);
                    break;
                }
            }
        }

        $statusSql = function_exists('getCanonicalStatusSql')
            ? getCanonicalStatusSql($con, 'j')
            : "CASE
                WHEN j.status = 1 THEN 'scheduled'
                WHEN j.status = 2 THEN 'checked_in'
                WHEN j.status = 3 THEN 'inspected'
                WHEN j.status = 4 THEN 'approved'
                WHEN j.status = 5 THEN 'parts_ready'
                WHEN j.status = 6 THEN 'under_repair'
                WHEN j.status = 8 THEN 'ready_for_collection'
                WHEN j.status = 10 THEN 'collected'
                ELSE 'pending'
            END";

        $vNextDateCol = columnExists($con, 'customer_vehicle', 'next_service_date') ? 'next_service_date' : "'' AS next_service_date";
        $vNextMileageCol = columnExists($con, 'customer_vehicle', 'next_service_mileage') ? 'next_service_mileage' : '0 AS next_service_mileage';
        $vBaselineRes = mysqli_query($con, "SELECT mileage, last_service_date, last_service_mileage, $vNextDateCol, $vNextMileageCol FROM customer_vehicle WHERE id = $vehicleId LIMIT 1");
        $vBaseline = $vBaselineRes ? mysqli_fetch_assoc($vBaselineRes) : null;
        $maxMileage = intval($vBaseline['mileage'] ?? 0);
        $lastServiceDate = !empty($vBaseline['last_service_date']) ? $vBaseline['last_service_date'] : null;
        $lastServiceMileage = intval($vBaseline['last_service_mileage'] ?? 0);
        $nextServiceMileage = intval($vBaseline['next_service_mileage'] ?? 0);
        $nextServiceDate = !empty($vBaseline['next_service_date']) ? $vBaseline['next_service_date'] : null;

        $woRes = mysqli_query($con, "SELECT j.id, j.work_order_no, ($statusSql) AS canonical_status,
            j.created_at, j.checkin_at, j.checkin_mileage, j.reported_problem, j.actual_issue,
            j.bay, j.priority, j.completed_at, j.collected_at,
            COALESCE(q.total, 0) AS quotation_total,
            COALESCE(woi.total, ai.total, 0) AS invoice_total
            FROM job j
            LEFT JOIN work_order_quotation q ON q.work_order_id = j.id AND q.status = 'approved'
            LEFT JOIN work_order_invoice woi ON woi.work_order_id = j.id
            LEFT JOIN accounting_invoice ai ON ai.work_order_id = j.id
            WHERE j.vehicle_id = $vehicleId
            ORDER BY COALESCE(j.checkin_at, j.scheduled_at, j.created_at) DESC, j.id DESC");
            
        $workOrders = [];
        $totalSpent = 0.0;
        
        while ($woRes && $row = mysqli_fetch_assoc($woRes)) {
            $cost = floatval($row['invoice_total'] ?: $row['quotation_total']);
            $totalSpent += $cost;
            $mileage = intval($row['checkin_mileage'] ?? 0);
            if ($mileage > $maxMileage) $maxMileage = $mileage;
            $date = $row['checkin_at'] ?: $row['created_at'];
            if (!$lastServiceDate && ($row['collected_at'] || $row['completed_at'])) {
                $lastServiceDate = $row['collected_at'] ?: $row['completed_at'];
                if ($lastServiceMileage <= 0 && $mileage > 0) {
                    $lastServiceMileage = $mileage;
                }
            }
            $canonical = $row['canonical_status'];
            $label = ucwords(str_replace('_', ' ', $canonical));
            $issue = $row['actual_issue'] ?: ($row['reported_problem'] ?: 'Standard Service & Maintenance');
            $workOrders[] = [
                'id' => intval($row['id']),
                'workOrderNo' => $row['work_order_no'],
                'canonicalStatus' => $canonical,
                'status' => $canonical,
                'statusLabel' => $label,
                'date' => $date,
                'checkinAt' => $date,
                'completedAt' => $row['collected_at'] ?: $row['completed_at'],
                'checkinMileage' => $mileage > 0 ? $mileage : null,
                'currentMileage' => $mileage > 0 ? $mileage : null,
                'issue' => $issue,
                'primaryIssue' => $issue,
                'bay' => $row['bay'] ?: null,
                'priority' => $row['priority'] ?: 'Normal',
                'amount' => $cost > 0 ? $cost : null,
                'totalAmount' => $cost > 0 ? $cost : 0,
            ];
        }

        // Compute mileage delta between consecutive service visits
        for ($i = 0; $i < count($workOrders); $i++) {
            $currKm = $workOrders[$i]['checkinMileage'];
            $prevKm = null;
            for ($j = $i + 1; $j < count($workOrders); $j++) {
                if (!empty($workOrders[$j]['checkinMileage']) && $workOrders[$j]['checkinMileage'] > 0) {
                    $prevKm = $workOrders[$j]['checkinMileage'];
                    break;
                }
            }
            if ($currKm !== null && $currKm > 0 && $prevKm !== null && $prevKm > 0) {
                $workOrders[$i]['mileageDelta'] = $currKm - $prevKm;
            } else {
                $workOrders[$i]['mileageDelta'] = null;
            }
        }

        $invRes = mysqli_query($con, "SELECT ai.id, ai.external_invoice_no, ai.external_job_no, ai.invoice_date, ai.total, ai.document_status, 'autocount' AS source
            FROM accounting_invoice ai
            WHERE ai.vehicle_id = $vehicleId
            UNION ALL
            SELECT woi.id, woi.invoice_no AS external_invoice_no, j.work_order_no AS external_job_no, woi.invoice_date, woi.total, woi.status AS document_status, 'maw' AS source
            FROM work_order_invoice woi
            JOIN job j ON j.id = woi.work_order_id
            WHERE j.vehicle_id = $vehicleId
            ORDER BY invoice_date DESC, id DESC");

        $invoices = [];
        while ($invRes && $iRow = mysqli_fetch_assoc($invRes)) {
            $invTotal = floatval($iRow['total']);
            $invoices[] = [
                'id' => $iRow['id'],
                'invoiceNo' => $iRow['external_invoice_no'] ?: ('INV-' . $iRow['id']),
                'workOrderNo' => $iRow['external_job_no'],
                'date' => $iRow['invoice_date'],
                'invoiceDate' => $iRow['invoice_date'],
                'total' => $invTotal,
                'totalAmount' => $invTotal,
                'status' => $iRow['document_status'],
                'paymentStatus' => $iRow['document_status'],
                'source' => $iRow['source']
            ];
        }

        $serviceStatus = 'normal';
        $remainingKm = null;
        if ($nextServiceMileage > 0 && $maxMileage > 0) {
            $remainingKm = $nextServiceMileage - $maxMileage;
            if ($remainingKm < 0) {
                $serviceStatus = 'overdue';
            } elseif ($remainingKm <= 1000) {
                $serviceStatus = 'due_soon';
            }
        }

        $mileageLogs = [];
        if (tableExists($con, 'vehicle_mileage_log')) {
            $mlRes = mysqli_query($con, "SELECT id, mileage, delta, source, reference_id, reference_no, recorded_by_name, notes, created_at
                FROM vehicle_mileage_log
                WHERE vehicle_id = $vehicleId
                ORDER BY created_at DESC, id DESC LIMIT 100");
            while ($mlRes && $mlRow = mysqli_fetch_assoc($mlRes)) {
                $mileageLogs[] = [
                    'id' => intval($mlRow['id']),
                    'mileage' => intval($mlRow['mileage']),
                    'delta' => $mlRow['delta'] !== null ? intval($mlRow['delta']) : null,
                    'source' => $mlRow['source'],
                    'referenceNo' => $mlRow['reference_no'],
                    'recordedByName' => $mlRow['recorded_by_name'],
                    'notes' => $mlRow['notes'],
                    'createdAt' => $mlRow['created_at']
                ];
            }
        }

        sendResponse(true, 'Vehicle service history retrieved', [
            'vehicleId' => $vehicleId,
            'summary' => [
                'totalJobs' => count($workOrders),
                'totalWorkOrders' => count($workOrders),
                'totalInvoices' => count($invoices),
                'totalSpent' => $totalSpent,
                'totalMaintenanceSpend' => $totalSpent,
                'maxMileage' => $maxMileage > 0 ? $maxMileage : null,
                'lastRecordedMileage' => $maxMileage > 0 ? $maxMileage : null,
                'lastServiceMileage' => $lastServiceMileage > 0 ? $lastServiceMileage : ($maxMileage > 0 ? $maxMileage : null),
                'lastServiceDate' => $lastServiceDate,
                'nextServiceMileage' => $nextServiceMileage > 0 ? $nextServiceMileage : null,
                'nextServiceDate' => $nextServiceDate,
                'serviceStatus' => $serviceStatus,
                'remainingKm' => $remainingKm
            ],
            'workOrders' => $workOrders,
            'invoices' => $invoices,
            'mileageLogs' => $mileageLogs
        ]);
        break;

    case 'admin-vehicle-mileage-logs':
        $vehicleId = intval($inputData['vehicleId'] ?? $_GET['vehicleId'] ?? 0);
        if ($vehicleId <= 0) {
            sendResponse(false, 'Vehicle ID is required.', null, 400);
            break;
        }
        $logs = [];
        if (tableExists($con, 'vehicle_mileage_log')) {
            $res = mysqli_query($con, "SELECT id, mileage, delta, source, reference_id, reference_no, recorded_by_name, notes, created_at
                FROM vehicle_mileage_log
                WHERE vehicle_id = $vehicleId
                ORDER BY created_at DESC, id DESC LIMIT 200");
            while ($res && $row = mysqli_fetch_assoc($res)) {
                $logs[] = [
                    'id' => intval($row['id']),
                    'mileage' => intval($row['mileage']),
                    'delta' => $row['delta'] !== null ? intval($row['delta']) : null,
                    'source' => $row['source'],
                    'referenceNo' => $row['reference_no'],
                    'recordedByName' => $row['recorded_by_name'],
                    'notes' => $row['notes'],
                    'createdAt' => $row['created_at']
                ];
            }
        }
        sendResponse(true, 'Mileage logs retrieved', $logs);
        break;

    default:
        sendResponse(false, "Unsupported vehicle action: $mode", null, 400);
        break;
    }
}
