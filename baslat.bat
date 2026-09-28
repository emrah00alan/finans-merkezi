@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PORT=8787
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /R /C:"IPv4 Address" /C:"IPv4 Adresi"') do set IP=%%A
set IP=%IP: =%
echo.
echo ================================================
echo        FINANS MERKEZI - iPHONE LOKAL
echo ================================================
echo.
if defined IP (
  echo iPhone Safari adresi:
  echo   http://%IP%:%PORT%/
) else (
  echo Bilgisayarin yerel IP adresi bulunamadi.
  echo ipconfig komutuyla IPv4 adresine bakabilirsin.
)
echo.
echo iPhone ve bilgisayar AYNI Wi-Fi'da olmali.
echo Ilk acilista Windows Guvenlik Duvari izin isterse Ozel Ag icin izin ver.
echo Durdurmak icin bu pencereyi kapat.
echo.
where py >nul 2>&1
if %errorlevel%==0 (
  py -m http.server %PORT% --bind 0.0.0.0
  goto :eof
)
where python >nul 2>&1
if %errorlevel%==0 (
  python -m http.server %PORT% --bind 0.0.0.0
  goto :eof
)
echo Python bulunamadi. Python 3 kurulu olmali.
pause
