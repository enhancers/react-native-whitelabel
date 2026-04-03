'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Copy brand-specific google-services.json to android/app/google-services.json.
 * No-op if the source file does not exist.
 */
function applyAndroidGoogleServices(srcPath, projectRoot) {
  if (!fs.existsSync(srcPath)) return;
  const dest = path.join(projectRoot, 'android', 'app', 'google-services.json');
  fs.copyFileSync(srcPath, dest);
  console.log(`  ✓ Updated: android/app/google-services.json`);
}

/**
 * Copy brand-specific GoogleService-Info.plist to ios/<appDir>/GoogleService-Info.plist.
 * Targets every app directory that contains an Info.plist (same heuristic used elsewhere).
 * No-op if the source file does not exist.
 */
function applyIosGoogleServices(srcPath, projectRoot) {
  if (!fs.existsSync(srcPath)) return;
  const iosProjectDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosProjectDir)) return;

  const appDirs = fs.readdirSync(iosProjectDir).filter(f => {
    const full = path.join(iosProjectDir, f);
    return fs.statSync(full).isDirectory() && !f.endsWith('.xcodeproj') && !f.endsWith('.xcworkspace');
  });

  for (const appDir of appDirs) {
    if (!fs.existsSync(path.join(iosProjectDir, appDir, 'Info.plist'))) continue;
    fs.copyFileSync(srcPath, path.join(iosProjectDir, appDir, 'GoogleService-Info.plist'));
    console.log(`  ✓ Updated: ios/${appDir}/GoogleService-Info.plist`);
  }
}

module.exports = { applyAndroidGoogleServices, applyIosGoogleServices };
