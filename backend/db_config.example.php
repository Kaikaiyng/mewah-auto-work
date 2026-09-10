<?php
// Copy this file to a path outside public_html, normally:
// /home/CPANEL_USER/maw_db_config.php
//
// Never commit or place the completed file inside a public web directory.
return [
    'staging' => [
        'host' => 'REMOTE_MYSQL_HOSTNAME',
        'port' => 3306,
        // Set true only when the remote MySQL host supports TLS. For verified
        // TLS, also provide ssl_ca (and ssl_cert/ssl_key if required).
        'ssl' => false,
        'user' => 'CPANEL_DATABASE_USER',
        'password' => 'STAGING_DATABASE_PASSWORD',
        'database' => 'example_workshop',
        // Optional users that have access to this same staging database.
        'fallback_credentials' => [],
    ],
    'production' => [
        'host' => 'REMOTE_MYSQL_HOSTNAME',
        'port' => 3306,
        'ssl' => false,
        'user' => 'CPANEL_DATABASE_USER',
        'password' => 'PRODUCTION_DATABASE_PASSWORD',
        'database' => 'example_workshop',
    ],
];
