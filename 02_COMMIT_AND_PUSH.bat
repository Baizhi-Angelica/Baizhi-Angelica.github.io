@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Photographic Journal - Commit and Push

echo ==================================================
echo   Commit journal content and all changed photos
echo ==================================================
echo.

if not exist "node_modules\sharp\package.json" (
  echo Installing the required local image tool...
  call npm.cmd ci
  if errorlevel 1 goto failure
)

echo Optimizing new JPG and PNG photos...
call npm.cmd run photos
if errorlevel 1 goto failure
echo.

echo Selecting all local website changes...
git add --all
if errorlevel 1 goto failure

git diff --cached --quiet
if not errorlevel 1 goto push

echo.
echo Changes selected for this commit:
git diff --cached --stat
echo.

git commit -m "Update photographic journal"
if errorlevel 1 goto failure

:push
echo.
echo Pushing local commits to GitHub...
git push origin main
if not errorlevel 1 goto success

echo.
echo Direct connection failed. Retrying with proxy 127.0.0.1:7890...
git -c http.proxy=http://127.0.0.1:7890 push origin main
if errorlevel 1 goto failure

:success
echo.
echo Upload completed. GitHub Actions will update the website automatically.
goto finish

:failure
echo.
echo Upload was not completed. No reset or force command was used.
echo Please keep this window open and check the error above.

:finish
echo.
pause
endlocal
