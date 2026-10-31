# Windows Docker launcher: verify Desktop/Compose, preserve existing owner
# settings, add a missing runtime password, and wait for healthy app startup.
# Database data stays in the existing named volume; normal shutdown retains it.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Install Docker Desktop, open it, and wait for its engine to start. Then run this file again.'
    }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Open Docker Desktop and wait until the Docker engine is running, then try again.' }
    & docker compose version
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is unavailable. Update Docker Desktop and try again.' }
    if (-not (Test-Path '.env')) {
        $randomBytes = New-Object byte[] 32
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
        $databasePassword = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
        [IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), "DB_PASSWORD=$databasePassword`nAPP_PORT=3000`n", [Text.Encoding]::ASCII)
        Write-Host 'Created the local Docker settings. Keep this .env file for future starts.'
    }
    # Existing installations keep their owner password and volume. Add only
    # the new runtime credential when it is absent.
    if (-not $env:APP_DB_PASSWORD -and -not (Get-Content '.env' | Where-Object { $_ -match '^APP_DB_PASSWORD=.+' })) {
        $runtimeBytes = New-Object byte[] 32
        $runtimeGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $runtimeGenerator.GetBytes($runtimeBytes) } finally { $runtimeGenerator.Dispose() }
        $runtimePassword = -join ($runtimeBytes | ForEach-Object { $_.ToString('x2') })
        [IO.File]::AppendAllText((Join-Path (Get-Location) '.env'), "`nAPP_DB_PASSWORD=$runtimePassword`n", [Text.Encoding]::ASCII)
        Write-Host 'Added the restricted application login. Existing database credentials were retained.'
    }
    & docker compose up -d --build --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) {
        & docker compose ps
        & docker compose logs --tail 40
        throw 'The containers did not become healthy. Review the messages above.'
    }
    $port = if ($env:APP_PORT) { $env:APP_PORT } else { '3000' }
    if (-not $env:APP_PORT) {
        $setting = Get-Content '.env' | Where-Object { $_ -match '^APP_PORT=(\d+)$' } | Select-Object -First 1
        if ($setting) { $port = ($setting -split '=', 2)[1] }
    }
    Write-Host "Website: http://localhost:$port"
    Write-Host "Swagger: http://localhost:$port/api-docs/"
    Write-Host 'Stop the app later with: docker compose down'
    Write-Host 'Docker has its own persistent database; existing Node quickstart accounts are not copied automatically.'
    Start-Process "http://localhost:$port"
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
