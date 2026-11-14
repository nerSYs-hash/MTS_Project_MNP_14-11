/**
 * Скрипт сборки бинарного архива обновления update.asar / app.asar
 * Запуск: node scripts/create_update_pkg.cjs [версия]
 *
 * ПРАВИЛА ВЕРСИОНИРОВАНИЯ (SemVer X.Y.Z):
 * - 3-я цифра (Z): Мелкие обновления/фиксы (например, 2.7.6)
 * - 2-я цифра (Y): Крупные обновления/новые разделы (например, 2.8.0)
 * - 1-я цифра (X): Глобальные обновления/редизайн (например, 3.0.0)
 */
const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '2.7.7';

const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Генерируем бинарные архивы public/update.asar и public/app.asar из папки dist (если dist собран)
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  try {
    // Удаляем из dist старые копии .asar и .mtsupdate, чтобы они не упаковывались рекурсивно внутрь нового архива
    for (const f of fs.readdirSync(distDir)) {
      if (f.endsWith('.asar') || f.endsWith('.mtsupdate')) {
        fs.unlinkSync(path.join(distDir, f));
      }
    }

    // Очищаем dist/assets/aistudio от тяжелых видео и архивов (.mp4, .zip), оставляя все .png скриншоты для гайда
    const distAssetsDir = path.join(distDir, 'assets', 'aistudio');
    if (fs.existsSync(distAssetsDir)) {
      for (const f of fs.readdirSync(distAssetsDir)) {
        if (f.endsWith('.mp4') || f.endsWith('.zip')) {
          fs.unlinkSync(path.join(distAssetsDir, f));
        }
      }
    }

    const asar = require('@electron/asar');
    const updateAsarDest = path.join(publicDir, 'update.asar');
    const appAsarDest = path.join(publicDir, 'app.asar');
    const versionedAsarDest = path.join(publicDir, `${version}.asar`);

    asar
      .createPackage(distDir, updateAsarDest)
      .then(() => {
        fs.copyFileSync(updateAsarDest, appAsarDest);
        fs.copyFileSync(updateAsarDest, versionedAsarDest);
        const sizeMb = (fs.statSync(updateAsarDest).size / (1024 * 1024)).toFixed(2);
        console.log(`📦 Сформирован бинарный архив автообновления v${version}: ${updateAsarDest} (${sizeMb} МБ)`);
        console.log(`📦 Сформирован именованный архив версии: ${versionedAsarDest} (${sizeMb} МБ)`);
        console.log(`📦 Обновлен архив ядра v${version}: ${appAsarDest} (${sizeMb} МБ)`);
      })
      .catch((err) => {
        console.warn('Не удалось упаковать update.asar:', err);
      });
  } catch (err) {
    console.warn('Модуль @electron/asar не найден, пропуск сборки update.asar:', err);
  }
}
