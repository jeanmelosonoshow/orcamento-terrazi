@echo off
setlocal
cd /d "%~dp0..\.."

set "CONFIG_FILE=%USERPROFILE%\orcamento-terrazi\env.local"
if not exist "%CONFIG_FILE%" set "CONFIG_FILE=%~dp0env.local"

if not exist "%CONFIG_FILE%" (
  echo Arquivo env.local não encontrado.
  echo Copie scripts\windows\env.local.example e preencha os valores.
  exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%CONFIG_FILE%") do (
  if not "%%A"=="" set "%%A=%%B"
)

call :require DB_HOST_FB || exit /b 1
call :require DB_PORT_FB || exit /b 1
call :require DB_PATH_FB || exit /b 1
call :require DB_USER_FB || exit /b 1
call :require DB_PASSWORD_FILE || exit /b 1
call :require KV_REST_API_URL || exit /b 1
call :require KV_REST_API_TOKEN || exit /b 1

if not exist scripts\windows\logs mkdir scripts\windows\logs
echo [%date% %time%] Iniciando sincronização de login >> scripts\windows\logs\firebird-login-sync.log
call npm run sync:firebird-login >> scripts\windows\logs\firebird-login-sync.log 2>&1
set "SYNC_EXIT_CODE=%errorlevel%"
echo [%date% %time%] Finalizada com código %SYNC_EXIT_CODE% >> scripts\windows\logs\firebird-login-sync.log
exit /b %SYNC_EXIT_CODE%

:require
set "REQUIRED_VALUE="
call set "REQUIRED_VALUE=%%%~1%%"
if not defined REQUIRED_VALUE (
  echo Variável obrigatória ausente no env.local: %~1
  exit /b 1
)
exit /b 0
