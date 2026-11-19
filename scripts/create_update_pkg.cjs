/**
 * Скрипт сборки универсального бинарного архива update.asar / app.asar / 2.8.0.asar
 * Запуск: node scripts/create_update_pkg.cjs [версия]
 *
 * Сохраняет все иллюстрации руководства и обложку релиза v2.8.0 (assets/aistudio/*.png),
 * исключая только тяжелые видео (.mp4) и архивы (.zip).
 */
const fs = require('fs');
const path = require('path');

const version = process.argv[2] || '2.8.0';
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');
const stageDir = path.join(rootDir, '.asar-stage');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Иллюстрации гайда и обложки релиза, которые используются в приложении
const KEEP_GUIDE_IMAGES = new Set([
  'image_e3a02193.png',
  'image__60__92681f93.png',
  'image_c700471e.png',
  'image_971945eb.png',
  'image_adcc0caa.png',
  'image_2948411a.png',
  'image_4e08b23e.png',
  'image_c92fc6b6.png',
  'image_0a8a545d.png',
  'image_21192a47.png',
  'image_ea38357d.png',
]);

if (fs.existsSync(distDir)) {
  try {
    // 1. Удаляем из dist старые копии .asar, .mtsupdate и .zip
    for (const f of fs.readdirSync(distDir)) {
      if (f.endsWith('.asar') || f.endsWith('.mtsupdate') || f.endsWith('.zip')) {
        fs.unlinkSync(path.join(distDir, f));
      }
    }

    // 2. В dist/assets/aistudio оставляем все используемые иллюстрации гайда и обложку v2.8.0
    const distAssetsDir = path.join(distDir, 'assets', 'aistudio');
    if (fs.existsSync(distAssetsDir)) {
      for (const f of fs.readdirSync(distAssetsDir)) {
        if (!KEEP_GUIDE_IMAGES.has(f)) {
          fs.unlinkSync(path.join(distAssetsDir, f));
        }
      }
    }

    // 3. Готовим гибридную директорию .asar-stage
    if (fs.existsSync(stageDir)) {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stageDir, { recursive: true });

    // Помещаем собранный проект в stageDir/dist
    const nestedDist = path.join(stageDir, 'dist');
    fs.mkdirSync(nestedDist, { recursive: true });
    fs.cpSync(distDir, nestedDist, { recursive: true });

    // Копируем папку иллюстраций assets/aistudio также в корень stageDir/assets/aistudio,
    // чтобы относительные пути src="assets/aistudio/..." открывались в любом режиме загрузки
    if (fs.existsSync(distAssetsDir)) {
      const rootAssetsAistudio = path.join(stageDir, 'assets', 'aistudio');
      fs.mkdirSync(rootAssetsAistudio, { recursive: true });
      fs.cpSync(distAssetsDir, rootAssetsAistudio, { recursive: true });
    }

    // В корень stageDir кладем index.html, перенаправляющий пути бандла на ./dist/assets/ и ./dist/fonts/
    const distIndexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distIndexHtmlPath)) {
      const rawHtml = fs.readFileSync(distIndexHtmlPath, 'utf-8');
      const rootHtml = rawHtml
        .replace(/(src|href)="\.\/assets\//g, '$1="./dist/assets/')
        .replace(/(src|href)="\/assets\//g, '$1="./dist/assets/')
        .replace(/(src|href)="\.\/fonts\//g, '$1="./dist/fonts/')
        .replace(/(src|href)="\/fonts\//g, '$1="./dist/fonts/');
      fs.writeFileSync(path.join(stageDir, 'index.html'), rootHtml, 'utf-8');
    }

    // Копируем иконки в корень и в stageDir/public
    const stagePublicDir = path.join(stageDir, 'public');
    fs.mkdirSync(stagePublicDir, { recursive: true });
    for (const iconFile of ['favicon.ico', 'pwa-512x512.png', 'pwa-192x192.png', 'icon.png', 'icon.svg']) {
      const srcIcon = path.join(publicDir, iconFile);
      if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(stageDir, iconFile));
        fs.copyFileSync(srcIcon, path.join(stagePublicDir, iconFile));
      }
    }

    // Копируем electron/main.cjs, electron/preload.cjs и package.json
    const stageElectronDir = path.join(stageDir, 'electron');
    fs.mkdirSync(stageElectronDir, { recursive: true });
    const mainCjsSrc = path.join(rootDir, 'electron', 'main.cjs');
    const preloadCjsSrc = path.join(rootDir, 'electron', 'preload.cjs');
    if (fs.existsSync(mainCjsSrc)) {
      fs.copyFileSync(mainCjsSrc, path.join(stageElectronDir, 'main.cjs'));
    }
    if (fs.existsSync(preloadCjsSrc)) {
      fs.copyFileSync(preloadCjsSrc, path.join(stageElectronDir, 'preload.cjs'));
    }

    const pkgJsonSrc = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgJsonSrc)) {
      const pkgObj = JSON.parse(fs.readFileSync(pkgJsonSrc, 'utf-8'));
      pkgObj.version = version;
      pkgObj.buildTime = Date.now();
      fs.writeFileSync(
        path.join(stageDir, 'package.json'),
        JSON.stringify(pkgObj, null, 2),
        'utf-8'
      );
    }

    const asar = require('@electron/asar');
    const updateAsarDest = path.join(publicDir, 'update.asar');
    const appAsarDest = path.join(publicDir, 'app.asar');
    const versionedAsarDest = path.join(publicDir, `${version}.asar`);

    const distUpdateAsarDest = path.join(distDir, 'update.asar');
    const distAppAsarDest = path.join(distDir, 'app.asar');
    const distVersionedAsarDest = path.join(distDir, `${version}.asar`);

    const portableAppAsar = path.join(rootDir, 'MTS_MNP_Windows_App', 'resources', 'app.asar');

    asar
      .createPackage(stageDir, updateAsarDest)
      .then(() => {
        // Проверка целостности архива перед публикацией
        const entries = asar.listPackage(updateAsarDest);
        const hasMain = entries.includes('/electron/main.cjs');
        const hasPreload = entries.includes('/electron/preload.cjs');
        const hasDistHtml = entries.includes('/dist/index.html');
        if (!hasMain || !hasPreload || !hasDistHtml) {
          throw new Error(
            `Неполный архив update.asar: main=${hasMain}, preload=${hasPreload}, distHtml=${hasDistHtml}`
          );
        }

        fs.copyFileSync(updateAsarDest, appAsarDest);
        fs.copyFileSync(updateAsarDest, versionedAsarDest);
        fs.copyFileSync(updateAsarDest, distUpdateAsarDest);
        fs.copyFileSync(updateAsarDest, distAppAsarDest);
        fs.copyFileSync(updateAsarDest, distVersionedAsarDest);

        if (fs.existsSync(path.dirname(portableAppAsar))) {
          fs.copyFileSync(updateAsarDest, portableAppAsar);
        }

        if (fs.existsSync(stageDir)) {
          fs.rmSync(stageDir, { recursive: true, force: true });
        }
        const sizeMb = (fs.statSync(updateAsarDest).size / (1024 * 1024)).toFixed(2);
        console.log(`📦 Сформирован архив автообновления v${version}: ${updateAsarDest} (${sizeMb} МБ)`);
        console.log(`📦 Сформирован именованный архив версии: ${versionedAsarDest} (${sizeMb} МБ)`);
        console.log(`📦 Обновлен архив ядра v${version}: ${appAsarDest} (${sizeMb} МБ)`);
        console.log(`📦 Синхронизированы архивы раздачи в dist/ (${sizeMb} МБ)`);
      })
      .catch((err) => {
        if (fs.existsSync(stageDir)) {
          fs.rmSync(stageDir, { recursive: true, force: true });
        }
        console.error('Не удалось упаковать update.asar:', err);
        process.exitCode = 1;
      });
  } catch (err) {
    if (fs.existsSync(stageDir)) {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
    console.warn('Модуль @electron/asar не найден, пропуск сборки update.asar:', err);
  }
}
