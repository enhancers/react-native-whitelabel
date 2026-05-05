'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function longestCommonPrefix(strings) {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

/**
 * Rename Xcode scheme files so Xcode does not show "No scheme".
 *
 * Key design:
 *  - The scheme name shown in Xcode's toolbar = the .xcscheme *filename* (without extension).
 *    It is NOT derived from BlueprintName.
 *  - BlueprintName inside the file must match the Xcode *target* name (= projectName for
 *    standard RN projects). Setting it to the scheme name causes Xcode 15+ to fail resolving
 *    the buildable reference, showing "No scheme".
 *  - The current base name (for chained renames, e.g. Blue → Green) is inferred from the
 *    longest common prefix of all relevant scheme filenames — no metadata comment needed.
 *
 * @param {string} iosDir      - Absolute path to the ios/ directory
 * @param {string} projectName - Name derived from the .xcodeproj folder (e.g. "MyApp")
 * @param {string} schemeName  - Target scheme identifier (e.g. "BlueTheme")
 * @param {string} projectRoot - Project root used for relative-path log output
 */
function applyXcodeSchemes(iosDir, projectName, schemeName, projectRoot) {
  const xcodeprojDirs = fs.readdirSync(iosDir).filter(f => f.endsWith('.xcodeproj'));
  if (xcodeprojDirs.length === 0) return;

  const xcodeprojDir = path.join(iosDir, xcodeprojDirs[0]);
  const schemesDir = path.join(xcodeprojDir, 'xcshareddata', 'xcschemes');
  if (!fs.existsSync(schemesDir)) {
    console.log('  ⚠ xcshareddata/xcschemes not found, skipping scheme rename');
    return;
  }

  const schemeFiles = fs.readdirSync(schemesDir).filter(f => f.endsWith('.xcscheme'));
  if (schemeFiles.length === 0) {
    console.log('  ⚠ No .xcscheme files found');
    return;
  }

  const containerRef = `container:${projectName}.xcodeproj`;

  // Collect only scheme files that reference this project's .xcodeproj
  const relevant = schemeFiles.filter(f => {
    const content = fs.readFileSync(path.join(schemesDir, f), 'utf8');
    return content.includes(containerRef);
  });

  if (relevant.length === 0) {
    console.log('  ✓ Xcode schemes already up to date');
    return;
  }

  const relevantBaseNames = relevant.map(f => f.replace(/\.xcscheme$/, ''));

  // ── Determine the old base name ───────────────────────────────────────────
  // 1. Already uses schemeName as prefix → idempotent run.
  // 2. Uses projectName as prefix → first-time application.
  // 3. Anything else (previously renamed) → use longest common prefix of all names.
  let oldBase;
  if (relevantBaseNames.every(n => n.startsWith(schemeName))) {
    oldBase = schemeName;
  } else if (relevantBaseNames.every(n => n.startsWith(projectName))) {
    oldBase = projectName;
  } else {
    oldBase = longestCommonPrefix(relevantBaseNames);
    if (!oldBase) {
      console.log('  ⚠ Cannot determine current scheme base name, skipping scheme rename');
      return;
    }
  }

  const validSchemeNames = new Set();
  const schemeRenames = {};
  let processed = 0;

  for (const schemeFile of relevant) {
    const schemePath = path.join(schemesDir, schemeFile);
    const content = fs.readFileSync(schemePath, 'utf8');
    const baseName = schemeFile.replace(/\.xcscheme$/, '');
    const suffix = baseName.slice(oldBase.length);
    const newBaseName = `${schemeName}${suffix}`;
    const newSchemePath = path.join(schemesDir, `${newBaseName}.xcscheme`);
    validSchemeNames.add(newBaseName);

    // Strip any legacy RNWL tracking comment left by older versions of this script.
    let updatedContent = content.replace(/\n?[ \t]*<!--\s*RNWL:[^>]*-->\n?/g, '\n');

    // Fix BlueprintName if it was incorrectly set to oldBase by a previous RNWL run.
    // BlueprintName must equal the target name (= projectName), not the scheme name.
    if (oldBase !== projectName) {
      updatedContent = updatedContent.replace(
        new RegExp(`(BlueprintName\\s*=\\s*")${escapeRegex(oldBase)}"`, 'g'),
        `$1${projectName}"`
      );
    }

    if (newSchemePath !== schemePath || updatedContent !== content) {
      fs.writeFileSync(newSchemePath, updatedContent, 'utf8');
      if (newSchemePath !== schemePath) {
        fs.unlinkSync(schemePath);
        schemeRenames[baseName] = newBaseName;
        console.log(`  ✓ Renamed: ${schemeFile} → ${newBaseName}.xcscheme`);
      } else {
        console.log(`  ✓ Updated: ${path.relative(projectRoot, schemePath)}`);
      }
      processed++;
    }
  }

  if (processed === 0) {
    console.log('  ✓ Xcode schemes already up to date');
    return;
  }

  cleanupUserSchemeData(iosDir, xcodeprojDir, schemeRenames, validSchemeNames);

  if (Object.keys(schemeRenames).length > 0) {
    console.log('  ℹ If Xcode is open, close and reopen it to see the renamed scheme.');
  }
}

