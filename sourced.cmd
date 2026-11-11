@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if not exist .env.local if not "%~1"=="init" if not "%~1"=="doctor" (
  echo Run ./sourced init first. 1>&2
  exit /b 2
)
where docker >nul 2>nul
if errorlevel 1 (
  echo Install Docker: https://docs.docker.com/desktop/setup/install/windows-install/ 1>&2
  exit /b 2
)
if not exist .env.local (
  if "%~1"=="init" (type nul > .env.local) else if "%~1"=="doctor" (type nul > .env.local) else (
    echo Run ./sourced init first. 1>&2
    exit /b 2
  )
)
if "%~1"=="down" (
  docker compose down
  exit /b
)
if "%~1"=="dev" goto dev
if "%~1"=="init" echo Building the image on first run takes a few minutes. 1>&2
docker compose build cli 1>&2
if errorlevel 1 exit /b 1
set "mountArgs="
if exist .sourced\mounts for /f "usebackq delims=" %%P in (".sourced\mounts") do call :mount "%%P"
set "ttyArgs=-T"
rem PowerShell is part of Windows; Docker-only installs need no additional tools.
powershell -NoProfile -Command "if ([Console]::IsInputRedirected) { exit 1 }" >nul 2>nul
if not errorlevel 1 set "ttyArgs="
docker compose run --rm %ttyArgs% %mountArgs% cli %*
exit /b
:mount
set mountArgs=%mountArgs% -v "%~1:%~1:ro"
exit /b 0
:dev
set "json=false"
if not defined SOURCED_PORT set SOURCED_PORT=3000
shift
:devargs
if "%~1"=="" goto startapp
if "%~1"=="--json" (
  set "json=true"
  shift
  goto devargs
)
if "%~1"=="--port" (
  shift
  goto port
)
echo Usage: sourced.cmd dev [--port port] [--json] 1>&2
exit /b 2
:port
set "SOURCED_PORT=%~1"
shift
goto devargs
:startapp
powershell -NoProfile -Command "$p=0; if (-not [int]::TryParse($env:SOURCED_PORT,[ref]$p) -or $p -lt 1 -or $p -gt 65535) { exit 2 }" >nul 2>nul
if errorlevel 1 (
  echo Port must be an integer from 1 to 65535. 1>&2
  exit /b 2
)
docker compose up -d --build --force-recreate app 1>&2
if errorlevel 1 exit /b 1
docker compose exec -T app node --input-type=module -e "for(let n=0;n<60;n++){try{const r=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1000)});if(r.ok)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,1000))}process.exit(1)"
if errorlevel 1 exit /b 1
if "%json%"=="true" (
  echo {"schemaVersion":1,"command":"dev","ok":true,"result":{"url":"http://localhost:%SOURCED_PORT%"},"warnings":[]}
) else (
  echo http://localhost:%SOURCED_PORT%
)
exit /b 0
