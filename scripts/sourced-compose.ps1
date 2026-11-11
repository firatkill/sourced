# JSON-only launcher boundary. Never forward raw Compose errors or connection values.
param(
  [string]$CommandName,
  [string]$Step
)
# Keep native Docker flags in the ordinary remaining-arguments array.
$DockerArgs = $args
$ErrorActionPreference = 'Continue'
$emitted = $false
$fix = 'Check Docker is running, then retry'
& docker @DockerArgs 2>&1 | ForEach-Object {
  $line = "$_"
  if ($line -match 'port is already allocated|address already in use|ports are not available') {
    $fix = 'Set SOURCED_DB_PORT (or SOURCED_PORT) to a free port in .env.local, then retry.'
  }
  if ($Step -eq 'CLI container start') {
    try {
      $envelope = ConvertFrom-Json -InputObject $line -ErrorAction Stop
      if ($null -ne $envelope.event) { [Console]::Error.WriteLine($line) }
      if (-not $emitted -and $envelope.schemaVersion -eq 1 -and $null -ne $envelope.ok) {
        Write-Output $line
        $emitted = $true
      }
    } catch { }
  }
}
$status = $LASTEXITCODE
if ($emitted) { exit $status }
if ($status -ne 0) {
  if ($CommandName -notmatch '^[a-z:-]+$') { $CommandName = 'unknown' }
  [ordered]@{
    schemaVersion = 1; command = $CommandName; ok = $false
    error = @{ code = 'INTERNAL_ERROR'; message = "$Step failed."; fix = $fix }
    warnings = @()
  } | ConvertTo-Json -Depth 5 -Compress
  exit 1
}
exit 0
