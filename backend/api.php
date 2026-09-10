<?php
// Mewah Auto Work - Single Entry API Router
// Explicitly disable display_errors to prevent JSON corruption while capturing full error logs in App Logs
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// Same-origin by default; explicitly allow configured customer origins for mobile wrappers.
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$configuredOrigins = array_filter(array_map('trim', explode(',', getenv('MAW_ALLOWED_ORIGINS') ?: '')));
$localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    'http://127.0.0.1',
    'https://127.0.0.1'
];
$firstPartyOrigins = [
    'https://workshop.example.com',
    'https://workshop.example.com'
];
$allowedOrigins = array_values(array_unique(array_merge(
    $configuredOrigins,
    $localOrigins,
    $firstPartyOrigins
)));
$isAllowedOrigin = (
    $requestOrigin !== '' && (
        in_array($requestOrigin, $allowedOrigins, true) ||
        preg_match('/^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|capacitor:\/\/localhost|ionic:\/\/localhost)$/i', $requestOrigin)
    )
);
if ($requestOrigin !== '' && !$isAllowedOrigin) {
    http_response_code(403);
    header("Content-Type: application/json; charset=UTF-8");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    echo json_encode([
        'success' => false,
        'message' => 'Origin is not allowed.',
        'data' => null
    ]);
    exit;
}
if ($requestOrigin !== '') {
    header("Access-Control-Allow-Origin: " . $requestOrigin);
    header("Access-Control-Allow-Credentials: true");
    header("Vary: Origin");
}
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-MAW-Portal, Accept, Origin");
header("Access-Control-Expose-Headers: X-CSRF-Token, X-MAW-API-Version");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("X-MAW-API-Version: 20260827-security-host-migration");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── Client Real IP Resolver ──────────────────────────────────────────────────
// Correctly extracts client public IP behind Cloudflare, LiteSpeed/CyberPanel, and reverse proxies
function getClientIpAddress(): string {
    $headers = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'HTTP_CLIENT_IP',
        'REMOTE_ADDR',
    ];

    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ips = explode(',', strval($_SERVER[$header]));
            foreach ($ips as $ip) {
                $trimmed = trim($ip);
                if (filter_var($trimmed, FILTER_VALIDATE_IP)) {
                    if ($trimmed !== '::1' && $trimmed !== '127.0.0.1') {
                        return $trimmed;
                    }
                }
            }
        }
    }

    $raw = strval($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    return $raw === '::1' ? '127.0.0.1' : $raw;
}

// ── Application Logger ────────────────────────────────────────────────────────
// Writes JSON log lines to storage/logs/app-YYYY-MM.log
// Levels: FATAL, ERROR, WARN, INFO
function appLog($level, $message, $context = []) {
    static $logDir = null;
    if ($logDir === null) {
        $logDir = __DIR__ . '/storage/logs';
        if (!is_dir($logDir)) @mkdir($logDir, 0750, true);
        $htaccess = $logDir . '/.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Require all denied\nDeny from all\n");
        }
    }
    $logFile = $logDir . '/app-' . date('Y-m') . '.log';
    $actor = '';
    if (!empty($_SESSION['admin_name'])) $actor = $_SESSION['admin_name'];
    elseif (!empty($_SESSION['admin_username'])) $actor = $_SESSION['admin_username'];
    elseif (!empty($_SESSION['customer_user_id'])) $actor = 'Customer#' . intval($_SESSION['customer_user_id']);
    elseif (!empty($_SESSION['staff_name'])) $actor = $_SESSION['staff_name'];
    $entry = json_encode([
        'ts'      => date('Y-m-d H:i:s'),
        'level'   => strtoupper($level),
        'message' => substr(strval($message), 0, 1500),
        'context' => is_array($context) ? $context : [],
        'mode'    => $_GET['mode'] ?? '',
        'ip'      => getClientIpAddress(),
        'actor'   => $actor,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    @file_put_contents($logFile, $entry . "\n", FILE_APPEND | LOCK_EX);
}

// Global Fatal / Shutdown Handler
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        appLog('FATAL', $error['message'], [
            'file' => $error['file'],
            'line' => $error['line'],
            'mode' => $_GET['mode'] ?? '',
        ]);
        if (!headers_sent()) {
            http_response_code(500);
            header("Content-Type: application/json; charset=UTF-8");
        }
        echo json_encode([
            'success' => false,
            'message' => 'Unexpected server error.',
            'data' => null
        ]);
    }
});

// Global Uncaught Exception Handler
set_exception_handler(function (Throwable $ex) {
    appLog('FATAL', 'Uncaught Exception: ' . $ex->getMessage(), [
        'file' => $ex->getFile(),
        'line' => $ex->getLine(),
        'trace' => substr($ex->getTraceAsString(), 0, 2000),
        'mode' => $_GET['mode'] ?? '',
    ]);
    if (!headers_sent()) {
        http_response_code(500);
        header("Content-Type: application/json; charset=UTF-8");
    }
    echo json_encode([
        'success' => false,
        'message' => 'Internal server error: ' . $ex->getMessage(),
        'data' => null
    ]);
    exit;
});

// Global PHP Error / Warning Handler
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) {
        return false;
    }
    $level = in_array($errno, [E_USER_ERROR, E_RECOVERABLE_ERROR], true) ? 'ERROR' : 'WARN';
    appLog($level, "[PHP Error] {$errstr}", [
        'errno' => $errno,
        'file' => $errfile,
        'line' => $errline,
        'mode' => $_GET['mode'] ?? '',
    ]);
    return false;
});

// Record request start time for slow-request detection
define('MAW_REQUEST_START', microtime(true));

// Retrieve JSON requests and multipart form uploads through the same API router.
$rawInput = file_get_contents('php://input');
$inputData = (isset($inputData) && is_array($inputData) && !empty($inputData))
    ? $inputData
    : (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') === 0
        ? $_POST
        : (json_decode($rawInput, true) ?? []));

// Sessions persist for 365 days (1 year) by default until manual logout
define('MAW_SESSION_COOKIE_LIFETIME', 365 * 24 * 60 * 60);
$requestedMode = $_GET['mode'] ?? '';

// Include Database Connection
require_once __DIR__ . '/connection.php';

// Helper function to send standard JSON response
function sendResponse($success, $message, $data = null, $code = 200) {
    global $con, $inputData, $requestedMode;

    // 1. Audit Trail Recording on Success
    if ($success && isset($con) && shouldAuditAdminAction($requestedMode ?? '')) {
        recordAdminAuditEvent($con, $requestedMode, is_array($inputData ?? null) ? $inputData : [], $data, $message);
    }
    // 2. Audit Trail Recording on Security-Sensitive Failures (Failed Login, Permission Denied)
    elseif (!$success && isset($con)) {
        if (in_array($requestedMode, ['admin-login', 'customer-login'], true)) {
            recordAdminAuditEvent($con, $requestedMode . '-failed', is_array($inputData ?? null) ? $inputData : [], null, "Failed login attempt: {$message}");
        } elseif ($code === 403 && shouldAuditAdminAction($requestedMode ?? '')) {
            recordAdminAuditEvent($con, $requestedMode . '-forbidden', is_array($inputData ?? null) ? $inputData : [], null, "Permission denied: {$message}");
        }
    }

    // 3. App Log Recording for API Errors & Warnings
    if (!$success && $code >= 400 && ($requestedMode ?? '') !== '') {
        $logContext = [
            'mode' => $requestedMode,
            'http_code' => $code,
            'ip' => getClientIpAddress(),
        ];
        if ($code >= 500) {
            appLog('ERROR', "[HTTP {$code}] {$requestedMode}: {$message}", $logContext);
        } else {
            // Skip routine 401 unauthenticated polls on initial page loads, but log real action failures
            $isRoutineAuthPoll = $code === 401 && in_array($requestedMode, ['admin-dashboard', 'customer-bootstrap'], true);
            if (!$isRoutineAuthPoll) {
                appLog('WARN', "[HTTP {$code}] {$requestedMode}: {$message}", $logContext);
            }
        }
    }

    // 4. Slow Request Detection (> 1.5 seconds)
    $elapsed = microtime(true) - MAW_REQUEST_START;
    if ($elapsed >= 1.5) {
        appLog('WARN', sprintf('Slow request [%.2fs] %s', $elapsed, $requestedMode ?? ''), [
            'elapsed_sec' => round($elapsed, 3),
            'mode' => $requestedMode ?? '',
        ]);
    }

    // Keep the browser's CSRF token synchronized with the active PHP session.
    if (!empty($_SESSION['admin_logged_in']) && !empty($_SESSION['csrf_token'])) {
        header('X-CSRF-Token: ' . $_SESSION['csrf_token']);
    }
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}

