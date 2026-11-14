@echo off
chcp 65001 >nul
title МТС Сохранение | MNP Исходящие

echo =========================================================
echo    МТС Сохранение ^| MNP Исходящие (АРМ Оператора v2.7.3)
echo =========================================================
echo.
echo Запуск рабочего места оператора в режиме приложения...
echo.

set "APP_URL=https://ais-pre-ieqxiwj5sgc5fo7g7ryqkc-727120223819.us-west2.run.app"

rem 1. Попытка запустить через Microsoft Edge в режиме отдельного приложения (без вкладок)
start "" msedge.exe --app="%APP_URL%" 2>nul
if %errorlevel% equ 0 exit

rem 2. Если Edge не найден, попытка через Google Chrome
start "" chrome.exe --app="%APP_URL%" 2>nul
if %errorlevel% equ 0 exit

rem 3. Стандартный запуск через системный браузер по умолчанию
start "" "%APP_URL%"
exit
