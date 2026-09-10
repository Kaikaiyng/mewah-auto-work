<?php
// IMPORTANT:
// 1. Fill in the remote MySQL usernames and passwords.
// 2. Rename this file to maw_db_config.php.
// 3. Upload it to /home/CPANEL_USER/maw_db_config.php on the ORIGINAL cPanel.
// 4. Do not upload it into public_html, api, or api_staging.
return [
    'staging' => [
        'host' => 'workshop.example.com',
        'port' => 3306,
        'ssl' => false,
        'user' => 'REPLACE_WITH_REMOTE_STAGING_DB_USER',
        'password' => 'REPLACE_WITH_REMOTE_STAGING_DB_PASSWORD',
        'database' => 'example_workshop_staging',
    ],
    'production' => [
        'host' => 'workshop.example.com',
        'port' => 3306,
        'ssl' => false,
        'user' => 'REPLACE_WITH_REMOTE_PRODUCTION_DB_USER',
        'password' => 'REPLACE_WITH_REMOTE_PRODUCTION_DB_PASSWORD',
        'database' => 'mewahautoworksystem',
    ],
];
