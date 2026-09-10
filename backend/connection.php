<?php
// Mewah Auto Work - Database Connection Config
// example_workshop

if (session_status() == PHP_SESSION_NONE) {
    // Local Admin and Customer dev servers share 127.0.0.1, and cookies are not
    // port-scoped. Give each portal its own PHP session cookie so Workshop sign-in
    // cannot replace the Admin session running on another local port.
    $portalSession = strtolower(trim(strval($_SERVER['HTTP_X_MAW_PORTAL'] ?? '')));
    if (!$portalSession) {
        $queryPortal = strtolower(trim(strval($_GET['portal'] ?? '')));
        if (in_array($queryPortal, ['admin', 'customer'], true)) {
            $portalSession = $queryPortal;
        } elseif (!empty($_COOKIE['MAWADMINSESSID']) && empty($_COOKIE['MAWCUSTOMERSESSID'])) {
            $portalSession = 'admin';
        } elseif (!empty($_COOKIE['MAWCUSTOMERSESSID']) && empty($_COOKIE['MAWADMINSESSID'])) {
            $portalSession = 'customer';
        }
    }
    if ($portalSession === 'admin') {
        session_name('MAWADMINSESSID');
    } elseif ($portalSession === 'customer') {
        session_name('MAWCUSTOMERSESSID');
    }
    $sessionCookieLifetime = defined('MAW_SESSION_COOKIE_LIFETIME')
        ? intval(MAW_SESSION_COOKIE_LIFETIME)
        : (365 * 24 * 60 * 60);
    $isHttps = (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
        (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on') ||
        (isset($_SERVER['SERVER_PORT']) && intval($_SERVER['SERVER_PORT']) === 443)
    );
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_lifetime', strval($sessionCookieLifetime));
    if ($isHttps) {
        ini_set('session.cookie_secure', '1');
        ini_set('session.cookie_samesite', 'None');
    } else {
        ini_set('session.cookie_samesite', 'Lax');
    }
    // Retain server-side session data for long-term permanent login (365 days)
    ini_set('session.gc_maxlifetime', strval(365 * 24 * 60 * 60));
    session_start();
}

// System Configurations
set_time_limit(0);
ini_set('memory_limit', '512M');
error_reporting(E_ALL & ~E_NOTICE & ~E_WARNING);
ini_set('display_errors', '0');
date_default_timezone_set("Asia/Kuala_Lumpur"); // Set to local timezone (Malaysia)
mysqli_report(MYSQLI_REPORT_OFF);

// Database Configuration - Auto environment separation
$http_host = $_SERVER['HTTP_HOST'] ?? '';
$request_uri = $_SERVER['REQUEST_URI'] ?? '';
$script_name = $_SERVER['SCRIPT_NAME'] ?? '';

// Check if running on local development environment (localhost or 127.0.0.1 or CLI)
$is_local = (
    strpos($http_host, 'localhost') !== false || 
    strpos($http_host, '127.0.0.1') !== false ||
    php_sapi_name() === 'cli'
);

// Check if accessing the staging directory path
$is_staging_path = (
    strpos($request_uri, '/api_staging/') !== false || 
    strpos($script_name, '/api_staging/') !== false
);

$forcedEnvironment = strtolower(trim(strval(getenv('MAW_ENVIRONMENT') ?: '')));
if ($forcedEnvironment !== '' && !in_array($forcedEnvironment, ['staging', 'production'], true)) {
    if (!headers_sent()) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'message' => 'Invalid MAW_ENVIRONMENT configuration.', 'data' => null]);
    }
    exit;
}
$environment = $forcedEnvironment !== ''
    ? $forcedEnvironment
    : (($is_local || $is_staging_path) ? 'staging' : 'production');

