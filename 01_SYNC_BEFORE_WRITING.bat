@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Photographic Journal - Sync Before Writing

echo ==================================================
echo   Sync GitHub changes before writing
echo ==================================================
echo.

git status --short --branch
echo.
echo Pulling the latest main branch...

git pull --ff-only origin main
if not errorlevel 1 goto success

echo.
echo Direct connection failed. Retrying with proxy 127.0.0.1:7890...
git -c http.proxy=http://127.0.0.1:7890 pull --ff-only origin main
if errorlevel 1 goto failure

:success
echo.
echo Sync completed. You can now edit the journal and add photos.
goto finish

:failure
echo.
echo Sync failed. No reset or force command was used.
echo Please keep this window open and check the error above.

:finish
echo.
pause
endlocal
