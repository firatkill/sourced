@echo off
setlocal DisableDelayedExpansion
if not defined BUILDX_NO_DEFAULT_ATTESTATIONS set BUILDX_NO_DEFAULT_ATTESTATIONS=1
cd /d "%~dp0"
rem T-88: dev and setup start without .env.local; the browser asks for the key.
if not exist .env.local if not "%~1"=="init" if not "%~1"=="doctor" if not "%~1"=="dev" if not "%~1"=="setup" (
  echo Run sourced.cmd dev first, then finish setup in your browser. 1>&2
  exit /b 2
)
where docker >nul 2>nul
if errorlevel 1 (
  echo Install Docker: https://docs.docker.com/desktop/setup/install/windows-install/ 1>&2
  exit /b 2
)
if not exist .env.local (
  type nul > .env.local
)
set "SOURCED_LAUNCHER=sourced.cmd"
rem D-136: one Compose project per checkout, recorded in .env for Compose to read.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-project.ps1"
rem Read only the port keys; never execute or export other env-file lines.
for /f "tokens=1,* delims==" %%A in ('findstr /b /l /c:"SOURCED_PORT=" /c:"SOURCED_DB_PORT=" /c:"SOURCED_DOCLING_PORT=" .env.local') do (
  if "%%A"=="SOURCED_PORT" if not defined SOURCED_PORT set "SOURCED_PORT=%%B"
  if "%%A"=="SOURCED_DB_PORT" if not defined SOURCED_DB_PORT set "SOURCED_DB_PORT=%%B"
  if "%%A"=="SOURCED_DOCLING_PORT" if not defined SOURCED_DOCLING_PORT set "SOURCED_DOCLING_PORT=%%B"
)
if "%~1"=="down" goto down
if "%~1"=="dev" goto dev
if "%~1"=="setup" goto setup
if "%~1"=="init" echo Building the image on first run takes a few minutes. 1>&2
set "json=false"
for %%A in (%*) do if "%%~A"=="--json" set "json=true"
rem D-152: the CLI container has no Docker socket, so the launcher starts or stops Docling.
if "%~1"=="docling" call :docling "%~2"
if errorlevel 1 exit /b %errorlevel%
if "%json%"=="true" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-compose.ps1" "%~1" "CLI image build" compose build cli
) else (
  docker compose build cli 1>&2
)
if errorlevel 1 exit /b 1
if "%json%"=="true" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-compose.ps1" "%~1" "Database container start" compose up -d --wait db
) else (
  docker compose up -d --wait db 1>&2
)
if errorlevel 1 exit /b 1
set "mountArgs="
if exist .sourced\mounts for /f "usebackq delims=" %%P in (".sourced\mounts") do call :mount "%%P"
set "ttyArgs=-T"
rem PowerShell is part of Windows; Docker-only installs need no additional tools.
powershell -NoProfile -Command "if ([Console]::IsInputRedirected) { exit 1 }" >nul 2>nul
if not errorlevel 1 set "ttyArgs="
if "%json%"=="true" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-compose.ps1" "%~1" "CLI container start" compose run --no-deps --rm %ttyArgs% %mountArgs% cli %*
) else (
  docker compose run --no-deps --rm %ttyArgs% %mountArgs% cli %*
)
exit /b
:docling
if "%~1"=="status" exit /b 0
if "%~1"=="on" (
  if "%json%"=="false" echo Downloading Docling the first time ^(about 2.1 GB, 6.5 GB on disk^), then starting it. 1>&2
  if "%json%"=="true" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-compose.ps1" docling "Docling download and start" compose --profile docling up -d docling
  ) else (
    docker compose --profile docling up -d docling 1>&2
  )
  exit /b
)
if "%~1"=="off" (
  if "%json%"=="true" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-compose.ps1" docling "Docling stop" compose --profile docling stop docling
  ) else (
    docker compose --profile docling stop docling 1>&2
  )
  exit /b
)
echo Usage: sourced.cmd docling on^|off^|status [--json] 1>&2
exit /b 2
:mount
set mountArgs=%mountArgs% -v "%~1:%~1:ro"
exit /b 0
:down
set "json=false"
shift
:downargs
if "%~1"=="" goto stopapp
if "%~1"=="--json" set "json=true"
shift
goto downargs
:stopapp
if "%json%"=="false" (
  docker compose --profile docling down
  exit /b
)
rem Down stops the containers, so emit the fixed envelope without starting one.
docker compose --profile docling down 1>&2
if errorlevel 1 (
  echo {"schemaVersion":1,"command":"down","ok":false,"error":{"code":"INTERNAL_ERROR","message":"Docker Compose down failed.","fix":"Check Docker is running, then retry sourced.cmd down --json."},"warnings":[]}
  exit /b 1
)
echo {"schemaVersion":1,"command":"down","ok":true,"result":{},"warnings":[]}
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
if exist .sourced\startup-error.json del /q .sourced\startup-error.json
if exist .sourced\startup-error.txt del /q .sourced\startup-error.txt
powershell -NoProfile -Command "$p=0; if (-not [int]::TryParse($env:SOURCED_PORT,[ref]$p) -or $p -lt 1 -or $p -gt 65535) { exit 2 }" >nul 2>nul
if errorlevel 1 (
  echo Port must be an integer from 1 to 65535. 1>&2
  exit /b 2
)
if "%json%"=="true" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-compose.ps1" dev "App container start" compose up -d --build --force-recreate app
) else (
  docker compose up -d --build --force-recreate app 1>&2
)
if errorlevel 1 exit /b 1
rem D-152: a library read with Docling gets its reader back after sourced.cmd down.
findstr /c:"\"engine\": \"docling\"" .sourced\config.json >nul 2>nul
if not errorlevel 1 docker compose --profile docling up -d docling 1>&2
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-dev.ps1" "%json%" "%SOURCED_PORT%"
exit /b
:setup
set "json=false"
for %%A in (%*) do if "%%~A"=="--json" set "json=true"
if not defined SOURCED_PORT set "SOURCED_PORT=3000"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sourced-setup.ps1" -Json %json% -Port %SOURCED_PORT%
exit /b %errorlevel%
