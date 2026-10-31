@echo off
chcp 65001 > nul
title SEC4 - GitHub Automatic Uploader (Al5i1/sec4)
echo ========================================================
echo   جاري رفع موقع SEC4 تلقائياً إلى:
echo   https://github.com/Al5i1/sec4.git
echo ========================================================
echo.
"C:\laragon\bin\git\bin\git.exe" -c safe.directory="%~dp0" remote remove origin 2>nul
"C:\laragon\bin\git\bin\git.exe" -c safe.directory="%~dp0" remote add origin https://github.com/Al5i1/sec4.git
"C:\laragon\bin\git\bin\git.exe" -c safe.directory="%~dp0" branch -M main
"C:\laragon\bin\git\bin\git.exe" -c safe.directory="%~dp0" push -u origin main --force
echo.
echo ========================================================
echo   تم الرفع بنجاح!
echo   الآن افتح: https://github.com/Al5i1/sec4/settings/pages
echo   واختر Branch: main ثم اضغط Save
echo   رابط موقعك سيكون: https://al5i1.github.io/sec4/
echo ========================================================
pause