/**
 * Update xcschememanagement.plist and delete stale UserInterfaceState.xcuserstate files.
 */
function cleanupUserSchemeData(iosDir, xcodeprojDir, schemeRenames, validNames) {
  const searchRoots = [
    xcodeprojDir,
    path.join(xcodeprojDir, 'project.xcworkspace'),
  ];
  try {
    for (const entry of fs.readdirSync(iosDir)) {
      if (entry.endsWith('.xcworkspace')) searchRoots.push(path.join(iosDir, entry));
    }
  } catch (_) {}

  for (const root of searchRoots) {
    const xcuserdataDir = path.join(root, 'xcuserdata');
    if (!fs.existsSync(xcuserdataDir)) continue;
    let userDirs;
    try { userDirs = fs.readdirSync(xcuserdataDir); } catch (_) { continue; }

    for (const userDir of userDirs) {
      if (Object.keys(schemeRenames).length > 0) {
        updateSchemeManagementPlist(
          path.join(xcuserdataDir, userDir, 'xcschemes', 'xcschememanagement.plist'),
          schemeRenames
        );
      }
      deleteStaleXcuserstate(
        path.join(xcuserdataDir, userDir, 'UserInterfaceState.xcuserstate'),
        validNames
      );
    }
  }
}

function updateSchemeManagementPlist(plistPath, schemeRenames) {
  if (!fs.existsSync(plistPath)) return;
  let content = fs.readFileSync(plistPath, 'utf8');
  let changed = false;
  for (const [oldName, newName] of Object.entries(schemeRenames)) {
    const updated = content.replace(
      new RegExp(`(<key>)${escapeRegex(oldName)}(\\.xcscheme</key>)`, 'g'),
      `$1${newName}$2`
    );
    if (updated !== content) { content = updated; changed = true; }
  }
  if (changed) {
    fs.writeFileSync(plistPath, content, 'utf8');
    console.log(`  ✓ Updated: ${path.basename(plistPath)}`);
  }
}

/**
 * Delete UserInterfaceState.xcuserstate if the active scheme it references
 * is not in the set of currently valid scheme names.
 */
function deleteStaleXcuserstate(statePath, validSchemeNames) {
  if (!fs.existsSync(statePath)) return;
  try {
    const xml = execSync(`plutil -convert xml1 -o - "${statePath}"`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    const match = xml.match(/entity:[^:]+:scheme:([^<"\s]+)/);
    if (match) {
      const activeScheme = match[1];
      if (!validSchemeNames.has(activeScheme)) {
        fs.unlinkSync(statePath);
        console.log(`  ✓ Reset: UserInterfaceState.xcuserstate (schema "${activeScheme}" non più valido)`);
      }
    }
  } catch (_) {
    try {
      fs.unlinkSync(statePath);
      console.log(`  ✓ Reset: UserInterfaceState.xcuserstate`);
    } catch (_2) {}
  }
}

module.exports = { applyXcodeSchemes };
