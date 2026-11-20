# D-136: one Compose project per checkout. Compose reads COMPOSE_PROJECT_NAME from .env
# in this folder, so the launchers, the Node CLI and plain docker compose agree.
$ErrorActionPreference = 'Stop'
if ($env:COMPOSE_PROJECT_NAME) { exit 0 }
$envFile = Join-Path (Get-Location) '.env'
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^COMPOSE_PROJECT_NAME=' } | Select-Object -Last 1
  if ($line) { exit 0 }
}
# Upgrades keep the project (and data) their containers already use.
$listing = & docker ps -a --format '{{.Label "com.docker.compose.project.working_dir"}}|{{.Label "com.docker.compose.project"}}' 2>$null
if ($LASTEXITCODE -ne 0) { exit 0 }
$here = (Get-Location).Path.TrimEnd('\').ToLowerInvariant()
$project = $null
foreach ($entry in @($listing)) {
  $parts = "$entry".Split('|')
  if ($parts.Count -eq 2 -and $parts[1] -and $parts[0].TrimEnd('\').ToLowerInvariant() -eq $here) {
    $project = $parts[1]
    break
  }
}
if (-not $project) {
  $bytes = New-Object byte[] 4
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $project = 'sourced-' + (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}
$prefix = ''
if ((Test-Path $envFile) -and (Get-Item $envFile).Length -gt 0) {
  $raw = [System.IO.File]::ReadAllText($envFile)
  if (-not $raw.EndsWith("`n")) { $prefix = "`r`n" }
}
[System.IO.File]::AppendAllText($envFile, "${prefix}COMPOSE_PROJECT_NAME=$project`r`n")
