#!/usr/bin/env node

/**
 * RNWL CLI - React Native White Label
 * 
 * Commands:
 *   rnwl apply-white-label <brand>  - Apply a white label configuration
 * 
 * Usage:
 *   rnwl apply-white-label default
 *   rnwl apply-white-label brand-a
 * 
 * Configuration files should be in: ./configs/<brand>.yml
 */

const fs = require('fs');
const path = require('path');
const { setPlistKey, removePlistKey } = require('./plistUtils');
const { wrapExistingIntentFilter } = require('./manifestUtils');
const { applyAndroidSplash, applyIosSplash } = require('./splashUtils');
const { applyAndroidGoogleServices, applyIosGoogleServices } = require('./googleServicesUtils');

// Try to require js-yaml
let yaml;
try {
  yaml = require('js-yaml');
} catch (e) {
  console.error('❌ Error: js-yaml module not found');
  console.error('Please install it in your project: npm install js-yaml');
  process.exit(1);
}

const command = process.argv[2];
const brand = process.argv[3];

// Parse optional flags from remaining args
const args = process.argv.slice(4);
function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const androidVersionCode = getFlag('--androidVersionCode');
const androidVersionName = getFlag('--androidVersionName');
const iosCurrentProjectVersion = getFlag('--iosCurrentProjectVersion');
const iosMarketingVersion = getFlag('--iosMarketingVersion');

// Show help if no command
if (!command) {
  console.log(`
RNWL - React Native White Label CLI

Usage:
  rnwl apply-white-label <brand> [options]    Apply a white label configuration
  rnwl --version                               Show version
  rnwl --help                                  Show this help message

Options:
  --androidVersionCode <code>          Override Android versionCode in build.gradle
  --androidVersionName <name>          Override Android versionName in build.gradle
  --iosCurrentProjectVersion <ver>     Override CURRENT_PROJECT_VERSION in project.pbxproj
  --iosMarketingVersion <ver>          Override MARKETING_VERSION in project.pbxproj

Examples:
  rnwl apply-white-label blue
  rnwl apply-white-label blue --androidVersionCode 42 --androidVersionName 2.1.0
  rnwl apply-white-label blue --iosCurrentProjectVersion 42 --iosMarketingVersion 2.1.0

Configuration files should be located in: ./rnwl-configs/<brand>/config.yml
  `);
  process.exit(0);
}

if (command === '--version') {
  const pkg = require('../package.json');
  console.log(`RNWL v${pkg.version}`);
  process.exit(0);
}

if (command === '--help') {
  console.log(`
RNWL - React Native White Label CLI

Usage:
  rnwl apply-white-label <brand> [options]    Apply a white label configuration
  rnwl --version                               Show version
  rnwl --help                                  Show this help message

Options:
  --androidVersionCode <code>          Override Android versionCode in build.gradle
  --androidVersionName <name>          Override Android versionName in build.gradle
  --iosCurrentProjectVersion <ver>     Override CURRENT_PROJECT_VERSION in project.pbxproj
  --iosMarketingVersion <ver>          Override MARKETING_VERSION in project.pbxproj

Examples:
  rnwl apply-white-label blue
  rnwl apply-white-label blue --androidVersionCode 42 --androidVersionName 2.1.0
  rnwl apply-white-label blue --iosCurrentProjectVersion 42 --iosMarketingVersion 2.1.0

Configuration files should be located in: ./rnwl-configs/<brand>/config.yml
  `);
  process.exit(0);
}

if (command !== 'apply-white-label') {
  console.error(`❌ Unknown command: ${command}`);
  console.log('Use "rnwl --help" for usage information');
  process.exit(1);
}

if (!brand) {
  console.error('❌ Brand name is required');
  console.log('Usage: rnwl apply-white-label <brand>');
  process.exit(1);
}

// Get the working directory where the command is executed
const CWD = process.cwd();

// Find rnwl-configs/ directory:
// 1. Walk up from CWD (handles running from inside the project)
// 2. Search immediate subdirectories of CWD (handles monorepo root)
function findConfigsDir(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'rnwl-configs');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  // Not found walking up — search one level of subdirectories
  try {
    const entries = fs.readdirSync(startDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const candidate = path.join(startDir, entry.name, 'rnwl-configs');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) {}
  return null;
}

