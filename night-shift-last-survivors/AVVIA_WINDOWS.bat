@echo off
setlocal
cd /d "%~dp0"
title NIGHT SHIFT - LAST SURVIVORS
color 0B
echo.
echo  ==========================================
echo       NIGHT SHIFT - LAST SURVIVORS
 echo  ==========================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo ERRORE: Node.js non trovato.
  echo Installa Node.js LTS da https://nodejs.org
  echo e riavvia questo file.
  pause
  exit /b 1
)
if not exist node_modules\three\build\three.module.js (
  echo [1/2] Installazione librerie... necessario Internet solo alla prima esecuzione.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Installazione non riuscita. Controlla Internet e riprova.
    pause
    exit /b 1
  )
)
echo [2/2] Avvio server in corso...
echo Apri il browser su http://localhost:3000
echo Per fermare il server chiudi la finestra o premi Ctrl+C.
echo.
node server.js
pause
