# D-137: wait for the app, stop at once if its container exits, and say why it failed.
param([string]$Json = 'false', [string]$Port = '3000')
$attempts = if ($env:SOURCED_DEV_ATTEMPTS) { [int]$env:SOURCED_DEV_ATTEMPTS } else { 60 }
$started = $false
for ($attempt = 0; $attempt -lt $attempts; $attempt++) {
  if (Test-Path '.sourced\startup-error.json') { break }
  $running = & docker compose ps -q --status running app 2>$null
  if (-not $running) {
    $exited = & docker compose ps -a -q --status exited app 2>$null
    if ($exited) { break }
  } else {
    & docker compose exec -T app node --input-type=module -e "const r=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1000)}).catch(()=>null);process.exit(r?.ok?0:1)" *> $null
    if ($LASTEXITCODE -eq 0) { $started = $true; break }
  }
  Start-Sleep -Seconds 1
}
if ($started) {
  if ($Json -eq 'true') {
    Write-Output "{`"schemaVersion`":1,`"command`":`"dev`",`"ok`":true,`"result`":{`"url`":`"http://localhost:$Port`"},`"warnings`":[]}"
  } else {
    Write-Output "Sourced is running at http://localhost:$Port"
    Write-Output 'Stop it with sourced.cmd down'
  }
  exit 0
}
if (Test-Path '.sourced\startup-error.json') {
  if ($Json -eq 'true') { Get-Content '.sourced\startup-error.json' }
  else { Get-Content '.sourced\startup-error.txt' | ForEach-Object { [Console]::Error.WriteLine($_) } }
} elseif ($Json -eq 'true') {
  Write-Output '{"schemaVersion":1,"command":"dev","ok":false,"error":{"code":"INTERNAL_ERROR","message":"The app did not start.","fix":"Run docker compose logs app to see why, then retry sourced.cmd dev --json."},"warnings":[]}'
} else {
  [Console]::Error.WriteLine('The app did not start. Its last log lines:')
  & docker compose logs --no-color --tail 5 app 2>&1 | ForEach-Object { [Console]::Error.WriteLine("$_") }
  [Console]::Error.WriteLine('Next: docker compose logs app')
}
exit 1
