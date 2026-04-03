'use strict';

const fs = require('fs');
const path = require('path');

const ANDROID_SPLASH_DENSITIES = ['ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

const IOS_SPLASH_VARIANTS = [
  {
    sourceFiles: ['Splashscreen.png', 'Splashscreen@2x.png', 'Splashscreen@3x.png'],
    imagesetName: 'Splashscreen.imageset',
    contentsEntries: [
      { filename: 'Splashscreen.png',    idiom: 'universal', scale: '1x' },
      { filename: 'Splashscreen@2x.png', idiom: 'universal', scale: '2x' },
      { filename: 'Splashscreen@3x.png', idiom: 'universal', scale: '3x' },
    ],
  },
  {
    sourceFiles: ['Splashscreen~landscape.png', 'Splashscreen~landscape@2x.png', 'Splashscreen~landscape@3x.png'],
    imagesetName: 'Splashscreen~landscape.imageset',
    contentsEntries: [
      { filename: 'Splashscreen~landscape.png',    idiom: 'universal', scale: '1x' },
      { filename: 'Splashscreen~landscape@2x.png', idiom: 'universal', scale: '2x' },
      { filename: 'Splashscreen~landscape@3x.png', idiom: 'universal', scale: '3x' },
    ],
  },
];

/**
 * Copy Android splash screen images from the brand splash dir to mipmap directories.
 * Supports portrait (splashscreen-{density}.png) and optional landscape (splashscreen_land-{density}.png).
 */
function applyAndroidSplash(androidSplashDir, androidResDir) {
  let copied = 0;

  for (const density of ANDROID_SPLASH_DENSITIES) {
    const srcPortrait  = path.join(androidSplashDir, `splashscreen-${density}.png`);
    const srcLandscape = path.join(androidSplashDir, `splashscreen_land-${density}.png`);
    const destDir      = path.join(androidResDir, `mipmap-${density}`);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (fs.existsSync(srcPortrait)) {
      fs.copyFileSync(srcPortrait, path.join(destDir, 'splashscreen.png'));
      copied++;
    }

    if (fs.existsSync(srcLandscape)) {
      fs.copyFileSync(srcLandscape, path.join(destDir, 'splashscreen_land.png'));
    }
  }

  if (copied > 0) {
    console.log(`  ✓ Copied ${copied} Android splash image(s) to mipmap directories`);
  }
}

/**
 * Find all directories with the given name under iosProjectDir.
 */
function findImagesetDirs(iosProjectDir, imagesetName) {
  const results = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === imagesetName) results.push(full);
      else if (!entry.name.startsWith('.')) scan(full);
    }
  };
  scan(iosProjectDir);
  return results;
}

/**
 * Copy iOS splash screen images from the brand splash dir to the corresponding
 * imageset directories and regenerate Contents.json.
 * Handles both portrait (Splashscreen[@Nx].png) and landscape (Splashscreen~landscape[@Nx].png).
 */
function applyIosSplash(iosSplashDir, iosProjectDir) {
  let totalCopied = 0;

  for (const variant of IOS_SPLASH_VARIANTS) {
    const present = variant.sourceFiles.filter(f => fs.existsSync(path.join(iosSplashDir, f)));
    if (present.length === 0) continue;

    const imagesetDirs = findImagesetDirs(iosProjectDir, variant.imagesetName);
    const contentsImages = variant.contentsEntries.filter(e => present.includes(e.filename));
    const contentsJson = JSON.stringify({ images: contentsImages, info: { author: 'xcode', version: 1 } }, null, 2) + '\n';

    if (imagesetDirs.length > 0) {
      for (const imageset of imagesetDirs) {
        for (const f of fs.readdirSync(imageset)) {
          if (f !== 'Contents.json' && !f.endsWith('.png')) {
            fs.unlinkSync(path.join(imageset, f));
          }
        }
        for (const png of present) {
          fs.copyFileSync(path.join(iosSplashDir, png), path.join(imageset, png));
        }
        fs.writeFileSync(path.join(imageset, 'Contents.json'), contentsJson, 'utf8');
      }
      totalCopied += present.length;
    } else {
      console.log(`  ⚠ ${variant.imagesetName} not found in ios/`);
    }
  }

  if (totalCopied > 0) {
    console.log(`  ✓ Copied ${totalCopied} iOS splash image(s) and updated Contents.json`);
  }
}

module.exports = { applyAndroidSplash, applyIosSplash };