function requireAdminAuditSchema($con) {
    static $prepared = false;
    if ($prepared) return true;
    if (tableExists($con, 'admin_audit_log')) {
        $prepared = true;
        return true;
    }
    $sql = "CREATE TABLE IF NOT EXISTS `admin_audit_log` (
        `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        `action` VARCHAR(100) NOT NULL,
        `category` VARCHAR(50) NOT NULL DEFAULT 'System',
        `entity_type` VARCHAR(60) NULL,
        `entity_id` VARCHAR(80) NULL,
        `entity_label` VARCHAR(180) NULL,
        `description` VARCHAR(500) NOT NULL,
        `metadata_json` LONGTEXT NULL,
        `actor_id` INT NULL,
        `actor_name` VARCHAR(150) NULL,
        `actor_role` VARCHAR(60) NULL,
        `actor_source` VARCHAR(30) NULL,
        `ip_address` VARCHAR(45) NULL,
        `user_agent` VARCHAR(500) NULL,
        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_admin_audit_created` (`created_at`, `id`),
        KEY `idx_admin_audit_actor` (`actor_id`, `created_at`),
        KEY `idx_admin_audit_action` (`action`, `created_at`),
        KEY `idx_admin_audit_entity` (`entity_type`, `entity_id`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    if (!mysqli_query($con, $sql)) {
        error_log('MewahAutoWork Audit Warning: ' . mysqli_error($con));
        return false;
    }
    $prepared = true;
    return true;
}

function isSuperAdminSession() {
    return ($_SESSION['admin_source'] ?? '') === 'admin_users'
        && strtolower(trim(strval($_SESSION['admin_role'] ?? ''))) === 'superadmin';
}

function shouldAuditAdminAction($mode) {
    if (!$mode || $mode === 'admin-audit-trail' || $mode === 'admin-app-logs') return false;

    // Legacy mobile app / customer mutation endpoints
    if (in_array($mode, ['add-booking', 'add-vehicle', 'login'], true)) return true;

    // ERP middleware sync acknowledgments and status updates
    if (preg_match('/^sync-(ack|update|retry)-/', $mode) === 1) return true;

    // Workshop actions (floor & technicians)
    if (strpos($mode, 'workshop-') === 0) {
        if (in_array($mode, ['workshop-work-orders', 'workshop-parts', 'workshop-details'], true)) return false;
        return true;
    }

    // Customer portal write/mutation actions
    if (strpos($mode, 'customer-') === 0) {
        if (in_array($mode, [
            'customer-support-settings',
            'customer-bootstrap',
            'customer-bookings',
            'customer-vehicles',
            'customer-notifications',
            'customer-parts-orders',
            'customer-invoices',
            'customer-quotations',
            'customer-profile',
        ], true)) return false;
        return true;
    }

    // Explicit read-only Admin modes (do not audit read/list queries)
    $readOnlyAdminModes = [
        'admin-dashboard',
        'admin-audit-trail',
        'admin-app-logs',
        'admin-reports',
        'admin-customers',
        'admin-drivers',
        'admin-vehicles',
        'admin-companies',
        'admin-debtors',
        'admin-autocount-debtors',
        'admin-autocount-projects',
        'admin-suppliers',
        'admin-supplier-transactions',
        'admin-autocount-sync-health',
        'admin-staff',
        'admin-bookings',
        'admin-pending-bookings-alert',
        'admin-pending-vehicles-alert',
        'admin-stock-groups',
        'admin-item-detail',
        'admin-parts',
        'admin-purchase-order-options',
        'admin-purchase-orders',
        'admin-invoices',
        'admin-work-orders',
        'admin-quotations',
        'admin-notifications',
        'admin-settings',
        'admin-security-settings',
        'admin-permissions',
        'admin-roles',
        'admin-whatsapp-templates',
        'admin-whatsapp-logs',
        'admin-system-health',
        'admin-pending-sync-invoices',
        'admin-orders',
        'admin-get-work-order-invoice',
        'admin-get-work-order-part-requirements',
        'admin-get-work-order-quotation',
        'admin-invoice-work-orders',
        'admin-system-settings',
        'admin-unacknowledged-parts-alert',
        'admin-vehicle-search',
        'admin-vehicle-history',
        'admin-work-order-parts-overview',
    ];
    if (in_array($mode, $readOnlyAdminModes, true)) return false;

    // Specific administrative actions
    if (in_array($mode, [
        'admin-login',
        'admin-logout',
        'admin-acknowledge-work-order-parts',
        'admin-approve-work-order-quotation',
        'admin-reject-work-order-quotation',
        'admin-update-order-status',
        'admin-update-work-order-status',
        'admin-mewahtrans-queue-invoice',
        'admin-mewahtrans-retry-sync',
        'admin-autocount-retry-queue',
        'admin-batch-retry-autocount-invoice-sync',
        'admin-queue-autocount-invoice-sync',
        'admin-retry-autocount-invoice-sync',
        'admin-batch-queue-sync',
        'admin-send-whatsapp-message',
        'admin-save-whatsapp-template',
        'admin-send-push-notification',
        'admin-toggle-maintenance-mode',
        'admin-update-security-settings',
    ], true)) return true;

    // Audit all administrative mutation verbs
    return preg_match('/^admin-(login|logout|create|update|delete|save|issue|rollback|check-in|review|import|export|link|unlink|retry|record|void|submit|receive|cancel|send|queue|toggle|approve|reject|accept|decline|assign|generate|sync|bulk|batch|reset|restore|archive|pay|refund|settle|close|reopen|upload|verify|publish|acknowledge)-?/', $mode) === 1;
}

function auditCategoryForAction($action) {
    if (strpos($action, 'workshop-') === 0) return 'Workshop';
    if (strpos($action, 'customer-') === 0) return 'Customer Portal';
    if (strpos($action, 'work-order') !== false || strpos($action, 'booking') !== false || strpos($action, 'acknowledge') !== false || strpos($action, 'technician') !== false || strpos($action, 'check-in') !== false) return 'Workshop';
    if (strpos($action, 'part') !== false || strpos($action, 'purchase-order') !== false || strpos($action, 'supplier') !== false || strpos($action, 'stock') !== false || strpos($action, 'order-status') !== false || strpos($action, 'receive') !== false) return 'Inventory';
    if (strpos($action, 'invoice') !== false || strpos($action, 'quotation') !== false || strpos($action, 'payment') !== false || strpos($action, 'mewahtrans') !== false || strpos($action, 'pay') !== false || strpos($action, 'refund') !== false || strpos($action, 'settle') !== false) return 'Finance';
    if (strpos($action, 'staff') !== false || strpos($action, 'login') !== false || strpos($action, 'logout') !== false || strpos($action, 'password') !== false || strpos($action, 'security') !== false || strpos($action, 'settings') !== false || strpos($action, 'autocount') !== false || strpos($action, 'forbidden') !== false) return 'Security & Admin';
    if (strpos($action, 'customer') !== false || strpos($action, 'company') !== false || strpos($action, 'driver') !== false || strpos($action, 'vehicle') !== false || strpos($action, 'debtor') !== false || strpos($action, 'address') !== false) return 'Customer Data';
    if (strpos($action, 'notification') !== false || strpos($action, 'whatsapp') !== false || strpos($action, 'push') !== false || strpos($action, 'send') !== false) return 'Communication';
    return 'System';
}

function auditEntityForAction($action) {
    if ($action === 'workshop-upload-photo') return 'work-order-photo';
    if ($action === 'workshop-assign-technician') return 'work-order-assignment';
    if (in_array($action, ['workshop-add-part', 'workshop-remove-part', 'workshop-update-part-qty'], true)) return 'work-order-part';
    if ($action === 'workshop-update-status') return 'work-order';
    if ($action === 'admin-acknowledge-work-order-parts') return 'work-order-part';
    if ($action === 'customer-respond-quotation') return 'quotation';
    if (in_array($action, ['customer-login', 'customer-logout', 'customer-login-failed'], true)) return 'session';
    if ($action === 'customer-create-booking' || $action === 'customer-cancel-booking') return 'booking';
    if ($action === 'customer-create-vehicle') return 'vehicle';
    if ($action === 'customer-create-parts-order') return 'order';
    if ($action === 'customer-update-profile' || $action === 'customer-change-password') return 'customer';
    if (in_array($action, ['customer-save-delivery-address', 'customer-delete-delivery-address'], true)) return 'customer-address';
    foreach (['purchase-order', 'work-order', 'service-type', 'notification', 'whatsapp', 'quotation', 'invoice', 'booking', 'customer-address', 'customer', 'company', 'supplier', 'debtor', 'driver', 'vehicle', 'staff', 'part', 'order', 'settings'] as $entity) {
        if (strpos($action, $entity) !== false) return $entity;
    }
    return strpos($action, 'login') !== false || strpos($action, 'logout') !== false ? 'session' : 'system';
}

function auditSafeMetadata($value, $depth = 0) {
    if ($depth > 3) return '[nested]';
    if (!is_array($value)) {
        if (is_string($value)) return substr($value, 0, 500);
        return $value;
    }
    $safe = [];
    foreach ($value as $key => $item) {
        $lowerKey = strtolower(strval($key));
        if (in_array($lowerKey, ['password', 'secret', 'token', 'authorization', 'api_key', 'apikey', 'app_secret', 'pin'], true)) {
            $safe[$key] = '***REDACTED***';
            continue;
        }
        $safe[$key] = auditSafeMetadata($item, $depth + 1);
    }
    return $safe;
}

function recordAdminAuditEvent($con, $action, $requestData, $responseData, $responseMessage) {
    if (!requireAdminAuditSchema($con)) return;
    $isCustomerAction = strpos($action, 'customer-') === 0;
    $actorId = intval($isCustomerAction
        ? ($_SESSION['customer_user_id'] ?? 0)
        : ($_SESSION['admin_id'] ?? 0));
    $actorRole = '';
    $actorName = '';
    if ($isCustomerAction) {
        $actorRole = 'Customer';
        $actorName = trim(strval($_SESSION['customer_name'] ?? ''));
        if ($actorName === '' && $actorId > 0) {
            $customerSource = $_SESSION['customer_source'] ?? 'customer';
            $table = $customerSource === 'users' ? 'users' : (tableExists($con, 'customer') ? 'customer' : 'users');
            $nameCol = firstColumn($con, $table, ['full_name', 'name', 'display_name', 'username', 'email']);
            if ($nameCol) {
                $res = mysqli_query($con, "SELECT `$nameCol` AS actor_name FROM `$table` WHERE id = $actorId LIMIT 1");
                $row = $res ? mysqli_fetch_assoc($res) : null;
                $actorName = trim(strval($row['actor_name'] ?? ''));
            }
        }
        if ($actorName === '') $actorName = 'Customer #' . $actorId;
    } else {
        $actorRole = isSuperAdminSession() ? 'Super Admin' : currentAdminRoleName($con);
        $actorName = trim(strval($_SESSION['admin_name'] ?? $_SESSION['admin_username'] ?? ''));
        if ($actorName === '' && $actorId > 0 && ($_SESSION['admin_source'] ?? '') === 'admin_users') {
            $result = mysqli_query($con, "SELECT display_name, username FROM admin_users WHERE id = $actorId LIMIT 1");
            $row = $result ? mysqli_fetch_assoc($result) : null;
            $actorName = trim(strval($row['display_name'] ?? $row['username'] ?? ''));
        }
        if ($actorName === '' && $actorId > 0 && ($_SESSION['admin_source'] ?? '') === 'staff' && tableExists($con, 'staff')) {
            $columns = staffColumns($con);
            if ($columns['name']) {
                $result = mysqli_query($con, "SELECT `{$columns['name']}` AS actor_name FROM staff WHERE id = $actorId LIMIT 1");
                $row = $result ? mysqli_fetch_assoc($result) : null;
                $actorName = trim(strval($row['actor_name'] ?? ''));
            }
        }
    }
    $entityType = auditEntityForAction($action);
    $idKeys = [
        'workOrderId', 'jobId', 'work_order_id', 'bookingId', 'booking_id',
        'invoiceId', 'invoice_id', 'quotationId', 'quotation_id',
        'purchaseOrderId', 'purchase_order_id', 'poId',
        'staffId', 'staff_id', 'customerId', 'customer_id',
        'companyId', 'company_id', 'driverId', 'driver_id',
        'vehicleId', 'vehicle_id', 'partId', 'part_id',
        'orderId', 'order_id', 'debtorCode', 'id'
    ];
    $labelKeys = [
        'workOrderNo', 'work_order_no', 'invoiceNo', 'invoice_no',
        'quotationNo', 'quotation_no', 'poNo', 'internalRef', 'autocountPoNo',
        'name', 'title', 'companyName', 'company_name',
        'itemCode', 'sku', 'regNo', 'registrationNo', 'vehicleNo',
        'phone', 'email', 'debtorCode'
    ];
    $entityId = '';
    $entityLabel = '';
    foreach ($idKeys as $key) {
        if (isset($requestData[$key]) && strval($requestData[$key]) !== '') { $entityId = strval($requestData[$key]); break; }
        if (is_array($responseData) && isset($responseData[$key]) && strval($responseData[$key]) !== '') { $entityId = strval($responseData[$key]); break; }
    }
    foreach ($labelKeys as $key) {
        if (isset($requestData[$key]) && is_scalar($requestData[$key]) && trim(strval($requestData[$key])) !== '') { $entityLabel = trim(strval($requestData[$key])); break; }
        if (is_array($responseData) && isset($responseData[$key]) && is_scalar($responseData[$key]) && trim(strval($responseData[$key])) !== '') { $entityLabel = trim(strval($responseData[$key])); break; }
    }
    if ($entityLabel === '' && $entityId !== '' && intval($entityId) > 0) {
        $numId = intval($entityId);
        if ($entityType === 'work-order' || $entityType === 'job') {
            $jRes = mysqli_query($con, "SELECT j.work_order_no, cv.reg_no FROM job j LEFT JOIN customer_vehicle cv ON cv.id = j.vehicle_id WHERE j.id = $numId LIMIT 1");
            if ($jRes && ($jRow = mysqli_fetch_assoc($jRes))) {
                $entityLabel = $jRow['work_order_no'] ?: ('WO-' . $numId);
                if (!empty($jRow['reg_no'])) $entityLabel .= ' (' . $jRow['reg_no'] . ')';
            }
        } elseif ($entityType === 'quotation' && tableExists($con, 'work_order_quotation')) {
            $qRes = mysqli_query($con, "SELECT quotation_no FROM work_order_quotation WHERE id = $numId OR work_order_id = $numId LIMIT 1");
            if ($qRes && ($qRow = mysqli_fetch_assoc($qRes))) {
                $entityLabel = $qRow['quotation_no'] ?: ('QT-' . $numId);
            }
        } elseif ($entityType === 'invoice' && tableExists($con, 'work_order_invoice')) {
            $iRes = mysqli_query($con, "SELECT invoice_no FROM work_order_invoice WHERE id = $numId OR work_order_id = $numId LIMIT 1");
            if ($iRes && ($iRow = mysqli_fetch_assoc($iRes))) {
                $entityLabel = $iRow['invoice_no'] ?: ('INV-' . $numId);
            }
        } elseif ($entityType === 'vehicle' && tableExists($con, 'customer_vehicle')) {
            $vRes = mysqli_query($con, "SELECT reg_no FROM customer_vehicle WHERE id = $numId LIMIT 1");
            if ($vRes && ($vRow = mysqli_fetch_assoc($vRes))) {
                $entityLabel = $vRow['reg_no'] ?: ('Vehicle #' . $numId);
            }
        } elseif ($entityType === 'company' && tableExists($con, 'company')) {
            $cRes = mysqli_query($con, "SELECT name, autocount_debtor_code FROM company WHERE id = $numId LIMIT 1");
            if ($cRes && ($cRow = mysqli_fetch_assoc($cRes))) {
                $entityLabel = $cRow['name'] ?: ('Company #' . $numId);
            }
        } elseif ($entityType === 'purchase-order' && tableExists($con, 'purchase_order')) {
            $pRes = mysqli_query($con, "SELECT internal_ref, autocount_po_no FROM purchase_order WHERE id = $numId LIMIT 1");
            if ($pRes && ($pRow = mysqli_fetch_assoc($pRes))) {
                $entityLabel = $pRow['internal_ref'] ?: ($pRow['autocount_po_no'] ?: ('PO #' . $numId));
            }
        }
    }

    $readableAction = ucwords(str_replace('-', ' ', preg_replace('/^(admin-|workshop-|customer-)/', '', $action)));
    $metadata = json_encode(['request' => auditSafeMetadata($requestData)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($metadata === false || strlen($metadata) > 20000) $metadata = json_encode(['note' => 'Payload omitted because it was too large.']);
    $actorSourceVal = $isCustomerAction
        ? ('customer-' . ($_SESSION['customer_source'] ?? 'portal'))
        : strval($_SESSION['admin_source'] ?? 'admin_users');
    $values = [
        'action' => substr($action, 0, 100),
        'category' => auditCategoryForAction($action),
        'entityType' => substr($entityType, 0, 60),
        'entityId' => substr($entityId, 0, 80),
        'entityLabel' => substr($entityLabel, 0, 180),
        'description' => substr($readableAction . ($responseMessage ? ': ' . $responseMessage : ''), 0, 500),
        'metadata' => $metadata,
        'actorName' => substr($actorName ?: 'System', 0, 150),
        'actorRole' => substr($actorRole ?: 'Admin', 0, 60),
        'actorSource' => substr($actorSourceVal, 0, 30),
        'ip' => substr(strval(getClientIpAddress()), 0, 45),
        'userAgent' => substr(strval($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500)
    ];

    // Stream into server App Log (storage/logs/app-YYYY-MM.log)
    appLog('INFO', "[Audit] {$values['category']} - {$values['action']}: {$values['description']}", [
        'entity' => $values['entityType'],
        'entity_id' => $values['entityId'],
        'entity_label' => $values['entityLabel'],
        'actor_id' => $actorId,
        'actor_role' => $values['actorRole'],
        'actor_name' => $values['actorName'],
    ]);

    foreach ($values as $key => $value) $values[$key] = mysqli_real_escape_string($con, $value);
    mysqli_query($con, "INSERT INTO admin_audit_log (action, category, entity_type, entity_id, entity_label, description, metadata_json, actor_id, actor_name, actor_role, actor_source, ip_address, user_agent) VALUES ('{$values['action']}', '{$values['category']}', '{$values['entityType']}', " . ($values['entityId'] === '' ? 'NULL' : "'{$values['entityId']}'") . ", " . ($values['entityLabel'] === '' ? 'NULL' : "'{$values['entityLabel']}'") . ", '{$values['description']}', '{$values['metadata']}', " . ($actorId > 0 ? $actorId : 'NULL') . ", '{$values['actorName']}', '{$values['actorRole']}', '{$values['actorSource']}', " . ($values['ip'] === '' ? 'NULL' : "'{$values['ip']}'") . ", " . ($values['userAgent'] === '' ? 'NULL' : "'{$values['userAgent']}'") . ")");
}

// toAdminBookingStatus, normalizedWorkOrderPriority, parseMalaysiaBookingDateTime moved to modules/work_orders.php
function toAdminOrderStatus($status) {
    $map = [
        'pending' => 'Pending',
        'upcoming' => 'Processing',
        'in_progress' => 'Processing',
        'ready' => 'Shipped',
        'completed' => 'Delivered',
        'cancelled' => 'Cancelled'
    ];
    return $map[$status] ?? ucfirst(str_replace('_', ' ', $status));
}

// toAdminNotificationType moved to modules/settings.php
// fetchBookingItems moved to modules/work_orders.php
function tableExists($con, $table) {
    static $allTables = null;
    if ($allTables === null) {
        $allTables = [];
        $result = mysqli_query($con, "SHOW TABLES");
        if ($result) {
            while ($row = mysqli_fetch_row($result)) {
                if (isset($row[0])) {
                    $allTables[strtolower($row[0])] = true;
                }
            }
        }
    }
    return !empty($allTables[strtolower($table)]);
}

function columnExists($con, $table, $column) {
    static $tableColumnsCache = [];
    $tableLower = strtolower($table);
    $columnLower = strtolower($column);

    if (!isset($tableColumnsCache[$tableLower])) {
        $tableColumnsCache[$tableLower] = [];
        if (tableExists($con, $table)) {
            $safeTable = mysqli_real_escape_string($con, $table);
            $result = mysqli_query($con, "SHOW COLUMNS FROM `$safeTable`");
            if ($result) {
                while ($row = mysqli_fetch_assoc($result)) {
                    if (isset($row['Field'])) {
                        $tableColumnsCache[$tableLower][strtolower($row['Field'])] = true;
                    }
                }
            }
        }
    }

    return !empty($tableColumnsCache[$tableLower][$columnLower]);
}

function firstColumn($con, $table, $columns) {
    foreach ($columns as $column) {
        if (columnExists($con, $table, $column)) {
            return $column;
        }
    }
    return null;
}

function columnAcceptsNull($con, $table, $column) {
    if (!$column || !columnExists($con, $table, $column)) return true;
    $safeTable = mysqli_real_escape_string($con, $table);
    $safeColumn = mysqli_real_escape_string($con, $column);
    $result = mysqli_query($con, "SHOW COLUMNS FROM `$safeTable` LIKE '$safeColumn'");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    return !$row || strtoupper(strval($row['Null'] ?? 'YES')) === 'YES';
}

function ensureColumnAcceptsNull($con, $table, $column) {
    if (!$column || columnAcceptsNull($con, $table, $column)) return;
    $safeTable = mysqli_real_escape_string($con, $table);
    $safeColumn = mysqli_real_escape_string($con, $column);
    $result = mysqli_query($con, "SHOW COLUMNS FROM `$safeTable` LIKE '$safeColumn'");
    $row = $result ? mysqli_fetch_assoc($result) : null;
    $columnType = strval($row['Type'] ?? '');
    if ($columnType !== '' && preg_match('/^[a-z0-9(), ]+$/iD', $columnType) === 1) {
        mysqli_query($con, "ALTER TABLE `$safeTable` MODIFY COLUMN `$safeColumn` $columnType NULL");
    }
}

function rowValue($row, $columns, $fallback = '-') {
    foreach ($columns as $column) {
        if (isset($row[$column]) && $row[$column] !== '') {
            return $row[$column];
        }
    }
    return $fallback;
}

// staff helpers moved to modules/settings.php
// replaceJobAssignments moved to modules/work_orders.php
function countRows($con, $table, $where = '') {
    if (!tableExists($con, $table)) {
        return 0;
    }

    $query = "SELECT COUNT(*) AS total FROM `$table`" . ($where ? " WHERE $where" : "");
    $result = mysqli_query($con, $query);
    if (!$result) {
        return 0;
    }

    $row = mysqli_fetch_assoc($result);
    return intval($row['total'] ?? 0);
}

function companyExists($con, $companyId) {
    if ($companyId <= 0 || !tableExists($con, 'company')) {
        return false;
    }
    return countRows($con, 'company', 'id = ' . intval($companyId)) > 0;
}

function companyAssociationCount($con, $companyId, $table, $contactTable = null, $contactForeignKey = null) {
    if (!tableExists($con, $table)) {
        return 0;
    }

    $companyId = intval($companyId);
    if (columnExists($con, $table, 'company_id')) {
        return countRows($con, $table, "company_id = $companyId");
    }

    if (
        $contactTable &&
        $contactForeignKey &&
        tableExists($con, $contactTable) &&
        columnExists($con, $table, $contactForeignKey) &&
        columnExists($con, $contactTable, 'company_id')
    ) {
        $result = mysqli_query(
            $con,
            "SELECT COUNT(*) AS total
             FROM `$table` related
             INNER JOIN `$contactTable` contact ON contact.id = related.`$contactForeignKey`
             WHERE contact.company_id = $companyId"
        );
        $row = $result ? mysqli_fetch_assoc($result) : null;
        return intval($row['total'] ?? 0);
    }

    return 0;
}

function companyDependencyCounts($con, $companyId) {
    $users =
        companyAssociationCount($con, $companyId, 'customer') +
        companyAssociationCount($con, $companyId, 'users');
    $drivers = companyAssociationCount($con, $companyId, 'company_driver');
    $vehicles =
        companyAssociationCount($con, $companyId, 'customer_vehicle', 'customer', 'customer_id') +
        companyAssociationCount($con, $companyId, 'vehicles', 'users', 'user_id') +
        companyAssociationCount($con, $companyId, 'vehicle');
    $bookings =
        companyAssociationCount($con, $companyId, 'customer_appointment', 'customer', 'customer_id') +
        companyAssociationCount($con, $companyId, 'bookings', 'users', 'user_id') +
        companyAssociationCount($con, $companyId, 'orders', 'users', 'user_id') +
        companyAssociationCount($con, $companyId, 'parts_orders', 'users', 'user_id');
    $workOrders =
        companyAssociationCount($con, $companyId, 'job') +
        companyAssociationCount($con, $companyId, 'work_orders', 'users', 'user_id');
    $invoices =
        companyAssociationCount($con, $companyId, 'customer_invoice', 'customer', 'customer_id') +
        companyAssociationCount($con, $companyId, 'invoices', 'users', 'user_id') +
        companyAssociationCount($con, $companyId, 'accounting_invoice');
    $notifications =
        companyAssociationCount($con, $companyId, 'customer_notification', 'customer', 'customer_id') +
        companyAssociationCount($con, $companyId, 'notifications', 'users', 'user_id');
    $statements = companyAssociationCount($con, $companyId, 'customer_statement', 'customer', 'customer_id');

    return array_filter([
        'company users' => $users,
        'drivers' => $drivers,
        'vehicles' => $vehicles,
        'bookings/orders' => $bookings,
        'work orders' => $workOrders,
        'invoices' => $invoices,
        'notifications' => $notifications,
        'statements' => $statements
    ], function ($count) {
        return $count > 0;
    });
}

function companyDependencyMessage($dependencies) {
    $labels = [
        'company users' => ['company user', 'company users'],
        'drivers' => ['driver', 'drivers'],
        'vehicles' => ['vehicle', 'vehicles'],
        'bookings/orders' => ['booking/order', 'bookings/orders'],
        'work orders' => ['work order', 'work orders'],
        'invoices' => ['invoice', 'invoices'],
        'notifications' => ['notification', 'notifications'],
        'statements' => ['statement', 'statements']
    ];
    $summary = [];
    foreach ($dependencies as $label => $count) {
        $count = intval($count);
        $resolvedLabel = $labels[$label][$count === 1 ? 0 : 1] ?? $label;
        $summary[] = $count . ' ' . $resolvedLabel;
    }
    return 'Cannot delete this company because it has related records: '
        . implode(', ', $summary)
        . '. Transfer or delete those records first.';
}

function scalarQuery($con, $query, $field, $fallback = 0) {
    $result = mysqli_query($con, $query);
    if (!$result) {
        return $fallback;
    }

    $row = mysqli_fetch_assoc($result);
    return $row[$field] ?? $fallback;
}

function calculateChange($current, $previous) {
    if ($previous <= 0) {
        if ($current > 0) {
            return ['change' => '+100%', 'trend' => 'up'];
        }
        return ['change' => '0%', 'trend' => 'neutral'];
    }
    $diff = (($current - $previous) / $previous) * 100;
    if ($diff > 0) {
        return ['change' => '+' . round($diff, 1) . '%', 'trend' => 'up'];
    } elseif ($diff < 0) {
        return ['change' => round($diff, 1) . '%', 'trend' => 'down'];
    } else {
        return ['change' => '0%', 'trend' => 'neutral'];
    }
}

function malaysiaPhoneLocalDigits($phone) {
    $digits = preg_replace('/\D+/', '', strval($phone));
    if (strpos($digits, '0060') === 0) {
        $digits = substr($digits, 4);
    } elseif (strpos($digits, '60') === 0) {
        $digits = substr($digits, 2);
    } elseif (strpos($digits, '0') === 0) {
        $digits = substr($digits, 1);
    }
    return substr($digits, 0, 10);
}

function isValidMalaysiaPhone($phone) {
    $digits = malaysiaPhoneLocalDigits($phone);
    return preg_match('/^1(?:0|2|3|4|6|7|8|9)\d{7}$/', $digits) === 1
        || preg_match('/^1(?:1|5)\d{8}$/', $digits) === 1
        || preg_match('/^3\d{8}$/', $digits) === 1
        || preg_match('/^[4-79]\d{7}$/', $digits) === 1
        || preg_match('/^8[2-9]\d{6}$/', $digits) === 1;
}

function formatMalaysiaPhone($phone) {
    $digits = malaysiaPhoneLocalDigits($phone);
    if (!isValidMalaysiaPhone($phone)) {
        return trim(strval($phone));
    }

    if (strpos($digits, '1') === 0) {
        $prefix = substr($digits, 0, 2);
        $subscriber = substr($digits, 2);
        $firstGroupSize = in_array($prefix, ['11', '15'], true) ? 4 : 3;
    } elseif (strpos($digits, '8') === 0) {
        $prefix = substr($digits, 0, 2);
        $subscriber = substr($digits, 2);
        $firstGroupSize = 3;
    } else {
        $prefix = substr($digits, 0, 1);
        $subscriber = substr($digits, 1);
        $firstGroupSize = $prefix === '3' ? 4 : 3;
    }

    return '+60 ' . $prefix . '-' . substr($subscriber, 0, $firstGroupSize)
        . ' ' . substr($subscriber, $firstGroupSize);
}

function formatMalaysiaDeliveryAddresses($addresses) {
    if (!is_array($addresses)) {
        return [];
    }
    foreach ($addresses as &$address) {
        if (is_array($address) && isset($address['contactPhone'])) {
            $address['contactPhone'] = formatMalaysiaPhone($address['contactPhone']);
        }
    }
    unset($address);
    return $addresses;
}

function customerDeliveryAddressStorage($con, $auth) {
    $source = strval($auth['source'] ?? '');
    $userId = intval($auth['userId'] ?? 0);
    if (!in_array($source, ['customer', 'users'], true) || $userId <= 0 || !tableExists($con, $source)) {
        return null;
    }
    if (!columnExists($con, $source, 'delivery_addresses')) {
        ensureColumn($con, $source, 'delivery_addresses', 'LONGTEXT NULL');
    }
    return columnExists($con, $source, 'delivery_addresses')
        ? ['table' => $source, 'userId' => $userId]
        : null;
}

function customerDeliveryAddresses($con, $auth) {
    $storage = customerDeliveryAddressStorage($con, $auth);
    if (!$storage) return [];
    $table = $storage['table'];
    $userId = intval($storage['userId']);
    $raw = scalarQuery($con, "SELECT delivery_addresses FROM `$table` WHERE id = $userId LIMIT 1", 'delivery_addresses', '[]');
    $decoded = json_decode(strval($raw ?: '[]'), true);
    return formatMalaysiaDeliveryAddresses(is_array($decoded) ? $decoded : []);
}

function persistCustomerDeliveryAddresses($con, $auth, $addresses) {
    $storage = customerDeliveryAddressStorage($con, $auth);
    if (!$storage) return false;
    $table = $storage['table'];
    $userId = intval($storage['userId']);
    $json = json_encode(array_values($addresses), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return false;
    $jsonSql = mysqli_real_escape_string($con, $json);
    return mysqli_query($con, "UPDATE `$table` SET delivery_addresses = '$jsonSql' WHERE id = $userId") !== false;
}

function normalizeDeliveryAddressList($addresses) {
    if ($addresses === null || $addresses === '') return [];
    if (!is_array($addresses)) throw new RuntimeException('Delivery addresses must be a list.', 422);
    if (count($addresses) > 20) throw new RuntimeException('A maximum of 20 delivery addresses is allowed.', 422);
    $normalized = [];
    $seenIds = [];
    $defaultAssigned = false;
    foreach ($addresses as $address) {
        if (!is_array($address)) throw new RuntimeException('Each delivery address must be valid.', 422);
        $id = trim(strval($address['id'] ?? ''));
        if ($id === '') $id = 'addr-' . bin2hex(random_bytes(8));
        if (!preg_match('/^[A-Za-z0-9_-]{1,80}$/', $id) || isset($seenIds[$id])) {
            throw new RuntimeException('Each delivery address must have a unique valid identifier.', 422);
        }
        $contactName = trim(strval($address['contactName'] ?? ''));
        $addressText = trim(strval($address['address'] ?? ''));
        $contactPhone = trim(strval($address['contactPhone'] ?? ''));
        if ($contactName === '' || strlen($contactName) > 100) {
            throw new RuntimeException('Every delivery address requires a contact name of 100 characters or fewer.', 422);
        }
        if ($addressText === '' || strlen($addressText) > 500) {
            throw new RuntimeException('Every delivery address is required and must not exceed 500 characters.', 422);
        }
        if (!isValidMalaysiaPhone($contactPhone)) {
            throw new RuntimeException('Every delivery address requires a valid Malaysia phone number.', 422);
        }
        $isDefault = !empty($address['isDefault']) && !$defaultAssigned;
        if ($isDefault) $defaultAssigned = true;
        $seenIds[$id] = true;
        $normalized[] = [
            'id' => $id,
            'contactName' => $contactName,
            'address' => $addressText,
            'contactPhone' => formatMalaysiaPhone($contactPhone),
            'isDefault' => $isDefault
        ];
    }
    if (!$defaultAssigned && count($normalized) > 0) $normalized[0]['isDefault'] = true;
    return $normalized;
}

function normalizeEmailAddress($email) {
    $email = trim(strval($email));
    $atPosition = strrpos($email, '@');
    if ($atPosition === false) {
        return $email;
    }
    return substr($email, 0, $atPosition) . '@' . strtolower(substr($email, $atPosition + 1));
}

function isValidEmailAddress($email) {
    $email = normalizeEmailAddress($email);
    if ($email === '' || strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return false;
    }

    [$localPart, $domain] = explode('@', $email, 2);
    if (
        strlen($localPart) > 64 ||
        strpos($localPart, '..') !== false ||
        $localPart[0] === '.' ||
        substr($localPart, -1) === '.'
    ) {
        return false;
    }

    $domainParts = explode('.', $domain);
    $topLevelDomain = end($domainParts);
    return count($domainParts) >= 2
        && preg_match('/^[A-Za-z]{2,63}$/', $topLevelDomain) === 1;
}

function passwordValidationError($password, $label = 'Password') {
    $password = strval($password);
    $length = strlen($password);
    if ($length < 8) {
        return "$label must be at least 8 characters";
    }
    if ($length > 128) {
        return "$label must not exceed 128 characters";
    }
    if (preg_match('/^[\x21-\x7E]+$/D', $password) !== 1) {
        return "$label can only contain English letters, numbers, and symbols, without spaces or Chinese characters";
    }
    return null;
}

function companyUserTable($con) {
    if (tableExists($con, 'customer')) return 'customer';
    if (tableExists($con, 'users')) return 'users';
    return null;
}

function customerPasswordHash($con, $customerId) {
    $table = companyUserTable($con);
    if (!$table) {
        return '';
    }

    $passwordColumn = firstColumn($con, $table, ['password', 'password_hash']);
    if (!$passwordColumn) {
        return '';
    }

    $where = 'id = ' . intval($customerId);
    if ($table === 'users' && columnExists($con, 'users', 'role')) {
        $where .= " AND role = 'customer'";
    }
    $result = mysqli_query(
        $con,
        "SELECT `$passwordColumn` AS password_hash FROM `$table` WHERE $where LIMIT 1"
    );
    $row = $result ? mysqli_fetch_assoc($result) : null;
    return strval($row['password_hash'] ?? '');
}

function ensureColumn($con, $table, $column, $definition) {
    if (!tableExists($con, $table) || columnExists($con, $table, $column)) return true;
    if (!mysqli_query($con, "ALTER TABLE `$table` ADD COLUMN `$column` $definition")) {
        error_log("MewahAutoWork DB Warning: unable to add $table.$column: " . mysqli_error($con));
        return false;
    }
    return true;
}

function ensureSchema($con) {
    if (!tableExists($con, 'company')) {
        error_log("MewahAutoWork DB Warning: 'company' table is missing. Run migrations.");
    } else {
        ensureColumn($con, 'company', 'autocount_debtor_code', 'VARCHAR(40) NULL');
    }

    if (tableExists($con, 'customer') && !columnExists($con, 'customer', 'company_id')) {
        error_log("MewahAutoWork DB Warning: 'customer.company_id' column is missing. Run migrations.");
    }
    if (tableExists($con, 'users') && !columnExists($con, 'users', 'company_id')) {
        error_log("MewahAutoWork DB Warning: 'users.company_id' column is missing. Run migrations.");
    }

    $companyUserTable = tableExists($con, 'customer')
        ? 'customer'
        : (tableExists($con, 'users') ? 'users' : null);
    if ($companyUserTable) {
        ensureColumn($con, $companyUserTable, 'company_user_role', "VARCHAR(30) NOT NULL DEFAULT 'Company User'");
        ensureColumn($con, $companyUserTable, 'delivery_addresses', 'LONGTEXT NULL');
        ensureColumn($con, $companyUserTable, 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
    }

    mysqli_query(
        $con,
        "CREATE TABLE IF NOT EXISTS company_driver (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            name VARCHAR(150) NOT NULL,
            phone VARCHAR(30) NULL,
            licence_no VARCHAR(100) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Active',
            notes VARCHAR(500) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_company_driver_company_status (company_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (tableExists($con, 'customer_vehicle') && !columnExists($con, 'customer_vehicle', 'company_id')) {
        error_log("MewahAutoWork DB Warning: 'customer_vehicle.company_id' column is missing. Run migrations.");
    }
    if (tableExists($con, 'vehicles') && !columnExists($con, 'vehicles', 'company_id')) {
        error_log("MewahAutoWork DB Warning: 'vehicles.company_id' column is missing. Run migrations.");
    }

    $vehicleTable = tableExists($con, 'customer_vehicle')
        ? 'customer_vehicle'
        : (tableExists($con, 'vehicles') ? 'vehicles' : null);
    if ($vehicleTable) {
        ensureColumn($con, $vehicleTable, 'vehicle_status', "VARCHAR(30) NOT NULL DEFAULT 'Active'");
        ensureColumn($con, $vehicleTable, 'verification_status', "VARCHAR(30) NOT NULL DEFAULT 'approved'");
        ensureColumn($con, $vehicleTable, 'rejection_reason', 'VARCHAR(500) NULL');
        ensureColumn($con, $vehicleTable, 'reviewed_by', 'INT NULL');
        ensureColumn($con, $vehicleTable, 'reviewed_at', 'DATETIME NULL');
        ensureColumn($con, $vehicleTable, 'created_source', "VARCHAR(30) NOT NULL DEFAULT 'admin_panel'");
        ensureColumn($con, $vehicleTable, 'driver_profile_id', 'INT NULL');
        ensureColumn($con, $vehicleTable, 'autocount_project_no', 'VARCHAR(60) NULL');
        ensureColumn($con, $vehicleTable, 'autocount_sync_at', 'DATETIME NULL');
        if (columnExists($con, $vehicleTable, 'status')) {
            mysqli_query(
                $con,
                "UPDATE `$vehicleTable`
                 SET verification_status = 'pending', created_source = 'customer_app'
                 WHERE status = 'Pending Verification' AND verification_status = 'approved'"
            );
        }
        if (columnExists($con, $vehicleTable, 'vehicle_status')) {
            mysqli_query(
                $con,
                "UPDATE `$vehicleTable`
                 SET vehicle_status = 'Active'
                 WHERE vehicle_status IN ('approved', 'pending', 'rejected', '') OR vehicle_status IS NULL"
            );
        }
    }

    $bookingTable = tableExists($con, 'customer_appointment')
        ? 'customer_appointment'
        : (tableExists($con, 'bookings') ? 'bookings' : null);
    if ($bookingTable) {
        ensureColumn($con, $bookingTable, 'created_by_company_user_id', 'INT NULL');
        ensureColumn($con, $bookingTable, 'processing_at', 'DATETIME NULL');
        ensureColumn($con, $bookingTable, 'shipped_at', 'DATETIME NULL');
        ensureColumn($con, $bookingTable, 'delivered_at', 'DATETIME NULL');
        ensureColumn($con, $bookingTable, 'completed_at', 'DATETIME NULL');
    }
    if (tableExists($con, 'parts_orders')) {
        ensureColumn($con, 'parts_orders', 'processing_at', 'DATETIME NULL');
        ensureColumn($con, 'parts_orders', 'shipped_at', 'DATETIME NULL');
        ensureColumn($con, 'parts_orders', 'delivered_at', 'DATETIME NULL');
        ensureColumn($con, 'parts_orders', 'completed_at', 'DATETIME NULL');
    }

    if (tableExists($con, 'customer_notification')) {
        ensureColumn($con, 'customer_notification', 'company_id', 'INT NULL');
        ensureColumn($con, 'customer_notification', 'customer_id', 'INT NULL');
        ensureColumn($con, 'customer_notification', 'is_read', 'TINYINT(1) NOT NULL DEFAULT 0');
        ensureColumn($con, 'customer_notification', 'related_record_type', 'VARCHAR(40) NULL');
        ensureColumn($con, 'customer_notification', 'related_record_id', 'VARCHAR(50) NULL');
        ensureColumn($con, 'customer_notification', 'action_route', 'VARCHAR(255) NULL');
    }

    if (tableExists($con, 'staff')) {
        $staffIdentityColumn = firstColumn($con, 'staff', ['ic_no', 'ic_number', 'nric', 'identity_no', 'passport_no']);
        ensureColumnAcceptsNull($con, 'staff', $staffIdentityColumn);
        $staffDepartmentColumn = firstColumn($con, 'staff', ['department_id', 'dept_id']);
        ensureColumnAcceptsNull($con, 'staff', $staffDepartmentColumn);
        if (!firstColumn($con, 'staff', ['email', 'email_address'])) {
            ensureColumn($con, 'staff', 'email', 'VARCHAR(254) NULL');
        }
        if (!firstColumn($con, 'staff', ['phone', 'phone_no', 'mobile', 'hp_no', 'contact_no'])) {
            ensureColumn($con, 'staff', 'phone', 'VARCHAR(30) NULL');
        }
        if (!firstColumn($con, 'staff', ['role', 'position', 'type', 'designation', 'job_title', 'maw_role'])) {
            ensureColumn($con, 'staff', 'maw_role', "VARCHAR(40) NOT NULL DEFAULT 'Technician'");
        }
        if (!firstColumn($con, 'staff', ['status', 'active', 'is_active', 'current_status', 'currentStatus', 'maw_status'])) {
            ensureColumn($con, 'staff', 'maw_status', "VARCHAR(20) NOT NULL DEFAULT 'Active'");
        }
        if (!firstColumn($con, 'staff', ['password', 'password_hash'])) {
            ensureColumn($con, 'staff', 'password', 'VARCHAR(255) NULL');
        }
    }

    mysqli_query(
        $con,
        "CREATE TABLE IF NOT EXISTS autocount_stock_group (
            code VARCHAR(30) NOT NULL PRIMARY KEY,
            description VARCHAR(150) NOT NULL,
            item_type VARCHAR(20) NOT NULL DEFAULT 'other',
            sales_account VARCHAR(30) NULL,
            sales_discount_account VARCHAR(30) NULL,
            sales_return_account VARCHAR(30) NULL,
            purchase_account VARCHAR(30) NULL,
            purchase_discount_account VARCHAR(30) NULL,
            purchase_return_account VARCHAR(30) NULL,
            is_workshop_item TINYINT(1) NOT NULL DEFAULT 1,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_autocount_stock_group_type (item_type, is_workshop_item, is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $itemMasterTable = tableExists($con, 'parts')
        ? 'parts'
        : (tableExists($con, 'spare_parts') ? 'spare_parts' : null);
    if ($itemMasterTable) {
        ensureColumn($con, $itemMasterTable, 'autocount_item_group', 'VARCHAR(30) NULL');
        ensureColumn($con, $itemMasterTable, 'item_type', "VARCHAR(20) NOT NULL DEFAULT 'part'");
        ensureColumn($con, $itemMasterTable, 'tax_code', 'VARCHAR(30) NULL');
        ensureColumn($con, $itemMasterTable, 'is_stock_item', 'TINYINT(1) NOT NULL DEFAULT 1');
        ensureColumn($con, $itemMasterTable, 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
    }

    if (tableExists($con, 'job')) {
        ensureColumn($con, 'job', 'autocount_job_no', 'VARCHAR(60) NULL');
        ensureColumn($con, 'job', 'intake_type', "VARCHAR(20) NOT NULL DEFAULT 'booking'");
        ensureColumn($con, 'job', 'request_channel', 'VARCHAR(20) NULL');
        ensureColumn($con, 'job', 'requested_by_company_user_id', 'INT NULL');
        ensureColumn($con, 'job', 'brought_by_driver_id', 'INT NULL');
        ensureColumn($con, 'job', 'foreman_id', 'INT NULL');
        ensureColumn($con, 'job', 'checkin_mileage', 'INT UNSIGNED NULL');
        ensureColumn($con, 'job', 'parts_status', 'VARCHAR(32) NULL');
        ensureColumn($con, 'job', 'parts_expected_date', 'DATE NULL');
        ensureColumn($con, 'job', 'parts_reference', 'VARCHAR(120) NULL');
        ensureColumn($con, 'job', 'parts_notes', 'TEXT NULL');
        ensureColumn($con, 'job', 'parts_status_updated_at', 'DATETIME NULL');
        ensureColumn($con, 'job', 'parts_acknowledged_by', 'INT NULL');
        ensureColumn($con, 'job', 'parts_deducted_at', 'DATETIME NULL');
        ensureColumn($con, 'job', 'estimated_out', 'DATETIME NULL');
        if (columnExists($con, 'job', 'parts_ready_at')) {
            mysqli_query(
                $con,
                "UPDATE job
                 SET parts_status = 'parts_ready'
                 WHERE (parts_status IS NULL OR parts_status = '')
                   AND parts_ready_at IS NOT NULL"
            );
        }
    }

    mysqli_query(
        $con,
        "CREATE TABLE IF NOT EXISTS work_order_vehicle (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            work_order_id BIGINT NOT NULL,
            vehicle_id BIGINT NOT NULL,
            relationship VARCHAR(20) NOT NULL DEFAULT 'related',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_work_order_vehicle (work_order_id, vehicle_id),
            INDEX idx_work_order_vehicle_vehicle (vehicle_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    mysqli_query(
        $con,
        "CREATE TABLE IF NOT EXISTS autocount_sync_batch (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            source_file_name VARCHAR(255) NULL,
            source_sha256 CHAR(64) NULL UNIQUE,
            source_exported_at DATETIME NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'pending',
            row_count INT NOT NULL DEFAULT 0,
            error_count INT NOT NULL DEFAULT 0,
            started_at DATETIME NULL,
            completed_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    mysqli_query(
        $con,
        "CREATE TABLE IF NOT EXISTS accounting_invoice (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            source VARCHAR(24) NOT NULL DEFAULT 'autocount',
            external_invoice_no VARCHAR(60) NOT NULL,
            company_id INT NOT NULL,
            work_order_id BIGINT NULL,
            vehicle_id BIGINT NULL,
            external_job_no VARCHAR(60) NULL,
            vehicle_no_raw VARCHAR(150) NULL,
            invoice_date DATE NOT NULL,
            currency CHAR(3) NOT NULL DEFAULT 'MYR',
            total DECIMAL(14,2) NOT NULL DEFAULT 0,
            outstanding DECIMAL(14,2) NOT NULL DEFAULT 0,
            document_status VARCHAR(24) NOT NULL DEFAULT 'approved',
            e_invoice_status VARCHAR(24) NULL,
            e_invoice_uuid VARCHAR(120) NULL,
            summary_only TINYINT(1) NOT NULL DEFAULT 1,
            sync_batch_id BIGINT UNSIGNED NULL,
            source_updated_at DATETIME NULL,
            created_by INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_accounting_invoice_source_no (source, external_invoice_no),
            INDEX idx_accounting_invoice_company_date (company_id, invoice_date),
            INDEX idx_accounting_invoice_work_order (work_order_id),
            INDEX idx_accounting_invoice_vehicle (vehicle_id),
            INDEX idx_accounting_invoice_job (company_id, external_job_no),
            INDEX idx_accounting_invoice_status (document_status, outstanding)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    mysqli_query(
        $con,
        "CREATE TABLE IF NOT EXISTS accounting_invoice_item (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            invoice_id BIGINT UNSIGNED NOT NULL,
            line_no INT NOT NULL DEFAULT 0,
            item_code VARCHAR(80) NULL,
            description VARCHAR(500) NOT NULL,
            item_type VARCHAR(20) NOT NULL DEFAULT 'other',
            quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
            unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
            tax_code VARCHAR(30) NULL,
            tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
            tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
            amount DECIMAL(14,2) NOT NULL DEFAULT 0,
            UNIQUE KEY uq_accounting_invoice_line (invoice_id, line_no),
            CONSTRAINT fk_accounting_invoice_item_invoice FOREIGN KEY (invoice_id) REFERENCES accounting_invoice(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (tableExists($con, 'accounting_invoice_item')) {
        ensureColumn($con, 'accounting_invoice_item', 'tax_rate', 'DECIMAL(6,2) NOT NULL DEFAULT 0');
    }

    if (tableExists($con, 'work_order_invoice')) {
        ensureColumn($con, 'work_order_invoice', 'doc_type', "VARCHAR(20) NOT NULL DEFAULT 'INVOICE'");
        ensureColumn($con, 'work_order_invoice', 'autocount_do_no', 'VARCHAR(60) NULL');
        ensureColumn($con, 'work_order_invoice', 'internal_ref', 'VARCHAR(40) NULL');
        ensureColumn($con, 'work_order_invoice', 'autocount_job_no', 'VARCHAR(60) NULL');
        ensureColumn($con, 'work_order_invoice', 'debtor_code', 'VARCHAR(40) NULL');
        ensureColumn($con, 'work_order_invoice', 'vehicle_type', 'VARCHAR(100) NULL');
        ensureColumn($con, 'work_order_invoice', 'vehicle_no', 'VARCHAR(150) NULL');
        ensureColumn($con, 'work_order_invoice', 'credit_term_days', 'INT NOT NULL DEFAULT 30');
        ensureColumn($con, 'work_order_invoice', 'currency', "CHAR(3) NOT NULL DEFAULT 'MYR'");
        ensureColumn($con, 'work_order_invoice', 'sync_status', "VARCHAR(24) NOT NULL DEFAULT 'not_queued'");
        ensureColumn($con, 'work_order_invoice', 'sync_requested_at', 'DATETIME NULL');
        ensureColumn($con, 'work_order_invoice', 'synced_at', 'DATETIME NULL');
        ensureColumn($con, 'work_order_invoice', 'sync_error', 'TEXT NULL');
        ensureColumn($con, 'work_order_invoice', 'e_invoice_status', 'VARCHAR(24) NULL');
        ensureColumn($con, 'work_order_invoice', 'e_invoice_uuid', 'VARCHAR(120) NULL');
        ensureColumn($con, 'work_order_invoice', 'mewahtrans_sync_status', "VARCHAR(24) NOT NULL DEFAULT 'not_queued'");
        ensureColumn($con, 'work_order_invoice', 'mewahtrans_ref_no', 'VARCHAR(60) NULL');
        ensureColumn($con, 'work_order_invoice', 'mewahtrans_synced_at', 'DATETIME NULL');
        ensureColumn($con, 'work_order_invoice', 'mewahtrans_error', 'TEXT NULL');
        mysqli_query($con, "UPDATE work_order_invoice SET internal_ref = invoice_no WHERE internal_ref IS NULL AND invoice_no IS NOT NULL");
    }
    if (tableExists($con, 'work_order_invoice_item')) {
        ensureColumn($con, 'work_order_invoice_item', 'tax_code', 'VARCHAR(30) NULL');
        ensureColumn($con, 'work_order_invoice_item', 'tax_rate', 'DECIMAL(6,2) NOT NULL DEFAULT 0');
        ensureColumn($con, 'work_order_invoice_item', 'tax_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    }
    if (tableExists($con, 'work_order_invoice')) {
        mysqli_query($con, "CREATE TABLE IF NOT EXISTS autocount_invoice_sync_queue (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            invoice_id BIGINT UNSIGNED NOT NULL,
            operation VARCHAR(20) NOT NULL DEFAULT 'create',
            status VARCHAR(24) NOT NULL DEFAULT 'pending',
            attempt_count INT NOT NULL DEFAULT 0,
            locked_at DATETIME NULL,
            completed_at DATETIME NULL,
            error_message TEXT NULL,
            response_payload LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_autocount_invoice_queue_invoice_operation (invoice_id, operation),
            INDEX idx_autocount_invoice_queue_status (status, created_at),
            CONSTRAINT fk_autocount_invoice_queue_invoice FOREIGN KEY (invoice_id) REFERENCES work_order_invoice(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        mysqli_query($con, "CREATE TABLE IF NOT EXISTS mewahtrans_invoice_sync_queue (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            invoice_id BIGINT UNSIGNED NOT NULL,
            operation VARCHAR(20) NOT NULL DEFAULT 'create',
            status VARCHAR(24) NOT NULL DEFAULT 'pending',
            attempt_count INT NOT NULL DEFAULT 0,
            locked_at DATETIME NULL,
            completed_at DATETIME NULL,
            error_message TEXT NULL,
            response_payload LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_mewahtrans_invoice_queue_invoice_operation (invoice_id, operation),
            INDEX idx_mewahtrans_invoice_queue_status (status, created_at),
            CONSTRAINT fk_mewahtrans_invoice_queue_invoice FOREIGN KEY (invoice_id) REFERENCES work_order_invoice(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    mysqli_query($con, "CREATE TABLE IF NOT EXISTS purchase_order (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        internal_ref VARCHAR(40) NULL UNIQUE,
        autocount_po_no VARCHAR(60) NULL UNIQUE,
        work_order_id BIGINT NULL,
        supplier_code VARCHAR(40) NULL,
        supplier_name VARCHAR(150) NOT NULL,
        order_date DATE NOT NULL,
        estimated_arrival_date DATE NOT NULL,
        reminder_days INT NOT NULL DEFAULT 1,
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        currency CHAR(3) NOT NULL DEFAULT 'MYR',
        subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total DECIMAL(14,2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        sync_status VARCHAR(24) NOT NULL DEFAULT 'not_queued',
        sync_requested_at DATETIME NULL,
        synced_at DATETIME NULL,
        sync_error TEXT NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ordered_at DATETIME NULL,
        received_at DATETIME NULL,
        cancelled_at DATETIME NULL,
        INDEX idx_purchase_order_status_eta (status, estimated_arrival_date),
        INDEX idx_purchase_order_work_order (work_order_id),
        INDEX idx_purchase_order_sync (sync_status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    if (tableExists($con, 'purchase_order')) {
        mysqli_query($con, "CREATE TABLE IF NOT EXISTS purchase_order_item (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            purchase_order_id BIGINT UNSIGNED NOT NULL,
            part_id BIGINT NULL,
            item_code VARCHAR(80) NULL,
            description VARCHAR(500) NOT NULL,
            uom VARCHAR(30) NULL,
            quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
            received_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
            unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
            tax_code VARCHAR(30) NULL,
            tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
            tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
            amount DECIMAL(14,2) NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0,
            INDEX idx_purchase_order_item_order (purchase_order_id),
            INDEX idx_purchase_order_item_part (part_id),
            CONSTRAINT fk_purchase_order_item_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        mysqli_query($con, "CREATE TABLE IF NOT EXISTS autocount_purchase_order_sync_queue (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            purchase_order_id BIGINT UNSIGNED NOT NULL,
            operation VARCHAR(20) NOT NULL DEFAULT 'create',
            status VARCHAR(24) NOT NULL DEFAULT 'pending',
            attempt_count INT NOT NULL DEFAULT 0,
            locked_at DATETIME NULL,
            completed_at DATETIME NULL,
            error_message TEXT NULL,
            response_payload LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_autocount_po_queue_order_operation (purchase_order_id, operation),
            INDEX idx_autocount_po_queue_status (status, created_at),
            CONSTRAINT fk_autocount_po_queue_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        mysqli_query($con, "CREATE TABLE IF NOT EXISTS autocount_parts_order_sync_queue (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            order_id VARCHAR(60) NOT NULL,
            booking_id BIGINT UNSIGNED NULL,
            doc_type VARCHAR(20) NOT NULL DEFAULT 'DO',
            debtor_code VARCHAR(40) NULL,
            customer_name VARCHAR(150) NULL,
            delivery_address TEXT NULL,
            payload_json LONGTEXT NOT NULL,
            operation VARCHAR(20) NOT NULL DEFAULT 'create',
            status VARCHAR(24) NOT NULL DEFAULT 'pending',
            attempt_count INT NOT NULL DEFAULT 0,
            locked_at DATETIME NULL,
            completed_at DATETIME NULL,
            error_message TEXT NULL,
            response_payload LONGTEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_autocount_parts_order_queue (order_id, operation),
            INDEX idx_autocount_parts_order_queue_status (status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        if (tableExists($con, 'parts_orders')) {
            ensureColumn($con, 'parts_orders', 'autocount_do_no', 'VARCHAR(60) NULL');
            ensureColumn($con, 'parts_orders', 'autocount_sync_status', "VARCHAR(24) NOT NULL DEFAULT 'not_queued'");
            ensureColumn($con, 'parts_orders', 'autocount_sync_at', 'DATETIME NULL');
        }
        if (tableExists($con, 'bookings')) {
            ensureColumn($con, 'bookings', 'autocount_do_no', 'VARCHAR(60) NULL');
            ensureColumn($con, 'bookings', 'autocount_sync_status', "VARCHAR(24) NOT NULL DEFAULT 'not_queued'");
            ensureColumn($con, 'bookings', 'autocount_sync_at', 'DATETIME NULL');
        }
    }
}

function unifiedVehicleTable($con) {
    if (tableExists($con, 'customer_vehicle')) return 'customer_vehicle';
    if (tableExists($con, 'vehicles')) return 'vehicles';
    return null;
}

function normalizedVehicleIdentifier($value) {
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', trim(strval($value))));
}

function normalizedVehicleSql($column) {
    return "REPLACE(REPLACE(REPLACE(REPLACE(UPPER(TRIM(`$column`)), ' ', ''), '-', ''), '.', ''), '/', '')";
}

function validOptionalDate($value) {
    $value = trim(strval($value ?? ''));
    return $value === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value);
}

function unifiedVehicleDuplicateInfo($con, $table, $regNo, $vecNo, $companyId, $excludeId = 0) {
    $exclude = $excludeId > 0 ? ' AND id <> ' . intval($excludeId) : '';
    $regColumn = firstColumn($con, $table, ['reg_no', 'registration_no', 'plate_no']);
    $hasVStatus = columnExists($con, $table, 'verification_status');
    $hasCompany = columnExists($con, $table, 'company_id');
    $normalizedReg = mysqli_real_escape_string($con, normalizedVehicleIdentifier($regNo));
    if ($regColumn && $normalizedReg !== '') {
        $selectCols = "id" . ($hasVStatus ? ", verification_status" : "") . ($hasCompany ? ", company_id" : "");
        $result = mysqli_query(
            $con,
            "SELECT $selectCols FROM `$table` WHERE " . normalizedVehicleSql($regColumn) . " = '$normalizedReg'$exclude LIMIT 1"
        );
        if ($result && $row = mysqli_fetch_assoc($result)) {
            $vStatus = strtolower(trim(strval($row['verification_status'] ?? 'approved')));
            $vComp = intval($row['company_id'] ?? 0);
            return [
                'type' => 'registration',
                'id' => intval($row['id']),
                'verificationStatus' => $vStatus,
                'companyId' => $vComp,
                'isRejected' => ($vStatus === 'rejected'),
                'isSameCompany' => ($companyId > 0 && $vComp === intval($companyId)),
            ];
        }
    }

    $vecColumn = firstColumn($con, $table, ['vec_no', 'vehicle_no', 'unit_no']);
    $normalizedVec = mysqli_real_escape_string($con, normalizedVehicleIdentifier($vecNo));
    if ($vecColumn && $hasCompany && $normalizedVec !== '' && $companyId > 0) {
        $selectCols = "id" . ($hasVStatus ? ", verification_status" : "") . ", company_id";
        $result = mysqli_query(
            $con,
            "SELECT $selectCols FROM `$table` WHERE company_id = " . intval($companyId) .
            " AND " . normalizedVehicleSql($vecColumn) . " = '$normalizedVec'$exclude LIMIT 1"
        );
        if ($result && $row = mysqli_fetch_assoc($result)) {
            $vStatus = strtolower(trim(strval($row['verification_status'] ?? 'approved')));
            return [
                'type' => 'vehicle',
                'id' => intval($row['id']),
                'verificationStatus' => $vStatus,
                'companyId' => intval($row['company_id'] ?? 0),
                'isRejected' => ($vStatus === 'rejected'),
                'isSameCompany' => true,
            ];
        }
    }
    return null;
}

function unifiedVehicleDuplicate($con, $table, $regNo, $vecNo, $companyId, $excludeId = 0, $allowSameCompanyRejected = false) {
    $info = unifiedVehicleDuplicateInfo($con, $table, $regNo, $vecNo, $companyId, $excludeId);
    if (!$info) return null;
    if ($allowSameCompanyRejected && !empty($info['isRejected']) && !empty($info['isSameCompany'])) {
        return null;
    }
    return $info['type'];
}

function unifiedVehicleContact($con, $table, $companyId, $requestedId = 0, $allowFallback = true) {
    $isVehiclesTable = ($table === 'vehicles');
    $tablesToTry = $isVehiclesTable ? ['users', 'customer'] : ['customer', 'users'];
    foreach ($tablesToTry as $contactTable) {
        if (!tableExists($con, $contactTable)) continue;
        if ($requestedId > 0) {
            $where = 'id = ' . intval($requestedId);
            if ($companyId > 0 && columnExists($con, $contactTable, 'company_id')) {
                $where .= ' AND company_id = ' . intval($companyId);
            }
            $result = mysqli_query($con, "SELECT id FROM `$contactTable` WHERE $where LIMIT 1");
            if ($result && $row = mysqli_fetch_assoc($result)) return intval($row['id']);
        }
    }
    if (!$allowFallback) return 0;
    foreach ($tablesToTry as $contactTable) {
        if (!tableExists($con, $contactTable)) continue;
        $whereParts = [];
        if ($companyId > 0 && columnExists($con, $contactTable, 'company_id')) {
            $whereParts[] = 'company_id = ' . intval($companyId);
        }
        $fallbackWhere = count($whereParts) ? ' WHERE ' . implode(' AND ', $whereParts) : '';
        $result = mysqli_query($con, "SELECT id FROM `$contactTable`$fallbackWhere ORDER BY id LIMIT 1");
        $row = $result ? mysqli_fetch_assoc($result) : null;
        if ($row && intval($row['id'] ?? 0) > 0) {
            return intval($row['id']);
        }
    }
    if ($isVehiclesTable && tableExists($con, 'users')) {
        $result = mysqli_query($con, "SELECT id FROM `users` ORDER BY id LIMIT 1");
        $row = $result ? mysqli_fetch_assoc($result) : null;
        if ($row && intval($row['id'] ?? 0) > 0) {
            return intval($row['id']);
        }
    }
    return 0;
}

function unifiedVehicleDriver($con, $companyId, $requestedId = 0) {
    if ($requestedId <= 0 || $companyId <= 0 || !tableExists($con, 'company_driver')) return 0;
    $result = mysqli_query(
        $con,
        "SELECT id FROM company_driver
         WHERE id = " . intval($requestedId) . "
           AND company_id = " . intval($companyId) . "
           AND status = 'Active'
         LIMIT 1"
    );
    $row = $result ? mysqli_fetch_assoc($result) : null;
    return intval($row['id'] ?? 0);
}

function unifiedVehicleSqlValue($con, $value, $kind = 'string') {
    if ($kind === 'int') return strval(max(0, intval($value)));
    if ($kind === 'nullable-string') {
        $text = trim(strval($value ?? ''));
        return $text === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $text) . "'";
    }
    if ($kind === 'nullable-int') {
        $number = intval($value);
        return $number > 0 ? strval($number) : 'NULL';
    }
    if ($kind === 'date') {
        $date = trim(strval($value ?? ''));
        return $date === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $date) . "'";
    }
    if ($kind === 'date-time') {
        $dateTime = trim(strval($value ?? ''));
        return $dateTime === '' ? 'NULL' : "'" . mysqli_real_escape_string($con, $dateTime) . "'";
    }
    return "'" . mysqli_real_escape_string($con, trim(strval($value ?? ''))) . "'";
}

function normalizeVehicleText($value) {
    return trim(preg_replace('/\s+/', ' ', strval($value ?? '')));
}

function normalizeVehicleBrand($value) {
    $brand = normalizeVehicleText($value);
    if ($brand === '') return '';

    $canonicalBrands = [
        'Volvo Trucks', 'Scania', 'MAN', 'Mercedes-Benz Trucks', 'UD Trucks',
        'Hino', 'Isuzu', 'FUSO', 'Sinotruk / HOWO', 'Shacman',
        'Foton / Auman', 'Dongfeng', 'JAC', 'Hammar', 'Steelbro',
        'Swinglift', 'Combilift', 'Other'
    ];
    $aliases = [
        'nissan ud' => 'UD Trucks',
        'ud truck' => 'UD Trucks',
        'mitsubishi fuso' => 'FUSO',
        'fuso' => 'FUSO',
        'volvo' => 'Volvo Trucks',
        'mercedes-benz' => 'Mercedes-Benz Trucks',
        'mercedes benz' => 'Mercedes-Benz Trucks',
        'sinotruk/howo' => 'Sinotruk / HOWO',
        'sinotruk / howo' => 'Sinotruk / HOWO',
        'howo' => 'Sinotruk / HOWO',
        'foton' => 'Foton / Auman',
        'auman' => 'Foton / Auman',
        'foton auman' => 'Foton / Auman'
    ];
    $key = strtolower($brand);
    if (isset($aliases[$key])) return $aliases[$key];
    foreach ($canonicalBrands as $canonicalBrand) {
        if (strtolower($canonicalBrand) === $key) return $canonicalBrand;
    }
    return $brand;
}

function normalizeContainerFleetProfile($equipment, $containerLength = '') {
    $equipment = normalizeVehicleText($equipment);
    $containerLength = normalizeVehicleText($containerLength);
    $key = strtolower($equipment);
    $chassisMappings = [
        '20 ft trailer' => '20 ft',
        '20 ft container chassis' => '20 ft',
        '40 ft trailer' => '40 ft',
        "40's trailer" => '40 ft',
        '40 ft container chassis' => '40 ft',
        '45 ft container chassis' => '45 ft',
        '20/40 ft extendable container chassis' => '20/40 ft Extendable'
    ];
    if (isset($chassisMappings[$key])) {
        return [
            'equipment' => 'Container Chassis / Skeletal Trailer',
            'containerLength' => $containerLength !== '' ? $containerLength : $chassisMappings[$key]
        ];
    }
    if (in_array($key, ['sidelifter', 'side loader', 'side loader / sidelifter'], true)) {
        return [
            'equipment' => 'Side Loader / Sidelifter',
            'containerLength' => $containerLength
        ];
    }
    return [
        'equipment' => $equipment,
        'containerLength' => $containerLength
    ];
}

function logVehicleMileageRecord($con, $vehicleId, $mileage, $source = 'work_order_checkin', $refId = null, $refNo = null, $notes = null, $userId = null, $userName = null) {
    $vehicleId = intval($vehicleId);
    $mileage = intval($mileage);
    if ($vehicleId <= 0 || $mileage <= 0) return false;
    if (!tableExists($con, 'vehicle_mileage_log')) return false;

    // Check last recorded mileage to compute delta
    $prevRes = mysqli_query($con, "SELECT mileage FROM vehicle_mileage_log WHERE vehicle_id = $vehicleId ORDER BY created_at DESC, id DESC LIMIT 1");
    $prevMileage = ($prevRes && $pRow = mysqli_fetch_assoc($prevRes)) ? intval($pRow['mileage']) : 0;
    if ($prevMileage <= 0) {
        $vRes = mysqli_query($con, "SELECT mileage FROM customer_vehicle WHERE id = $vehicleId LIMIT 1");
        if ($vRes && $vRow = mysqli_fetch_assoc($vRes)) {
            $prevMileage = intval($vRow['mileage'] ?? 0);
        }
    }
    $delta = $prevMileage > 0 ? ($mileage - $prevMileage) : 0;

    $sourceSql = "'" . mysqli_real_escape_string($con, $source) . "'";
    $refIdSql = $refId ? intval($refId) : "NULL";
    $refNoSql = $refNo ? ("'" . mysqli_real_escape_string($con, strval($refNo)) . "'") : "NULL";
    
    $resolvedUserId = $userId ?: ($_SESSION['admin_id'] ?? ($_SESSION['user_id'] ?? null));
    $userIdSql = $resolvedUserId ? intval($resolvedUserId) : "NULL";

    $resolvedUserName = $userName ?: ($_SESSION['admin_name'] ?? ($_SESSION['user_name'] ?? null));
    $userNameSql = $resolvedUserName ? ("'" . mysqli_real_escape_string($con, strval($resolvedUserName)) . "'") : "NULL";

    $notesSql = $notes ? ("'" . mysqli_real_escape_string($con, strval($notes)) . "'") : "NULL";

    return mysqli_query($con, "INSERT INTO vehicle_mileage_log (vehicle_id, mileage, delta, source, reference_id, reference_no, recorded_by, recorded_by_name, notes, created_at)
        VALUES ($vehicleId, $mileage, $delta, $sourceSql, $refIdSql, $refNoSql, $userIdSql, $userNameSql, $notesSql, NOW())");
}

function saveUnifiedVehicle($con, $table, $data, $vehicleId = 0) {
    if (!isset($data['status'])) {
        $data['status'] = $data['vehicleStatus'] ?? ($data['verificationStatus'] ?? 'Active');
    }
    if (!isset($data['vehicleStatus'])) {
        $data['vehicleStatus'] = $data['status'] ?? 'Active';
    }
    $fieldCandidates = [
        'contactId' => $table === 'customer_vehicle'
            ? ['customer_id', 'user_id', 'owner_id', 'contact_id']
            : ['user_id', 'customer_id', 'owner_id', 'contact_id'],
        'driverId' => ['driver_profile_id', 'assigned_driver_id', 'driver_id'],
        'ownerName' => ['customer_name', 'owner_name'],
        'companyId' => ['company_id'],
        'vecNo' => ['vec_no', 'vehicle_no', 'unit_no', 'vehicle_number', 'fleet_no', 'no'],
        'regNo' => ['reg_no', 'registration_no', 'plate_no', 'car_plate', 'registration_number'],
        'equipment' => ['equipment', 'equipment_type', 'vehicle_type', 'type'],
        'brand' => ['brand', 'make', 'manufacturer'],
        'model' => ['model', 'series'],
        'year' => ['year', 'manufacture_year', 'manufactured_year'],
        'mileage' => ['mileage', 'current_mileage'],
        'chassisNo' => ['chassis_no', 'vin_no', 'vin', 'chassis_number'],
        'engineNo' => ['engine_no', 'engine_number'],
        'containerLength' => ['container_length'],
        'axleConfiguration' => ['axle_configuration'],
        'insurance' => ['insurance_expiry', 'insurance_date', 'insurance_expiry_date', 'insurance'],
        'roadTax' => ['road_tax_expiry', 'roadtax_expiry', 'road_tax_date', 'road_tax'],
        'puspakom' => ['puspakom_expiry', 'puspakom_date', 'puspakom'],
        'lastServiceDate' => ['last_service_date'],
        'lastServiceMileage' => ['last_service_mileage'],
        'nextServiceDate' => ['next_service_date', 'service_due_date'],
        'nextServiceMileage' => ['next_service_mileage', 'service_due_mileage'],
        'status' => ['status'],
        'vehicleStatus' => ['vehicle_status', 'operational_status'],
        'verificationStatus' => ['verification_status'],
        'rejectionReason' => ['rejection_reason'],
        'reviewedBy' => ['reviewed_by'],
        'reviewedAt' => ['reviewed_at'],
        'createdSource' => ['created_source'],
        'autocountProjectNo' => ['autocount_project_no', 'autocount_ref', 'autocount_project_code'],
        'autocountSyncAt' => ['autocount_sync_at']
    ];
    $requiredWhenProvided = [
        'contactId', 'driverId', 'companyId', 'regNo', 'equipment', 'brand', 'model',
        'year', 'mileage', 'chassisNo', 'engineNo', 'containerLength',
        'axleConfiguration', 'insurance', 'roadTax', 'puspakom', 'vehicleStatus',
        'lastServiceDate', 'lastServiceMileage', 'nextServiceDate', 'nextServiceMileage',
        'verificationStatus', 'rejectionReason', 'reviewedBy', 'reviewedAt', 'createdSource'
    ];
    $kinds = [
        'contactId' => 'int',
        'driverId' => 'nullable-int',
        'companyId' => 'int',
        'vecNo' => 'nullable-string',
        'year' => 'int',
        'mileage' => 'int',
        'containerLength' => 'nullable-string',
        'axleConfiguration' => 'nullable-string',
        'insurance' => 'date',
        'roadTax' => 'date',
        'puspakom' => 'date',
        'lastServiceDate' => 'date',
        'lastServiceMileage' => 'nullable-int',
        'nextServiceDate' => 'date',
        'nextServiceMileage' => 'nullable-int',
        'reviewedBy' => 'nullable-int',
        'reviewedAt' => 'date-time',
        'autocountProjectNo' => 'nullable-string',
        'autocountSyncAt' => 'date-time'
    ];
    $fields = [];
    $missingFields = [];
    foreach ($fieldCandidates as $key => $candidates) {
        if (!array_key_exists($key, $data)) continue;
        $column = firstColumn($con, $table, $candidates);
        if (!$column) {
            if (in_array($key, $requiredWhenProvided, true)) $missingFields[] = $key;
            continue;
        }
        $kind = $kinds[$key] ?? 'string';
        $val = $data[$key];
        if (!columnAcceptsNull($con, $table, $column) && ($val === null || $val === '')) {
            if ($kind === 'int' || $kind === 'nullable-int') {
                $fields[$column] = '0';
            } elseif ($kind === 'date' || $kind === 'date-time') {
                $fields[$column] = "'1970-01-01'";
            } else {
                $fields[$column] = "''";
            }
        } else {
            $fields[$column] = unifiedVehicleSqlValue($con, $val, $kind);
        }
    }
    if ($missingFields) {
        sendResponse(
            false,
            'Vehicle storage schema is incomplete. Missing fields: ' . implode(', ', $missingFields) .
                '. Apply the latest vehicle profile migration before saving.',
            null,
            409
        );
    }
    if (!$fields) return false;

    if ($vehicleId > 0) {
        $updates = [];
        foreach ($fields as $column => $value) $updates[] = "`$column` = $value";
        $saved = mysqli_query($con, "UPDATE `$table` SET " . implode(', ', $updates) . ' WHERE id = ' . intval($vehicleId));
        if ($saved && !empty($data['mileage']) && intval($data['mileage']) > 0) {
            logVehicleMileageRecord($con, $vehicleId, intval($data['mileage']), 'vehicle_profile', $vehicleId, $data['regNo'] ?? '', 'Vehicle profile odometer update');
        }
        return $saved;
    }

    // Auto-fill any unassigned NOT NULL columns on INSERT to satisfy MySQL strict mode
    $safeTable = mysqli_real_escape_string($con, $table);
    $colRes = mysqli_query($con, "SHOW COLUMNS FROM `$safeTable`");
    while ($colRes && $cRow = mysqli_fetch_assoc($colRes)) {
        $colName = $cRow['Field'];
        if (isset($fields[$colName])) continue;
        $extra = strtolower($cRow['Extra'] ?? '');
        if (strpos($extra, 'auto_increment') !== false) continue;
        $isNull = strtoupper($cRow['Null'] ?? '') === 'YES';
        $hasDefault = $cRow['Default'] !== null;
        if (!$isNull && !$hasDefault) {
            $cType = strtolower($cRow['Type'] ?? '');
            if (in_array($colName, ['equipment', 'equipment_type', 'vehicle_type', 'type'], true)) {
                $fields[$colName] = "'" . mysqli_real_escape_string($con, $data['equipment'] ?? '') . "'";
            } elseif (in_array($colName, ['status', 'vehicle_status', 'operational_status'], true)) {
                $fields[$colName] = "'" . mysqli_real_escape_string($con, $data['status'] ?? $data['vehicleStatus'] ?? 'Active') . "'";
            } elseif (in_array($colName, ['verification_status'], true)) {
                $fields[$colName] = "'" . mysqli_real_escape_string($con, $data['verificationStatus'] ?? 'pending') . "'";
            } elseif (in_array($colName, ['created_source'], true)) {
                $fields[$colName] = "'" . mysqli_real_escape_string($con, $data['createdSource'] ?? 'customer_app') . "'";
            } elseif (strpos($cType, 'int') !== false || strpos($cType, 'decimal') !== false || strpos($cType, 'float') !== false) {
                $fields[$colName] = '0';
            } elseif (strpos($cType, 'date') !== false || strpos($cType, 'time') !== false) {
                $fields[$colName] = "'1970-01-01'";
            } else {
                $fields[$colName] = "''";
            }
        }
    }

    $columns = array_map(function ($column) { return "`$column`"; }, array_keys($fields));
    $inserted = mysqli_query(
        $con,
        "INSERT INTO `$table` (" . implode(', ', $columns) . ') VALUES (' . implode(', ', array_values($fields)) . ')'
    );
    if ($inserted) {
        $newId = mysqli_insert_id($con);
        if ($newId > 0 && !empty($data['mileage']) && intval($data['mileage']) > 0) {
            logVehicleMileageRecord($con, $newId, intval($data['mileage']), 'vehicle_created', $newId, $data['regNo'] ?? '', 'Initial vehicle registration mileage');
        }
    }
    return $inserted;
}

// syncVehicleMileageFromCheckin, syncVehicleLastServiceFromWorkOrder moved to modules/work_orders.php
// vehicle/customer notification helpers moved to modules/settings.php
// bookingNotificationTarget, notifyBookingCustomer, adminBookingScheduleSnapshot, bookingScheduleChangeMessage, legacyBookings, pendingAdminBookingCount, saveAdminBooking, deleteAdminBooking, normalizedBookingLifecycleStatus, updateAdminBookingStatus, checkInBookingAndCreateWorkOrder moved to modules/work_orders.php
// legacyInvoices & updateAdminInvoiceStatus moved to modules/invoices.php
// analytics helpers moved to modules/analytics.php
// legacyNotifications moved to modules/settings.php
function getCanonicalStatusSql($con = null, $tableAlias = '') {
    $prefix = preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', strval($tableAlias))
        ? strval($tableAlias) . '.'
        : '';
    $quotationClause = $con && columnExists($con, 'job', 'quotation_issued_at')
        ? "WHEN {$prefix}quotation_issued_at IS NOT NULL AND {$prefix}quotation_issued_at > '1970-01-01 00:00:00' THEN 'quotation_issued'"
        : '';
    $underRepairClause = $con && columnExists($con, 'job', 'under_repair_at')
        ? "WHEN {$prefix}under_repair_at IS NOT NULL AND {$prefix}under_repair_at > '1970-01-01 00:00:00' THEN 'under_repair'"
        : '';
    $partsReadyClause = $con && columnExists($con, 'job', 'parts_ready_at')
        ? "WHEN {$prefix}parts_ready_at IS NOT NULL AND {$prefix}parts_ready_at > '1970-01-01 00:00:00' THEN 'parts_ready'"
        : '';
    $pendingPartsClause = $con && columnExists($con, 'job', 'parts_status')
        ? "WHEN {$prefix}approved_at IS NOT NULL AND {$prefix}approved_at > '1970-01-01 00:00:00' AND {$prefix}parts_status IN ('pending_parts', 'partially_arrived') THEN 'pending_parts'"
        : '';
    return "CASE 
        WHEN {$prefix}collected_at IS NOT NULL AND {$prefix}collected_at > '1970-01-01 00:00:00' THEN 'collected'
        WHEN {$prefix}completed_at IS NOT NULL AND {$prefix}completed_at > '1970-01-01 00:00:00' THEN 'ready_for_collection'
        $underRepairClause
        WHEN {$prefix}approved_at IS NOT NULL AND {$prefix}approved_at > '1970-01-01 00:00:00' AND {$prefix}status = 6 THEN 'under_repair'
        $partsReadyClause
        WHEN {$prefix}approved_at IS NOT NULL AND {$prefix}approved_at > '1970-01-01 00:00:00' AND {$prefix}status = 5 AND {$prefix}parts_status = 'parts_ready' THEN 'parts_ready'
        $pendingPartsClause
        WHEN {$prefix}approved_at IS NOT NULL AND {$prefix}approved_at > '1970-01-01 00:00:00' THEN 'approved'
        $quotationClause
        WHEN {$prefix}inspected_at IS NOT NULL AND {$prefix}inspected_at > '1970-01-01 00:00:00' THEN 'inspected'
        WHEN {$prefix}checkin_at IS NOT NULL AND {$prefix}checkin_at > '1970-01-01 00:00:00' THEN 'checked_in'
        WHEN {$prefix}status = 1 AND ({$prefix}checkin_at IS NULL OR {$prefix}checkin_at <= '1970-01-01 00:00:00') THEN 'scheduled'
        ELSE 'unknown'
    END";
}

function deriveCanonicalStatus($row) {
    $rawStatusStr = strtolower(trim(strval($row['status'] ?? '')));
    if ($rawStatusStr === 'cancelled' || $rawStatusStr === 'canceled') return 'cancelled';
    $status = intval($row['status'] ?? 0);
    if ($status === 0 && ($rawStatusStr === '0' || $rawStatusStr === 'cancelled')) return 'cancelled';

    $checkin = !empty($row['checkin_at']) && $row['checkin_at'] !== '0000-00-00 00:00:00' ? $row['checkin_at'] : null;
    $inspected = !empty($row['inspected_at']) && $row['inspected_at'] !== '0000-00-00 00:00:00' ? $row['inspected_at'] : null;
    $quotationIssued = !empty($row['quotation_issued_at']) && $row['quotation_issued_at'] !== '0000-00-00 00:00:00' ? $row['quotation_issued_at'] : null;
    $approved = !empty($row['approved_at']) && $row['approved_at'] !== '0000-00-00 00:00:00' ? $row['approved_at'] : null;
    $partsReady = !empty($row['parts_ready_at']) && $row['parts_ready_at'] !== '0000-00-00 00:00:00' ? $row['parts_ready_at'] : null;
    $underRepair = !empty($row['under_repair_at']) && $row['under_repair_at'] !== '0000-00-00 00:00:00' ? $row['under_repair_at'] : null;
    $completed = !empty($row['completed_at']) && $row['completed_at'] !== '0000-00-00 00:00:00' ? $row['completed_at'] : null;
    $collected = !empty($row['collected_at']) && $row['collected_at'] !== '0000-00-00 00:00:00' ? $row['collected_at'] : null;

    if ($collected || $status === 9) return 'collected';
    if ($completed || $status === 8) return 'ready_for_collection';
    // The legacy job schema stores both Ready for Collection and Collected as
    // status 10. Their lifecycle timestamps disambiguate them above. A bare 10
    // is therefore a legacy completed record, never a cancelled record.
    if ($status === 10) return 'collected';
    if ($underRepair || $status === 7 || $status === 6) return 'under_repair';
    if ($partsReady || ($status === 5 && strval($row['parts_status'] ?? '') === 'parts_ready')) return 'parts_ready';
    if ($approved || $status === 4 || $status === 5) {
        $partsStatus = strtolower(trim(strval($row['parts_status'] ?? '')));
        if (in_array($partsStatus, ['pending_parts', 'partially_arrived'], true)) {
            return 'pending_parts';
        }
        return 'approved';
    }
    if ($quotationIssued) return 'quotation_issued';
    if ($inspected || $status === 3) return 'inspected';
    if ($checkin || $status === 2) return 'checked_in';
    if ($status === 1) return 'scheduled';

    return $rawStatusStr === 'cancelled' ? 'cancelled' : 'checked_in';
}

function verifyCsrfToken($inputData) {
    if (php_sapi_name() === 'cli') return;
    $headers = getallheaders();
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $headers['X-CSRF-Token'] ?? $headers['x-csrf-token'] ?? $inputData['csrfToken'] ?? '';
    
    if (empty($token) || empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
        sendResponse(false, 'Invalid or missing CSRF token', null, 403);
    }
}

function checkPermission($con, $action) {
    if (php_sapi_name() === 'cli') return;
    if (session_status() == PHP_SESSION_NONE) {
        session_start();
    }
    if (empty($_SESSION['admin_id']) || empty($_SESSION['admin_role'])) {
        sendResponse(false, 'Unauthorized admin access. Please login.', null, 401);
    }

    $role = currentAdminRoleName($con);
    $sessionRole = strtolower(trim(strval($_SESSION['admin_role'] ?? '')));

    if (
        in_array(strtolower($role), ['admin', 'super admin', 'superadmin'], true) ||
        in_array($sessionRole, ['admin', 'superadmin'], true) ||
        isSuperAdminSession()
    ) {
        return;
    }

    $commonPermissions = [
        'admin-logout',
        'admin-dashboard',
        'admin-notifications',
        'admin-unacknowledged-parts-alert',
        'admin-vehicle-search',
        'admin-vehicle-history',
        'admin-acknowledge-work-order-parts',
        'admin-work-order-photos',
        'admin-upload-work-order-photo',
        'admin-delete-work-order-photo',
        'admin-get-work-order-quotation',
        'admin-get-work-order-invoice',
        'admin-work-order-parts-overview',
        'admin-get-work-order-part-requirements',
        'admin-autocount-projects'
    ];

    $rolePermissions = [
        'Head Manager' => array_merge($commonPermissions, [
            'admin-work-orders', 'admin-create-work-order', 'admin-update-work-order', 'admin-rollback-work-order',
            'admin-save-work-order-quotation', 'admin-issue-work-order-quotation', 'admin-approve-work-order-quotation',
            'admin-save-work-order-part-requirements',
            'admin-parts', 'admin-update-part', 'admin-item-detail', 'admin-stock-groups',
            'admin-vehicles', 'admin-pending-vehicles-alert', 'admin-update-vehicle', 'admin-review-vehicle', 'admin-review-vehicle-document', 'admin-upload-vehicle-document', 'admin-delete-vehicle-document',
            'admin-bookings', 'admin-pending-bookings-alert', 'admin-create-booking', 'admin-update-booking', 'admin-check-in-booking',
            'admin-companies', 'admin-update-company',
            'admin-customers', 'admin-update-customer',
            'admin-drivers', 'admin-update-driver',
            'admin-suppliers', 'admin-supplier-transactions',
            'admin-parts-orders', 'admin-batch-sync-parts-orders', 'admin-debtors',
            'admin-invoices', 'admin-save-work-order-invoice', 'admin-issue-work-order-invoice', 'admin-record-work-order-invoice-payment', 'admin-link-autocount-invoice', 'admin-retry-autocount-invoice-sync', 'admin-batch-retry-autocount-invoice-sync',
            'admin-staff', 'admin-create-staff', 'admin-update-staff', 'admin-delete-staff'
        ]),
        'Manager' => array_merge($commonPermissions, [
            'admin-work-orders', 'admin-create-work-order', 'admin-update-work-order', 'admin-rollback-work-order',
            'admin-save-work-order-quotation', 'admin-issue-work-order-quotation', 'admin-approve-work-order-quotation',
            'admin-save-work-order-part-requirements',
            'admin-parts', 'admin-update-part', 'admin-item-detail', 'admin-stock-groups',
            'admin-vehicles', 'admin-pending-vehicles-alert', 'admin-update-vehicle', 'admin-review-vehicle', 'admin-review-vehicle-document', 'admin-upload-vehicle-document', 'admin-delete-vehicle-document',
            'admin-bookings', 'admin-pending-bookings-alert', 'admin-create-booking', 'admin-update-booking', 'admin-check-in-booking',
            'admin-companies', 'admin-update-company',
            'admin-customers', 'admin-update-customer',
            'admin-drivers', 'admin-update-driver',
            'admin-suppliers', 'admin-supplier-transactions',
            'admin-purchase-orders', 'admin-save-purchase-order', 'admin-submit-purchase-order', 'admin-retry-purchase-order-sync', 'admin-receive-purchase-order', 'admin-cancel-purchase-order',
            'admin-parts-orders', 'admin-batch-sync-parts-orders', 'admin-debtors',
            'admin-invoices', 'admin-save-work-order-invoice', 'admin-issue-work-order-invoice', 'admin-record-work-order-invoice-payment', 'admin-link-autocount-invoice', 'admin-retry-autocount-invoice-sync', 'admin-batch-retry-autocount-invoice-sync',
            'admin-staff', 'admin-create-staff', 'admin-update-staff', 'admin-delete-staff'
        ]),
        'Service Advisor' => array_merge($commonPermissions, [
            'admin-work-orders', 'admin-create-work-order', 'admin-update-work-order', 'admin-rollback-work-order',
            'admin-save-work-order-quotation', 'admin-issue-work-order-quotation', 'admin-approve-work-order-quotation',
            'admin-save-work-order-part-requirements',
            'admin-parts', 'admin-item-detail', 'admin-stock-groups',
            'admin-vehicles', 'admin-pending-vehicles-alert', 'admin-update-vehicle',
            'admin-bookings', 'admin-pending-bookings-alert', 'admin-create-booking', 'admin-update-booking', 'admin-check-in-booking',
            'admin-companies', 'admin-customers', 'admin-drivers',
            'admin-invoices', 'admin-save-work-order-invoice', 'admin-issue-work-order-invoice', 'admin-record-work-order-invoice-payment'
        ]),
        'Receptionist' => array_merge($commonPermissions, [
            'admin-work-orders', 'admin-create-work-order', 'admin-vehicles', 'admin-pending-vehicles-alert',
            'admin-bookings', 'admin-pending-bookings-alert', 'admin-create-booking', 'admin-update-booking', 'admin-check-in-booking',
            'admin-companies', 'admin-drivers', 'admin-customers'
        ]),
        'Foreman' => array_merge($commonPermissions, [
            'admin-work-orders', 'admin-create-work-order', 'admin-update-work-order',
            'admin-vehicles', 'admin-pending-vehicles-alert',
            'admin-bookings', 'admin-pending-bookings-alert', 'admin-check-in-booking',
            'admin-parts', 'admin-item-detail', 'admin-stock-groups',
            'admin-companies', 'admin-drivers', 'admin-customers'
        ]),
        'Technician' => array_merge($commonPermissions, [
            'admin-work-orders', 'admin-update-work-order',
            'admin-vehicles',
            'admin-parts', 'admin-item-detail', 'admin-stock-groups'
        ])
    ];

    if (!empty($action) && !in_array($action, $rolePermissions[$role] ?? $commonPermissions, true)) {
        sendResponse(false, 'Forbidden: Your role does not have permission for this action.', null, 403);
    }
}

function requireCustomerSession($con = null) {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $userId = intval($_SESSION['customer_user_id'] ?? 0);
    $companyId = intval($_SESSION['customer_company_id'] ?? 0);
    $source = $_SESSION['customer_source'] ?? '';
    $isSuperadmin = !empty($_SESSION['customer_is_superadmin']);
    if (
        $userId <= 0 ||
        (!$isSuperadmin && $companyId <= 0) ||
        !in_array($source, ['customer', 'users', 'admin_users'], true)
    ) {
        sendResponse(false, 'Unauthenticated. Please sign in.', null, 401);
    }
    if (!$isSuperadmin && $con && in_array($source, ['customer', 'users'], true) && tableExists($con, $source) && columnExists($con, $source, 'is_active')) {
        $activeResult = mysqli_query($con, "SELECT is_active FROM `$source` WHERE id = $userId LIMIT 1");
        $activeUser = $activeResult ? mysqli_fetch_assoc($activeResult) : null;
        if (!$activeUser || !boolval($activeUser['is_active'])) {
            $_SESSION = [];
            session_destroy();
            sendResponse(false, 'Customer account is inactive.', null, 403);
        }
    }
    return [
        'userId' => $userId,
        'companyId' => $companyId,
        'source' => $source,
        'isSuperadmin' => $isSuperadmin
    ];
}

// requireWorkOrderPhotoSchema, workOrderPhotoPayload, workOrderPhotoMap, workshopCanAccessWorkOrder, streamWorkOrderPhoto moved to modules/work_orders.php
function requireAutoCountSyncToken() {
    $expected = trim(strval(getenv('MAW_AUTOCOUNT_SYNC_TOKEN') ?: ''));
    if ($expected === '') sendResponse(false, 'AutoCount sync token is not configured.', null, 503);
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $provided = trim(strval($_SERVER['HTTP_X_SYNC_TOKEN'] ?? $headers['X-Sync-Token'] ?? $headers['x-sync-token'] ?? ''));
    $authorization = trim(strval($_SERVER['HTTP_AUTHORIZATION'] ?? $headers['Authorization'] ?? $headers['authorization'] ?? ''));
    if ($provided === '' && stripos($authorization, 'Bearer ') === 0) $provided = trim(substr($authorization, 7));
    if ($provided === '' || !hash_equals($expected, $provided)) sendResponse(false, 'Invalid AutoCount sync token.', null, 401);
}

// Customer portal and vehicle access helpers moved to modules/customers.php and modules/vehicles.php

// Parts order customer helpers moved to modules/parts.php

// customerBookings moved to modules/work_orders.php
// customerParts moved to modules/parts.php

// customerReminders moved to modules/customers.php

// customerRelatedVehicleId & customerNotifications moved to modules/settings.php
// customerWorkOrders moved to modules/work_orders.php
// Domain Modules
require_once __DIR__ . '/modules/settings.php';
require_once __DIR__ . '/modules/customers.php';
require_once __DIR__ . '/modules/vehicles.php';
require_once __DIR__ . '/modules/parts.php';
require_once __DIR__ . '/modules/purchase_orders.php';
require_once __DIR__ . '/modules/quotations.php';
require_once __DIR__ . '/modules/invoices.php';
require_once __DIR__ . '/modules/work_orders.php';
require_once __DIR__ . '/modules/analytics.php';

// requireWorkOrderPartRequirementSchema ... workOrderPartsUpdateNotifications moved to modules/work_orders.php
// system settings helpers moved to modules/settings.php

// Route request by mode parameter
$mode = $_GET['mode'] ?? '';

ensureSchema($con);

// Authenticate and authorize admin endpoints
if (strpos($mode, 'admin-') === 0 && $mode !== 'admin-login') {
    checkPermission($con, $mode);
    
    // CSRF protection for mutations
    $mutatingActions = [
        'admin-create-work-order',
        'admin-update-work-order',
        'admin-save-work-order-part-requirements',
        'admin-rollback-work-order',
        'admin-create-customer',
        'admin-update-customer',
        'admin-delete-customer',
        'admin-create-driver',
        'admin-update-driver',
        'admin-delete-driver',
        'admin-create-company',
        'admin-update-company',
        'admin-delete-company',
        'admin-create-booking',
        'admin-update-booking',
        'admin-check-in-booking',
        'admin-delete-booking',
        'admin-create-staff',
        'admin-update-staff',
        'admin-delete-staff',
        'admin-create-vehicle',
        'admin-update-vehicle',
        'admin-review-vehicle',
        'admin-review-vehicle-document',
        'admin-upload-vehicle-document',
        'admin-delete-vehicle-document',
        'admin-delete-vehicle',
        'admin-create-part',
        'admin-update-part',
        'admin-delete-part',
        'admin-import-parts',
        'admin-update-order-status',
        'admin-save-purchase-order',
        'admin-submit-purchase-order',
        'admin-retry-purchase-order-sync',
        'admin-receive-purchase-order',
        'admin-cancel-purchase-order',
        'admin-update-invoice-status',
        'admin-link-autocount-invoice',
        'admin-retry-autocount-invoice-sync',
        'admin-batch-retry-autocount-invoice-sync',
        'admin-save-work-order-invoice',
        'admin-issue-work-order-invoice',
        'admin-record-work-order-invoice-payment',
        'admin-void-work-order-invoice',
        'admin-save-work-order-quotation',
        'admin-issue-work-order-quotation',
        'admin-approve-work-order-quotation',
        'admin-save-system-settings',
        'admin-create-service-type',
        'admin-update-service-type',
        'admin-delete-service-type',
        'admin-send-notification',
        'admin-logout'
    ];
    if (in_array($mode, $mutatingActions)) {
        verifyCsrfToken($inputData);
    }
}

$customerMutationModes = [
    'customer-create-vehicle',
    'customer-upload-vehicle-document',
    'customer-create-booking',
    'customer-cancel-booking',
    'customer-create-parts-order',
    'customer-respond-quotation',
    'customer-mark-notifications-read',
    'customer-update-profile',
    'customer-save-delivery-address',
    'customer-delete-delivery-address',
    'customer-logout'
];
if (strpos($mode, 'customer-') === 0 && !in_array($mode, ['customer-login', 'customer-support-settings', 'public-support-settings'], true)) {
    requireCustomerSession($con);
    if (in_array($mode, $customerMutationModes, true)) {
        verifyCustomerCsrf($inputData);
    }
}

if (strpos($mode, 'workshop-') === 0) {
    checkPermission($con, 'admin-work-orders');
    if (in_array($mode, ['workshop-upload-photo', 'workshop-assign-technician'], true)) {
        verifyCsrfToken($inputData);
    }
}

$retiredCustomerModes = [
    'login',
    'get-home-data',
    'get-vehicles',
    'add-vehicle',
    'get-bookings',
    'add-booking',
    'get-parts',
    'get-notifications'
];
if (in_array($mode, $retiredCustomerModes, true)) {
    sendResponse(false, 'This customer endpoint has been retired. Use the authenticated customer API.', null, 410);
}

switch ($mode) {
    case 'vehicle-document-file':
        handleVehicleRoute($con, $mode, $inputData);
        break;

    case 'work-order-photo-file':
    case 'workshop-work-orders':
    case 'workshop-assign-technician':
    case 'workshop-upload-photo':
        handleWorkOrderRoute($con, $mode, $inputData);
        break;
    case 'sync-pull-autocount-invoice':
    case 'sync-ack-autocount-invoice':
    case 'sync-update-autocount-invoice':
        handleInvoiceRoute($con, $mode, $inputData);
        break;
    case 'sync-pull-autocount-purchase-order':
    case 'sync-ack-autocount-purchase-order':
        handlePurchaseOrderRoute($con, $mode, $inputData);
        break;

    case 'sync-pull-autocount-parts-order':
    case 'sync-ack-autocount-parts-order':
        handlePartsRoute($con, $mode, $inputData);
        break;

    case 'customer-support-settings':
    case 'public-support-settings':
    case 'customer-login':
    case 'customer-logout':
    case 'customer-bootstrap':
        handleCustomerRoute($con, $mode, $inputData);
        break;

    case 'customer-respond-quotation':
        handleQuotationRoute($con, $mode, $inputData);
        break;

    case 'customer-upload-vehicle-document':
    case 'customer-create-vehicle':
    case 'customer-vehicle-history':
        handleVehicleRoute($con, $mode, $inputData);
        break;

    case 'customer-create-booking':
    case 'customer-cancel-booking':
        handleWorkOrderRoute($con, $mode, $inputData);
        break;
    case 'customer-create-parts-order':
        handlePartsRoute($con, $mode, $inputData);
        break;

    case 'customer-update-profile':
    case 'customer-save-delivery-address':
    case 'customer-delete-delivery-address':
    case 'customer-mark-notifications-read':
    case 'customer-update-notification-preferences':
        handleCustomerRoute($con, $mode, $inputData);
        break;

    // ----------------------------------------------------
    // 0. Admin Authentication
    // ----------------------------------------------------
    case 'admin-login':
        $usernameInput = trim(strval($inputData['username'] ?? ''));
        $username = mysqli_real_escape_string($con, $usernameInput);
        $password = $inputData['password'] ?? '';

        if (empty($username) || empty($password)) {
            sendResponse(false, 'Username and password are required', null, 400);
        }

        $query = "SELECT * FROM admin_users WHERE username = '$username' AND is_active = 1 LIMIT 1";
        $result = mysqli_query($con, $query);

        if ($result && mysqli_num_rows($result) > 0) {
            $admin = mysqli_fetch_assoc($result);
            if (password_verify($password, $admin['password'])) {
                session_regenerate_id(true);
                $_SESSION['admin_id'] = $admin['id'];
                $_SESSION['admin_role'] = $admin['role'];
                $_SESSION['admin_source'] = 'admin_users';
                $_SESSION['admin_name'] = $admin['display_name'] ?: $admin['username'];
                $_SESSION['admin_username'] = $admin['username'];
                $_SESSION['admin_logged_in'] = true;
                $_SESSION['admin_remember_me'] = !empty($inputData['rememberMe']);

                $csrfToken = bin2hex(random_bytes(32));
                $_SESSION['csrf_token'] = $csrfToken;

                mysqli_query($con, "UPDATE admin_users SET last_login_at = NOW() WHERE id = " . intval($admin['id']));

                sendResponse(true, 'Admin login successful', [
                    'id' => intval($admin['id']),
                    'username' => $admin['username'],
                    'displayName' => $admin['display_name'],
                    'role' => $admin['role'],
                    'csrfToken' => $csrfToken
                ]);
            }
        }

        if (tableExists($con, 'staff')) {
            $staffColumnMap = staffColumns($con);
            if ($staffColumnMap['name'] && $staffColumnMap['password']) {
                $identifierConditions = [
                    "`" . $staffColumnMap['name'] . "` = '$username'"
                ];
                if ($staffColumnMap['username'] && $staffColumnMap['username'] !== $staffColumnMap['name']) {
                    $identifierConditions[] = "`" . $staffColumnMap['username'] . "` = '$username'";
                }
                if ($staffColumnMap['email']) {
                    $identifierConditions[] = "`" . $staffColumnMap['email'] . "` = '$username'";
                }
                $staffResult = mysqli_query(
                    $con,
                    "SELECT * FROM staff WHERE (" . implode(' OR ', $identifierConditions) . ") LIMIT 20"
                );
                while ($staffResult && $staff = mysqli_fetch_assoc($staffResult)) {
                    $rawStatus = $staffColumnMap['status']
                        ? ($staff[$staffColumnMap['status']] ?? 'Active')
                        : 'Active';
                    $isActive = !in_array(strtolower(trim(strval($rawStatus))), ['0', 'inactive', 'disabled'], true);
                    $passwordHash = strval($staff[$staffColumnMap['password']] ?? '');
                    if (!$isActive || $passwordHash === '' || !password_verify($password, $passwordHash)) {
                        continue;
                    }

                    $staffRole = normalizeStaffRole(
                        $staffColumnMap['role'] ? ($staff[$staffColumnMap['role']] ?? 'Technician') : 'Technician'
                    );
                    $permissionRole = staffPermissionRole($staffRole);
                    if ($permissionRole === '') {
                        continue;
                    }
                    session_regenerate_id(true);
                    $_SESSION['admin_id'] = intval($staff['id']);
                    $_SESSION['admin_role'] = $permissionRole;
                    $_SESSION['admin_staff_role'] = $staffRole;
                    $_SESSION['admin_source'] = 'staff';
                    $_SESSION['admin_name'] = $staff[$staffColumnMap['name']] ?? 'Staff';
                    $_SESSION['admin_username'] = $staffColumnMap['email']
                        ? ($staff[$staffColumnMap['email']] ?? $usernameInput)
                        : $usernameInput;
                    $_SESSION['admin_logged_in'] = true;
                    $_SESSION['admin_remember_me'] = !empty($inputData['rememberMe']);
                    $csrfToken = bin2hex(random_bytes(32));
                    $_SESSION['csrf_token'] = $csrfToken;

                    if (columnExists($con, 'staff', 'last_login_at')) {
                        mysqli_query($con, "UPDATE staff SET last_login_at = NOW() WHERE id = " . intval($staff['id']));
                    }

                    sendResponse(true, 'Staff login successful', [
                        'id' => intval($staff['id']),
                        'username' => $staffColumnMap['email']
                            ? ($staff[$staffColumnMap['email']] ?? $usernameInput)
                            : $usernameInput,
                        'displayName' => $staff[$staffColumnMap['name']] ?? 'Staff',
                        'role' => $staffRole,
                        'csrfToken' => $csrfToken
                    ]);
                }
            }
        }

        sendResponse(false, 'Invalid email, username, or password', null, 401);
        break;

    case 'admin-logout':
        recordAdminAuditEvent($con, 'admin-logout', [], null, 'Logged out.');
        unset(
            $_SESSION['admin_id'],
            $_SESSION['admin_role'],
            $_SESSION['admin_staff_role'],
            $_SESSION['admin_source'],
            $_SESSION['admin_name'],
            $_SESSION['admin_username'],
            $_SESSION['admin_logged_in'],
            $_SESSION['admin_remember_me'],
            $_SESSION['csrf_token']
        );
        session_regenerate_id(true);
        sendResponse(true, 'Logged out.', null);
        break;

    // ----------------------------------------------------
    // 0b. Admin Data Endpoints
    // ----------------------------------------------------
    case 'admin-dashboard':
    case 'admin-reports':
        handleAnalyticsRoute($con, $mode, $inputData);
        break;

    case 'admin-audit-trail':
    case 'admin-app-logs':
        handleSettingsRoute($con, $mode, $inputData);
        break;
    case 'admin-customers':
    case 'admin-create-customer':
    case 'admin-update-customer':
    case 'admin-delete-customer':
    case 'admin-drivers':
    case 'admin-create-driver':
    case 'admin-update-driver':
    case 'admin-delete-driver':
        handleCustomerRoute($con, $mode, $inputData);
        break;

    case 'admin-vehicles':
    case 'admin-pending-vehicles-alert':
    case 'admin-create-vehicle':
    case 'admin-update-vehicle':
    case 'admin-review-vehicle':
    case 'admin-review-vehicle-document':
    case 'admin-delete-vehicle':
    case 'admin-upload-vehicle-document':
    case 'admin-delete-vehicle-document':
    case 'admin-vehicle-search':
    case 'admin-vehicle-history':
        handleVehicleRoute($con, $mode, $inputData);
        break;

    case 'admin-companies':
    case 'admin-create-company':
    case 'admin-update-company':
    case 'admin-delete-company':
    case 'admin-debtors':
    case 'admin-autocount-debtors':
    case 'admin-autocount-projects':
    case 'admin-suppliers':
    case 'admin-supplier-transactions':
    case 'admin-autocount-sync-health':
    case 'admin-autocount-retry-queue':
    case 'admin-mewahtrans-queue-invoice':
    case 'admin-mewahtrans-retry-sync':
        handleCustomerRoute($con, $mode, $inputData);
        break;

    case 'admin-staff':
    case 'admin-create-staff':
    case 'admin-update-staff':
    case 'admin-delete-staff':
        handleSettingsRoute($con, $mode, $inputData);
        break;
    case 'admin-bookings':
    case 'admin-pending-bookings-alert':
    case 'admin-create-booking':
    case 'admin-update-booking':
    case 'admin-check-in-booking':
    case 'admin-delete-booking':
        handleWorkOrderRoute($con, $mode, $inputData);
        break;
    case 'admin-stock-groups':
    case 'admin-item-detail':
    case 'admin-parts':
    case 'admin-part-stock-ledger':
    case 'admin-adjust-part-stock':
    case 'admin-update-part':
    case 'admin-import-parts':
    case 'admin-create-part':
    case 'admin-delete-part':
        handlePartsRoute($con, $mode, $inputData);
        break;

    case 'admin-purchase-order-options':
    case 'admin-purchase-orders':
    case 'admin-save-purchase-order':
    case 'admin-submit-purchase-order':
    case 'admin-retry-purchase-order-sync':
    case 'admin-receive-purchase-order':
    case 'admin-cancel-purchase-order':
        handlePurchaseOrderRoute($con, $mode, $inputData);
        break;

    case 'admin-orders':
    case 'admin-update-order-status':
    case 'admin-batch-sync-parts-orders':
        handlePartsRoute($con, $mode, $inputData);
        break;

    case 'admin-invoice-work-orders':
    case 'admin-get-work-order-invoice':
    case 'admin-save-work-order-invoice':
    case 'admin-issue-work-order-invoice':
    case 'admin-retry-autocount-invoice-sync':
    case 'admin-batch-retry-autocount-invoice-sync':
    case 'admin-record-work-order-invoice-payment':
    case 'admin-void-work-order-invoice':
    case 'admin-link-autocount-invoice':
    case 'admin-invoices':
    case 'admin-update-invoice-status':
        handleInvoiceRoute($con, $mode, $inputData);
        break;

    case 'admin-notifications':
    case 'admin-send-notification':
        handleSettingsRoute($con, $mode, $inputData);
        break;
    // Retired customer cases intercepted by 410 handler
    case 'admin-system-settings':
    case 'admin-save-system-settings':
    case 'admin-create-service-type':
    case 'admin-update-service-type':
    case 'admin-delete-service-type':
        handleSettingsRoute($con, $mode, $inputData);
        break;
    case 'admin-work-orders':
    case 'admin-create-work-order':
    case 'admin-work-order-parts-overview':
    case 'admin-get-work-order-part-requirements':
    case 'admin-save-work-order-part-requirements':
    case 'admin-acknowledge-work-order-parts':
    case 'admin-unacknowledged-parts-alert':
    case 'admin-rollback-work-order':
    case 'admin-update-work-order':
        handleWorkOrderRoute($con, $mode, $inputData);
        break;

    case 'admin-get-work-order-quotation':
    case 'admin-save-work-order-quotation':
    case 'admin-issue-work-order-quotation':
    case 'admin-approve-work-order-quotation':
        handleQuotationRoute($con, $mode, $inputData);
        break;

    default:
        sendResponse(false, 'Invalid API Mode', null, 400);
        break;
}
?>
