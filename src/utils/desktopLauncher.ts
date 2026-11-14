/**
 * Утилиты для создания десктопного ярлыка и отдельного окна Windows для операторов МТС
 */

export function downloadWindowsUrlShortcut(): void {
  const currentUrl = window.location.href;
  const content = `[InternetShortcut]
URL=${currentUrl}
IconIndex=0
`;

  const blob = new Blob([content], { type: 'application/internet-shortcut;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'МТС_Сохранение_Клиентов_MNP.url';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadWindowsAppLauncher(): void {
  const currentUrl = window.location.href;
  // Скрипт запускает приложение в режиме отдельного окна (--app) без рамок браузера
  const batContent = `@echo off
chcp 65001 >nul
title МТС Сохранение Клиентов MNP

:: Попытка запуска в режиме отдельного окна (Edge, Chrome, Яндекс.Браузер)
start msedge --app="${currentUrl}" 2>nul
if %errorlevel% equ 0 exit

start chrome --app="${currentUrl}" 2>nul
if %errorlevel% equ 0 exit

start browser --app="${currentUrl}" 2>nul
if %errorlevel% equ 0 exit

:: Резервный запуск в браузере по умолчанию
start "" "${currentUrl}"
exit
`;

  const blob = new Blob([batContent], { type: 'application/x-bat;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Запустить_МТС_Десктоп.bat';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
