<?php
// Mewah Auto Work - Sequential Schema Migration Runner (CLI only)
//
// Status:
//   php run_migrations.php --status
// Apply pending migrations on staging:
//   MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND php run_migrations.php
// Apply pending migrations on production (after a verified backup):
//   MAW_ENVIRONMENT=production MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND \
//   MAW_ALLOW_PRODUCTION_MIGRATIONS=YES_I_UNDERSTAND php run_migrations.php
// Baseline an existing, already-migrated staging schema:
//   MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND \
//   MAW_BASELINE_MIGRATIONS=YES_I_UNDERSTAND php run_migrations.php --baseline

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'success' => false,
        'message' => 'Database migrations are restricted to CLI.',
        'data' => null,
    ]);
    exit;
}

require_once __DIR__ . '/connection.php';

$resolvedEnvironment = strval($environment ?? '');
if (!in_array($resolvedEnvironment, ['staging', 'production'], true)) {
    fwrite(STDERR, "Refusing migration: unable to determine the database environment.\n");
    exit(1);
}

$arguments = array_slice($argv ?? [], 1);
$statusOnly = in_array('--status', $arguments, true);
$baseline = in_array('--baseline', $arguments, true);
$unknownArguments = array_values(array_diff($arguments, ['--status', '--baseline']));
if ($unknownArguments || ($statusOnly && $baseline)) {
    fwrite(STDERR, "Usage: php run_migrations.php [--status|--baseline]\n");
    exit(1);
}

$migrationFiles = glob(__DIR__ . '/migrations/[0-9][0-9][0-9]_*.sql') ?: [];
sort($migrationFiles, SORT_STRING);
if (!$migrationFiles) {
    fwrite(STDERR, "No migration files were found.\n");
    exit(1);
}

function migrationVersionFromFile($file) {
    return pathinfo($file, PATHINFO_FILENAME);
}

function migrationTableExists($con) {
    $result = mysqli_query($con, "SHOW TABLES LIKE 'schema_migrations'");
    return $result && mysqli_num_rows($result) > 0;
}

function createMigrationTable($con) {
    $sql = "CREATE TABLE IF NOT EXISTS `schema_migrations` (
      `version` VARCHAR(100) PRIMARY KEY,
      `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    if (!mysqli_query($con, $sql)) {
        throw new RuntimeException('Failed to create schema_migrations: ' . mysqli_error($con));
    }
}

function appliedMigrationVersions($con) {
    if (!migrationTableExists($con)) return [];
    $result = mysqli_query($con, "SELECT version FROM schema_migrations ORDER BY version");
    if (!$result) {
        throw new RuntimeException('Failed to read schema_migrations: ' . mysqli_error($con));
    }
    $versions = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $versions[] = strval($row['version']);
    }
    return $versions;
}

function hasModernMigrationArtifacts($con) {
    $artifacts = [
        'admin_audit_log',
        'autocount_invoice_sync_queue',
        'autocount_parts_order_sync_queue',
        'autocount_purchase_order_sync_queue',
        'work_order_status_history',
    ];
    foreach ($artifacts as $table) {
        $escaped = mysqli_real_escape_string($con, $table);
        $result = mysqli_query($con, "SHOW TABLES LIKE '$escaped'");
        if ($result && mysqli_num_rows($result) > 0) return true;
    }
    return false;
}

function executeMigrationSql($con, $sql, $version) {
    if (!mysqli_multi_query($con, $sql)) {
        throw new RuntimeException("Migration $version failed: " . mysqli_error($con));
    }

    do {
        $result = mysqli_store_result($con);
        if ($result instanceof mysqli_result) mysqli_free_result($result);
        if (!mysqli_more_results($con)) break;
        if (!mysqli_next_result($con)) {
            throw new RuntimeException("Migration $version failed: " . mysqli_error($con));
        }
    } while (true);
}

try {
    $allVersions = array_map('migrationVersionFromFile', $migrationFiles);
    $appliedVersions = appliedMigrationVersions($con);
    $pendingVersions = array_values(array_diff($allVersions, $appliedVersions));

    if ($statusOnly) {
        echo "Database: {$db_n}\n";
        echo 'Available migrations: ' . count($allVersions) . "\n";
        echo 'Applied migrations: ' . count($appliedVersions) . "\n";
        echo 'Pending migrations: ' . count($pendingVersions) . "\n";
        foreach ($pendingVersions as $version) echo "  PENDING $version\n";
        exit(0);
    }

    if (getenv('MAW_ALLOW_MIGRATIONS') !== 'YES_I_UNDERSTAND') {
        fwrite(STDERR, "Refusing migration: set MAW_ALLOW_MIGRATIONS=YES_I_UNDERSTAND.\n");
        exit(1);
    }
    if ($resolvedEnvironment === 'production' && getenv('MAW_ALLOW_PRODUCTION_MIGRATIONS') !== 'YES_I_UNDERSTAND') {
        fwrite(STDERR, "Refusing production migration: set MAW_ALLOW_PRODUCTION_MIGRATIONS=YES_I_UNDERSTAND after creating a verified backup.\n");
        exit(1);
    }

    if ($baseline) {
        if (getenv('MAW_BASELINE_MIGRATIONS') !== 'YES_I_UNDERSTAND') {
            fwrite(STDERR, "Refusing baseline: set MAW_BASELINE_MIGRATIONS=YES_I_UNDERSTAND.\n");
            exit(1);
        }
        createMigrationTable($con);
        $statement = mysqli_prepare($con, "INSERT IGNORE INTO schema_migrations (version) VALUES (?)");
        if (!$statement) throw new RuntimeException(mysqli_error($con));
        foreach ($allVersions as $version) {
            mysqli_stmt_bind_param($statement, 's', $version);
            if (!mysqli_stmt_execute($statement)) throw new RuntimeException(mysqli_stmt_error($statement));
            echo "BASELINED $version\n";
        }
        mysqli_stmt_close($statement);
        echo "Baseline complete. No migration SQL was executed.\n";
        exit(0);
    }

    if (!$appliedVersions && hasModernMigrationArtifacts($con)) {
        fwrite(STDERR, "Refusing to replay migrations on an existing evolved schema with no migration history.\n");
        fwrite(STDERR, "Verify the schema, then use the explicit --baseline command documented above.\n");
        exit(1);
    }

    createMigrationTable($con);
    if (!$pendingVersions) {
        echo "No pending migrations.\n";
        exit(0);
    }

    $recordStatement = mysqli_prepare($con, "INSERT INTO schema_migrations (version) VALUES (?)");
    if (!$recordStatement) throw new RuntimeException(mysqli_error($con));

    foreach ($migrationFiles as $file) {
        $version = migrationVersionFromFile($file);
        if (in_array($version, $appliedVersions, true)) continue;

        $sql = file_get_contents($file);
        if ($sql === false || trim($sql) === '') {
            throw new RuntimeException("Migration $version is empty or unreadable.");
        }

        echo "APPLYING $version\n";
        executeMigrationSql($con, $sql, $version);
        mysqli_stmt_bind_param($recordStatement, 's', $version);
        if (!mysqli_stmt_execute($recordStatement)) {
            throw new RuntimeException("Failed to record $version: " . mysqli_stmt_error($recordStatement));
        }
        echo "APPLIED $version\n";
    }

    mysqli_stmt_close($recordStatement);
    echo "All pending migrations applied successfully.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
