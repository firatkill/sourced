# T-88: a new one-time setup link; the token format matches lib/setup/token.ts.
param([string]$Json = 'false', [string]$Port = '3000')
if ($Port -notmatch '^[0-9]+$' -or [int]$Port -lt 1 -or [int]$Port -gt 65535) {
  [Console]::Error.WriteLine('Port must be an integer from 1 to 65535.')
  exit 2
}
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
New-Item -ItemType Directory -Force -Path '.sourced' | Out-Null
Set-Content -Path '.sourced\setup-token.tmp' -Value $token -NoNewline -Encoding ascii
Move-Item -Force '.sourced\setup-token.tmp' '.sourced\setup-token'
$url = "http://localhost:$Port/setup?token=$token"
if ($Json -eq 'true') {
  Write-Output "{`"schemaVersion`":1,`"command`":`"setup`",`"ok`":true,`"result`":{`"url`":`"$url`"},`"warnings`":[]}"
} else {
  Write-Output 'Open this link to finish setup in your browser:'
  Write-Output $url
  Write-Output 'It replaces any earlier link.'
}
exit 0
