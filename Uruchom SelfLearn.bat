@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto missing_node

call :check_server
if not errorlevel 1 goto open_app

start "SelfLearn server" /min cmd.exe /c node scripts\serve.mjs

for /L %%I in (1,1,30) do (
  call :check_server
  if not errorlevel 1 goto open_app
  timeout /t 1 /nobreak >nul
)

echo Nie udalo sie uruchomic serwera SelfLearn pod http://localhost:8080.
echo Sprawdz, czy port 8080 jest wolny, a potem sprobuj ponownie.
pause
exit /b 1

:open_app
start "" "http://localhost:8080"
exit /b 0

:check_server
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/' -TimeoutSec 1; if ($r.Content -like '*src/main.js*') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:missing_node
echo SelfLearn wymaga Node.js, ale nie znaleziono polecenia node.
echo Zainstaluj Node.js LTS, a potem uruchom ten plik ponownie.
echo https://nodejs.org/
pause
exit /b 1