const CONFIGS_DIR = findConfigsDir(CWD) || path.join(CWD, 'rnwl-configs');
const PROJECT_ROOT = path.dirname(CONFIGS_DIR);

// Utility functions
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`❌ Error reading file: ${filePath}`);
    throw err;
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Updated: ${path.relative(PROJECT_ROOT, filePath)}`);
  } catch (err) {
    console.error(`❌ Error writing file: ${filePath}`);
    throw err;
  }
}

function loadConfig(brandName) {
  const configPath = path.join(CONFIGS_DIR, brandName, 'config.yml');
  
  if (!fs.existsSync(configPath)) {
    console.error(`\n❌ Configuration file not found: ${configPath}`);
    if (fs.existsSync(CONFIGS_DIR)) {
      console.log(`\nAvailable configurations:`);
      const configs = fs.readdirSync(CONFIGS_DIR)
        .filter(f => fs.statSync(path.join(CONFIGS_DIR, f)).isDirectory());
      if (configs.length > 0) {
        configs.forEach(cfg => console.log(`  - ${cfg}`));
      } else {
        console.log(`  (no configuration folders found in configs/)`);
      }
    }
    process.exit(1);
  }

  try {
    const configContent = readFile(configPath);
    const config = yaml.load(configContent);
    console.log(`✓ Configuration loaded: ${path.relative(PROJECT_ROOT, configPath)}`);
    return config;
  } catch (err) {
    console.error(`❌ Error parsing YAML configuration: ${err.message}`);
    process.exit(1);
  }
}

// ─── Deep link helpers ───────────────────────────────────────────────────────

const DEEPLINK_SCHEME_MARKER_START      = '<!-- RNWL:deeplinkScheme -->';
const DEEPLINK_SCHEME_MARKER_END        = '<!-- /RNWL:deeplinkScheme -->';
const UNIVERSAL_LINK_MARKER_START       = '<!-- RNWL:universalLinkDomain -->';
const UNIVERSAL_LINK_MARKER_END         = '<!-- /RNWL:universalLinkDomain -->';
const WEBCREDENTIALS_MARKER_START       = '<!-- RNWL:webcredentialsDomain -->';
const WEBCREDENTIALS_MARKER_END         = '<!-- /RNWL:webcredentialsDomain -->';

/**
 * Add or update deep link intent-filters inside AndroidManifest.xml.
 * Uses marker comments so the block is replaced cleanly on subsequent runs.
 */
function applyAndroidDeepLinks(manifestPath, deeplinkScheme, universalLinkDomain, webcredentialsDomain) {
  let content = readFile(manifestPath);

  // --- custom URL scheme ---
  const schemeBlock = deeplinkScheme
    ? `${DEEPLINK_SCHEME_MARKER_START}\n        <intent-filter>\n            <action android:name="android.intent.action.VIEW" />\n            <category android:name="android.intent.category.DEFAULT" />\n            <category android:name="android.intent.category.BROWSABLE" />\n            <data android:scheme="${deeplinkScheme}" />\n        </intent-filter>\n        ${DEEPLINK_SCHEME_MARKER_END}`
    : null;

  if (content.includes(DEEPLINK_SCHEME_MARKER_START)) {
    // Replace existing block (or remove it if scheme is now absent)
    content = content.replace(
      new RegExp(`${escapeRegex(DEEPLINK_SCHEME_MARKER_START)}[\\s\\S]*?${escapeRegex(DEEPLINK_SCHEME_MARKER_END)}`),
      schemeBlock || ''
    );
  } else if (schemeBlock) {
    const wrapped = wrapExistingIntentFilter(
      content,
      new RegExp(`android:scheme="${escapeRegex(deeplinkScheme)}"`),
      DEEPLINK_SCHEME_MARKER_START,
      DEEPLINK_SCHEME_MARKER_END
    );
    content = wrapped || content.replace('</activity>', `        ${schemeBlock}\n      </activity>`);
  }

  // --- universal / App Links ---
  const universalBlock = universalLinkDomain
    ? `${UNIVERSAL_LINK_MARKER_START}\n        <intent-filter android:autoVerify="true">\n            <action android:name="android.intent.action.VIEW" />\n            <category android:name="android.intent.category.DEFAULT" />\n            <category android:name="android.intent.category.BROWSABLE" />\n            <data android:scheme="https" android:host="${universalLinkDomain}" />\n        </intent-filter>\n        ${UNIVERSAL_LINK_MARKER_END}`
    : null;

  if (content.includes(UNIVERSAL_LINK_MARKER_START)) {
    content = content.replace(
      new RegExp(`${escapeRegex(UNIVERSAL_LINK_MARKER_START)}[\\s\\S]*?${escapeRegex(UNIVERSAL_LINK_MARKER_END)}`),
      universalBlock || ''
    );
  } else if (universalBlock) {
    const wrapped = wrapExistingIntentFilter(
      content,
      new RegExp(`android:host="${escapeRegex(universalLinkDomain)}"`),
      UNIVERSAL_LINK_MARKER_START,
      UNIVERSAL_LINK_MARKER_END
    );
    content = wrapped || content.replace('</activity>', `        ${universalBlock}\n      </activity>`);
  }

  // --- webcredentials domain (only when different from universalLinkDomain) ---
  const needsWebcredentialsBlock = webcredentialsDomain && webcredentialsDomain !== universalLinkDomain;
  const webcredentialsBlock = needsWebcredentialsBlock
    ? `${WEBCREDENTIALS_MARKER_START}\n        <intent-filter android:autoVerify="true">\n            <action android:name="android.intent.action.VIEW" />\n            <category android:name="android.intent.category.DEFAULT" />\n            <category android:name="android.intent.category.BROWSABLE" />\n            <data android:scheme="https" android:host="${webcredentialsDomain}" />\n        </intent-filter>\n        ${WEBCREDENTIALS_MARKER_END}`
    : null;

  if (content.includes(WEBCREDENTIALS_MARKER_START)) {
    content = content.replace(
      new RegExp(`${escapeRegex(WEBCREDENTIALS_MARKER_START)}[\\s\\S]*?${escapeRegex(WEBCREDENTIALS_MARKER_END)}`),
      webcredentialsBlock || ''
    );
  } else if (webcredentialsBlock) {
    const wrapped = wrapExistingIntentFilter(
      content,
      new RegExp(`android:host="${escapeRegex(webcredentialsDomain)}"`),
      WEBCREDENTIALS_MARKER_START,
      WEBCREDENTIALS_MARKER_END
    );
    content = wrapped || content.replace('</activity>', `        ${webcredentialsBlock}\n      </activity>`);
  }

  writeFile(manifestPath, content);
}

/**
 * Configure deep links and entitlements in the iOS project:
 *  - deeplinkSchemes      → CFBundleURLTypes in Info.plist (array of schemes)
 *  - universalLinkDomain  → applinks:<domain> in associated-domains entitlement
 *  - webcredentialsDomain → webcredentials:<domain> in associated-domains entitlement
 *  - iosEntitlements      → arbitrary additional keys in .entitlements
 */
function applyIosDeepLinks(iosDir, deeplinkSchemes, universalLinkDomain, webcredentialsDomain, iosEntitlements) {
  const appDirs = fs.readdirSync(iosDir).filter(f => {
    const full = path.join(iosDir, f);
    return fs.statSync(full).isDirectory() && !f.endsWith('.xcodeproj') && !f.endsWith('.xcworkspace');
  });

  for (const appDir of appDirs) {
    const infoPlistPath = path.join(iosDir, appDir, 'Info.plist');
    if (!fs.existsSync(infoPlistPath)) continue;

    // --- custom URL scheme → CFBundleURLTypes ---
    let plistContent = readFile(infoPlistPath);
    const urlTypesBlock = deeplinkSchemes.length > 0
      ? `\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n${deeplinkSchemes.map(s => `\t\t\t\t<string>${s}</string>`).join('\n')}\n\t\t\t</array>\n\t\t</dict>\n\t</array>`
      : null;

    if (plistContent.includes('<key>CFBundleURLTypes</key>')) {
      if (urlTypesBlock) {
        plistContent = plistContent.replace(
          /<key>CFBundleURLTypes<\/key>\s*<array>[\s\S]*?\n\t<\/array>/,
          urlTypesBlock
        );
      } else {
        plistContent = plistContent.replace(
          /\s*<key>CFBundleURLTypes<\/key>\s*<array>[\s\S]*?\n\t<\/array>/,
          ''
        );
      }
    } else if (urlTypesBlock) {
      plistContent = plistContent.replace('</dict>\n</plist>', `${urlTypesBlock}\n</dict>\n</plist>`);
    }
    writeFile(infoPlistPath, plistContent);

    // --- .entitlements: universalLinkDomain + iosEntitlements ---
    const entitlementsPath = path.join(iosDir, appDir, `${appDir}.entitlements`);

    // Collect updates and removals
    const updates = {}; // key → value to set
    if (universalLinkDomain) {
      const associatedDomains = [`applinks:${universalLinkDomain}`];
      if (webcredentialsDomain) associatedDomains.push(`webcredentials:${webcredentialsDomain}`);
      updates['com.apple.developer.associated-domains'] = associatedDomains;
    } else if (webcredentialsDomain) {
      updates['com.apple.developer.associated-domains'] = [`webcredentials:${webcredentialsDomain}`];
    }
    if (iosEntitlements && typeof iosEntitlements === 'object') {
      for (const [key, value] of Object.entries(iosEntitlements)) {
        updates[key] = value;
      }
    }

    const hasUpdates = Object.keys(updates).length > 0;

    if (hasUpdates) {
      // Read existing file or create a blank entitlements skeleton
      let content;
      if (fs.existsSync(entitlementsPath)) {
        content = readFile(entitlementsPath);
      } else {
        content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n</dict>\n</plist>\n`;
        console.log(`  ✓ Created: ${path.relative(path.dirname(iosDir), entitlementsPath)}`);
      }

      // If universalLinkDomain was removed, clean up associated-domains first
      if (!universalLinkDomain) {
        content = removePlistKey(content, 'com.apple.developer.associated-domains');
      }

      for (const [key, value] of Object.entries(updates)) {
        content = setPlistKey(content, key, value);
      }

      writeFile(entitlementsPath, content);

      // Ensure CODE_SIGN_ENTITLEMENTS points to this file
      const xcodeprojDirs = fs.readdirSync(iosDir).filter(f => f.endsWith('.xcodeproj'));
      if (xcodeprojDirs.length > 0) {
        const pbxprojPath = path.join(iosDir, xcodeprojDirs[0], 'project.pbxproj');
        if (fs.existsSync(pbxprojPath)) {
          let pbx = readFile(pbxprojPath);
          const entitlementsRef = `${appDir}/${appDir}.entitlements`;
          if (pbx.includes('CODE_SIGN_ENTITLEMENTS')) {
            pbx = pbx.replace(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g, `CODE_SIGN_ENTITLEMENTS = ${entitlementsRef};`);
          } else {
            pbx = pbx.replace(
              /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
              match => `CODE_SIGN_ENTITLEMENTS = ${entitlementsRef};\n\t\t\t\t${match}`
            );
          }
          writeFile(pbxprojPath, pbx);
        }
      }
    } else if (fs.existsSync(entitlementsPath)) {
      // No entitlements in config — remove associated-domains if present, leave the rest
      let content = readFile(entitlementsPath);
      content = removePlistKey(content, 'com.apple.developer.associated-domains');
      writeFile(entitlementsPath, content);
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────────────

// Main function
async function main() {
  console.log(`\n🎨 RNWL - Applying white label configuration: ${brand}\n`);

  try {
    const config = loadConfig(brand);
    const brandConfigDir = path.join(CONFIGS_DIR, brand);

    // Update app version
    console.log('\nUpdating app configuration...');
    const appJsonPath = path.join(PROJECT_ROOT, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(readFile(appJsonPath));
        if (config.displayName) appJson.displayName = config.displayName;
        if (config.version) appJson.version = config.version;
        writeFile(appJsonPath, JSON.stringify(appJson, null, 2));
      } catch (err) {
        console.error(`⚠️  Warning: Could not update app.json - ${err.message}`);
      }
    }

    // Update Android app_name in strings.xml
    const stringsXmlPath = path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    if (fs.existsSync(stringsXmlPath) && config.displayName) {
      const stringsContent = readFile(stringsXmlPath);
      const updated = stringsContent.replace(
        /<string name="app_name">.*?<\/string>/,
        `<string name="app_name">${config.displayName}</string>`
      );
      writeFile(stringsXmlPath, updated);
    }

    // Update Android applicationId, versionCode and versionName in build.gradle
    const buildGradlePath = path.join(PROJECT_ROOT, 'android', 'app', 'build.gradle');
    if (fs.existsSync(buildGradlePath)) {
      let gradleContent = readFile(buildGradlePath);
      if (config.packageName) {
        gradleContent = gradleContent.replace(
          /applicationId\s+"[^"]+"/,
          `applicationId "${config.packageName}"`
        );
      }
      if (androidVersionCode) {
        gradleContent = gradleContent.replace(
          /versionCode\s+\d+/,
          `versionCode ${androidVersionCode}`
        );
      }
      if (androidVersionName) {
        gradleContent = gradleContent.replace(
          /versionName\s+"[^"]+"/,
          `versionName "${androidVersionName}"`
        );
      }
      writeFile(buildGradlePath, gradleContent);
    }

    // Update iOS bundle identifier in project.pbxproj and display name in Info.plist
    const iosDir = path.join(PROJECT_ROOT, 'ios');
    if (fs.existsSync(iosDir)) {
      if (config.bundleId || iosCurrentProjectVersion || iosMarketingVersion) {
        const xcodeprojDirs = fs.readdirSync(iosDir).filter(f => f.endsWith('.xcodeproj'));
        if (xcodeprojDirs.length > 0) {
          const pbxprojPath = path.join(iosDir, xcodeprojDirs[0], 'project.pbxproj');
          if (fs.existsSync(pbxprojPath)) {
            let pbxContent = readFile(pbxprojPath);
            if (config.bundleId) {
              pbxContent = pbxContent.replace(
                /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,
                `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId};`
              );
            }
            if (iosCurrentProjectVersion) {
              pbxContent = pbxContent.replace(
                /CURRENT_PROJECT_VERSION = [^;]+;/g,
                `CURRENT_PROJECT_VERSION = ${iosCurrentProjectVersion};`
              );
            }
            if (iosMarketingVersion) {
              pbxContent = pbxContent.replace(
                /MARKETING_VERSION = [^;]+;/g,
                `MARKETING_VERSION = ${iosMarketingVersion};`
              );
            }
            writeFile(pbxprojPath, pbxContent);
          }
        }
      }
      if (config.displayName) {
        const appDirs = fs.readdirSync(iosDir).filter(f => {
          const full = path.join(iosDir, f);
          return fs.statSync(full).isDirectory() && !f.endsWith('.xcodeproj') && !f.endsWith('.xcworkspace');
        });
        for (const appDir of appDirs) {
          // Info.plist
          const infoPlistPath = path.join(iosDir, appDir, 'Info.plist');
          if (fs.existsSync(infoPlistPath)) {
            const plistContent = readFile(infoPlistPath);
            const updated = plistContent.replace(
              /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
              `$1${config.displayName}$2`
            );
            writeFile(infoPlistPath, updated);
          }
          // LaunchScreen.storyboard
          const storyboardPath = path.join(iosDir, appDir, 'LaunchScreen.storyboard');
          if (fs.existsSync(storyboardPath)) {
            const sbContent = readFile(storyboardPath);
            const updated = sbContent.replace(
              /(text=")[^"]+(" textAlignment="center" lineBreakMode="middleTruncation")/,
              `$1${config.displayName}$2`
            );
            writeFile(storyboardPath, updated);
          }
        }
      }
    }

    // Generate features file
    console.log('\nGenerating feature flags file...');
    const featuresFilePath = path.join(PROJECT_ROOT, 'rnwl.json');
    const features = config.features || {};
    const deeplinkSchemes = config.deeplinkSchemes
      ? [].concat(config.deeplinkSchemes)
      : config.deeplinkScheme ? [config.deeplinkScheme] : [];
    const deeplinkScheme = deeplinkSchemes[0] || null;

    const featuresData = {
      brand: config.brand || brand,
      packageName: config.packageName || null,
      displayName: config.displayName || null,
      deeplinkSchemes,
      universalLinkDomain: config.universalLinkDomain || null,
      colors: config.colors || null,
      params: config.params || null,
      features,
    };
    fs.writeFileSync(featuresFilePath, JSON.stringify(featuresData, null, 2), 'utf8');
    console.log(`  ✓ Generated: ${path.relative(PROJECT_ROOT, featuresFilePath)}`);

    // Configure native deep links
    console.log('\nConfiguring native deep links...');
    const androidManifestPath = path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    if (fs.existsSync(androidManifestPath)) {
      applyAndroidDeepLinks(androidManifestPath, deeplinkScheme, config.universalLinkDomain || null, config.webcredentialsDomain || null);
    }
    const iosProjectDir = path.join(PROJECT_ROOT, 'ios');
    if (fs.existsSync(iosProjectDir)) {
      applyIosDeepLinks(iosProjectDir, deeplinkSchemes, config.universalLinkDomain || null, config.webcredentialsDomain || null, config.iosEntitlements || null);
    }

    // Copy assets if they exist
    const ignoreAssets = config.ignoreAssets || false;

    if (!ignoreAssets) {
      console.log('\nProcessing assets...');
      const androidDir = path.join(brandConfigDir, 'android', 'icons');
      const iosDir = path.join(brandConfigDir, 'ios', 'icons');

      // Android icons: ic_launcher-{density}.png → mipmap-{density}/ic_launcher.png + ic_launcher_foreground.png
      if (fs.existsSync(androidDir)) {
        const ANDROID_DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
        const androidResDir = path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res');
        let copied = 0;

        for (const density of ANDROID_DENSITIES) {
          const srcLauncher = path.join(androidDir, `ic_launcher-${density}.png`);
          const srcRound = path.join(androidDir, `ic_launcher_round-${density}.png`);
          const destDir = path.join(androidResDir, `mipmap-${density}`);

          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          if (fs.existsSync(srcLauncher)) {
            fs.copyFileSync(srcLauncher, path.join(destDir, 'ic_launcher.png'));
            fs.copyFileSync(srcLauncher, path.join(destDir, 'ic_launcher_foreground.png'));
            copied++;
          }

          if (fs.existsSync(srcRound)) {
            fs.copyFileSync(srcRound, path.join(destDir, 'ic_launcher_round.png'));
          }
        }

        if (copied > 0) {
          console.log(`  ✓ Copied ${copied} Android icon(s) to mipmap directories`);
        }
      }

      // iOS icons — copies all AppIcon-*.png files from brand's ios/ folder
      if (fs.existsSync(iosDir)) {
        const iosPngs = fs.readdirSync(iosDir).filter(f => f.startsWith('AppIcon') && f.endsWith('.png'));
        if (iosPngs.length > 0) {
          const appiconsetDirs = [];
          const iosProjectDir = path.join(PROJECT_ROOT, 'ios');
          if (fs.existsSync(iosProjectDir)) {
            const findAppiconset = (dir) => {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                const full = path.join(dir, entry.name);
                if (entry.name === 'AppIcon.appiconset') appiconsetDirs.push(full);
                else if (!entry.name.startsWith('.')) findAppiconset(full);
              }
            };
            findAppiconset(iosProjectDir);
          }

          const contentsImages = [
            { filename: 'AppIcon-40.png',   idiom: 'iphone', scale: '2x', size: '20x20' },
            { filename: 'AppIcon-60.png',   idiom: 'iphone', scale: '3x', size: '20x20' },
            { filename: 'AppIcon-58.png',   idiom: 'iphone', scale: '2x', size: '29x29' },
            { filename: 'AppIcon-87.png',   idiom: 'iphone', scale: '3x', size: '29x29' },
            { filename: 'AppIcon-80.png',   idiom: 'iphone', scale: '2x', size: '40x40' },
            { filename: 'AppIcon-120.png',  idiom: 'iphone', scale: '3x', size: '40x40' },
            { filename: 'AppIcon-120.png',  idiom: 'iphone', scale: '2x', size: '60x60' },
            { filename: 'AppIcon-180.png',  idiom: 'iphone', scale: '3x', size: '60x60' },
            { filename: 'AppIcon.png',      idiom: 'ios-marketing', scale: '1x', size: '1024x1024' },
          ].filter(entry => iosPngs.includes(entry.filename));
          const contentsJson = JSON.stringify({ images: contentsImages, info: { author: 'xcode', version: 1 } }, null, 2) + '\n';

          if (appiconsetDirs.length > 0) {
            for (const appiconset of appiconsetDirs) {
              // Remove old non-PNG files
              for (const f of fs.readdirSync(appiconset)) {
                if (f !== 'Contents.json' && !f.endsWith('.png')) {
                  fs.unlinkSync(path.join(appiconset, f));
                }
              }
              for (const png of iosPngs) {
                fs.copyFileSync(path.join(iosDir, png), path.join(appiconset, png));
              }
              fs.writeFileSync(path.join(appiconset, 'Contents.json'), contentsJson, 'utf8');
            }
            console.log(`  ✓ Copied ${iosPngs.length} iOS icon(s) and updated Contents.json`);
          } else {
            console.log(`  ⚠ AppIcon.appiconset not found in ios/`);
          }
        } else {
          console.log(`  ⚠ iOS icons not found: expected AppIcon*.png files in brand's ios/ folder`);
        }
      }

      // Android splash screen
      const androidSplashDir = path.join(brandConfigDir, 'android', 'splash');
      if (fs.existsSync(androidSplashDir)) {
        const androidResDir = path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res');
        applyAndroidSplash(androidSplashDir, androidResDir);
      }

      // iOS splash screen
      const iosSplashDir = path.join(brandConfigDir, 'ios', 'splash');
      if (fs.existsSync(iosSplashDir)) {
        const iosProjectDir = path.join(PROJECT_ROOT, 'ios');
        if (fs.existsSync(iosProjectDir)) {
          applyIosSplash(iosSplashDir, iosProjectDir);
        }
      }

      // Google Services config files
      applyAndroidGoogleServices(path.join(brandConfigDir, 'android', 'google-services.json'), PROJECT_ROOT);
      applyIosGoogleServices(path.join(brandConfigDir, 'ios', 'GoogleService-Info.plist'), PROJECT_ROOT);
    } else {
      console.log('\n⊘ Assets ignored (ignoreAssets: true)');
    }

    console.log(`\n✅ White label configuration applied successfully!`);
    console.log(`\nConfiguration:`);
    console.log(`  Brand: ${config.brand}`);
    console.log(`  Display Name: ${config.displayName}`);
    console.log(`  Version: ${config.version}`);
    console.log(`  Bundle ID: ${config.bundleId}`);
    console.log(`  Package Name: ${config.packageName}`);
    if (androidVersionCode) console.log(`  Android Version Code: ${androidVersionCode}`);
    if (androidVersionName) console.log(`  Android Version Name: ${androidVersionName}`);
    if (iosCurrentProjectVersion) console.log(`  iOS Current Project Version: ${iosCurrentProjectVersion}`);
    if (iosMarketingVersion) console.log(`  iOS Marketing Version: ${iosMarketingVersion}`);
    if (deeplinkSchemes.length > 0) console.log(`  Deep Link Schemes: ${deeplinkSchemes.map(s => `${s}://`).join(', ')}`);
    if (config.universalLinkDomain) console.log(`  Universal Link Domain: https://${config.universalLinkDomain}`);
    if (config.features) {
      const enabledFeatures = Object.entries(config.features)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);
      console.log(`  Features enabled: ${enabledFeatures.length}`);
      if (enabledFeatures.length > 0) {
        enabledFeatures.slice(0, 3).forEach(f => console.log(`    ✓ ${f}`));
        if (enabledFeatures.length > 3) {
          console.log(`    ... and ${enabledFeatures.length - 3} more`);
        }
      }
      console.log(`  Features: ${Object.keys(config.features).length} total`);
    }
  } catch (err) {
    console.error(`\n❌ Failed to apply white label configuration`);
    console.error(err.message);
    process.exit(1);
  }
}

main();
