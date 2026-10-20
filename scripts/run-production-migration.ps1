param(
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $root 'database\production-migration.sql'

if (-not (Test-Path -LiteralPath $migration)) {
    throw "Arquivo de migração não encontrado: $migration"
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw 'psql não foi encontrado. Instale o cliente PostgreSQL antes de continuar.'
}

if ($WhatIf) {
    Write-Host "Modo de conferência. Nenhuma alteração será executada."
    Write-Host "Arquivo: $migration"
    Get-Content -LiteralPath $migration | Where-Object { $_ -match '^\\ir |^\\echo ' }
    exit 0
}

$confirmation = Read-Host 'Digite MIGRAR-PRODUCAO para confirmar a execução'
if ($confirmation -cne 'MIGRAR-PRODUCAO') {
    throw 'Execução cancelada.'
}

$connectionString = Read-Host 'Cole a DATABASE_URL_UNPOOLED de produção'
if ([string]::IsNullOrWhiteSpace($connectionString) -or $connectionString -match '-pooler') {
    throw 'Use a DATABASE_URL_UNPOOLED, sem -pooler.'
}

try {
    & psql --dbname $connectionString --file $migration --set ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        throw "psql terminou com código $LASTEXITCODE."
    }
}
finally {
    Remove-Variable connectionString -ErrorAction SilentlyContinue
}