// Hosting may provide credentials as environment variables or through a PHP
// config stored outside public_html. Environment variables always take priority.
$privateConfig = [];
$hostingHome = getenv('HOME') ?: ($_SERVER['HOME'] ?? '');
if ($hostingHome === '' && !empty($_SERVER['DOCUMENT_ROOT'])) {
    $documentRoot = rtrim($_SERVER['DOCUMENT_ROOT'], DIRECTORY_SEPARATOR);
    $publicHtmlPosition = strpos($documentRoot, DIRECTORY_SEPARATOR . 'public_html');
    $hostingHome = $publicHtmlPosition !== false
        ? substr($documentRoot, 0, $publicHtmlPosition)
        : dirname($documentRoot);
}
$documentRootPath = !empty($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], DIRECTORY_SEPARATOR) : '';
$configCandidates = array_filter([
    getenv('MAW_DB_CONFIG_FILE') ?: null,
    $hostingHome !== ''
        ? rtrim($hostingHome, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'maw_db_config.php'
        : null,
    $documentRootPath !== ''
        ? $documentRootPath . DIRECTORY_SEPARATOR . 'maw_db_config.php'
        : null,
    dirname(__DIR__) . DIRECTORY_SEPARATOR . 'maw_db_config.php',
]);
foreach ($configCandidates as $configFile) {
    if (is_file($configFile) && is_readable($configFile)) {
        $loadedConfig = require $configFile;
        if (is_array($loadedConfig)) {
            $privateConfig = $loadedConfig;
            break;
        }
    }
}

$environmentConfig = $privateConfig[$environment] ?? [];
$host = getenv('MAW_DB_HOST') ?: ($environmentConfig['host'] ?? 'localhost');
$portValue = getenv('MAW_DB_PORT') ?: ($environmentConfig['port'] ?? 3306);
$port = max(1, min(65535, intval($portValue)));
$socket = $environmentConfig['socket'] ?? null;
$sslValue = getenv('MAW_DB_SSL');
$useSsl = $sslValue !== false && $sslValue !== ''
    ? filter_var($sslValue, FILTER_VALIDATE_BOOLEAN)
    : !empty($environmentConfig['ssl']);
$sslCa = $environmentConfig['ssl_ca'] ?? null;
$sslCert = $environmentConfig['ssl_cert'] ?? null;
$sslKey = $environmentConfig['ssl_key'] ?? null;
$user = getenv('MAW_DB_USER') ?: ($environmentConfig['user'] ?? '');
$pass = getenv('MAW_DB_PASSWORD') ?: ($environmentConfig['password'] ?? '');
$defaultDatabase = $environment === 'staging'
    ? 'mewahautoworksystem_staging'
    : 'mewahautoworksystem';
$db_n = getenv('MAW_DB_NAME') ?: ($environmentConfig['database'] ?? $defaultDatabase);

if ($user === '' || $pass === '') {
    if (!headers_sent()) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'message' => 'Database configuration is unavailable.', 'data' => null]);
    }
    exit;
}

// Establish Database Connection with Timeout. A hosting account may grant an
// existing MySQL user access to both databases, so a private config can list
// additional credentials without mixing the database selected per environment.
$credentialCandidates = [['user' => $user, 'password' => $pass]];
if (!getenv('MAW_DB_USER') && !getenv('MAW_DB_PASSWORD')) {
    foreach (($environmentConfig['fallback_credentials'] ?? []) as $fallbackCredential) {
        if (
            is_array($fallbackCredential) &&
            !empty($fallbackCredential['user']) &&
            !empty($fallbackCredential['password'])
        ) {
            $credentialCandidates[] = [
                'user' => $fallbackCredential['user'],
                'password' => $fallbackCredential['password'],
            ];
        }
    }
}

$conn_ok = false;
$con = null;
foreach ($credentialCandidates as $credential) {
    $candidateConnection = mysqli_init();
    mysqli_options($candidateConnection, MYSQLI_OPT_CONNECT_TIMEOUT, 5);
    $clientFlags = 0;
    if ($useSsl) {
        mysqli_ssl_set($candidateConnection, $sslKey, $sslCert, $sslCa, null, null);
        $clientFlags |= MYSQLI_CLIENT_SSL;
    }
    if (@mysqli_real_connect(
        $candidateConnection,
        $host,
        $credential['user'],
        $credential['password'],
        $db_n,
        $port,
        $socket,
        $clientFlags
    )) {
        $con = $candidateConnection;
        $user = $credential['user'];
        $pass = $credential['password'];
        $conn_ok = true;
        break;
    }
    $con = $candidateConnection;
}

if (!$conn_ok) {
    $dbError = mysqli_connect_error() ?: mysqli_error($con);
    $dbErrorCode = mysqli_connect_errno();
    error_log("MewahAutoWork DB Connection failed: " . $dbError);

    $isDiagnosticRequest = basename($_SERVER['SCRIPT_NAME'] ?? '') === 'check_env.php';
    $diagnosticData = null;
    if ($isDiagnosticRequest) {
        $categories = [
            1044 => 'database_access_denied',
            1045 => 'authentication_failed',
            2002 => 'connection_refused_or_socket_error',
            2003 => 'host_unreachable_or_timeout',
            2005 => 'dns_resolution_failed',
            2026 => 'tls_connection_failed'
        ];
        $tcpErrorCode = 0;
        $tcpErrorMessage = '';
        $tcpSocket = @fsockopen($host, $port, $tcpErrorCode, $tcpErrorMessage, 3);
        $tcpReachable = is_resource($tcpSocket);
        if ($tcpReachable) fclose($tcpSocket);
        $diagnosticData = [
            'environment' => $environment,
            'configured_host' => $host,
            'resolved_host' => gethostbyname($host),
            'configured_port' => $port,
            'resolved_db' => $db_n,
            'tcp_reachable' => $tcpReachable,
            'error_code' => $dbErrorCode,
            'error_category' => $categories[$dbErrorCode] ?? 'connection_failed'
        ];
    }
    
    // Return JSON error response if client expects JSON
    if (!headers_sent()) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false, 
            'message' => 'Database service is unavailable.',
            'data' => $diagnosticData
        ]);
    }
    exit;
}

// Set standard charset and local timezone (GMT+8 / Malaysia)
mysqli_set_charset($con, 'utf8mb4');
@mysqli_query($con, "SET time_zone = '+08:00'");
?>
