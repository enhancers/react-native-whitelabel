'use strict';

const fs = require('fs');
const path = require('path');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rename Xcode scheme files and update BlueprintName inside each to match schemeName.
 * Schemes are detected by their ReferencedContainer pointing to the (never-renamed) .xcodeproj.
 * The current prefix is read from each scheme's BlueprintName attribute so renames are idempotent.
 *
 * @param {string} iosDir      - Absolute path to the ios/ directory
 * @param {string} projectName - Name derived from the .xcodeproj folder (e.g. "hOn")
 * @param {string} schemeName  - Target scheme identifier (e.g. "BlueTheme")
 * @param {string} projectRoot - Project root used for relative-path log output
 */
function applyXcodeSchemes(iosDir, projectName, schemeName, projectRoot) {
  const xcodeprojDirs = fs.readdirSync(iosDir).filter(f => f.endsWith('.xcodeproj'));
  if (xcodeprojDirs.length === 0) return;

  const schemesDir = path.join(iosDir, xcodeprojDirs[0], 'xcshareddata', 'xcschemes');
  if (!fs.existsSync(schemesDir)) {
    console.log('  ⚠ xcshareddata/xcschemes not found, skipping scheme rename');
    return;
  }

  const schemeFiles = fs.readdirSync(schemesDir).filter(f => f.endsWith('.xcscheme'));
  if (schemeFiles.length === 0) {
    console.log('  ⚠ No .xcscheme files found');
    return;
  }

  // Only touch schemes that reference this project's .xcodeproj (stable, never renamed)
  const containerRef = `container:${projectName}.xcodeproj`;
  let processed = 0;

  for (const schemeFile of schemeFiles) {
    const schemePath = path.join(schemesDir, schemeFile);
    const content = fs.readFileSync(schemePath, 'utf8');
    if (!content.includes(containerRef)) continue;

    const baseName = schemeFile.replace(/\.xcscheme$/, '');

    // BlueprintName holds the current "base" prefix; the rest of the filename is a suffix
    // (e.g. file "Connect-release.xcscheme", BlueprintName "Connect" → suffix "-release")
    const bpMatch = content.match(/BlueprintName\s*=\s*"([^"]+)"/);
    let currentPrefix = bpMatch ? bpMatch[1] : null;
    let suffix = '';

    if (currentPrefix && baseName.startsWith(currentPrefix)) {
      suffix = baseName.slice(currentPrefix.length);
    } else if (baseName.startsWith(projectName)) {
      // Fallback for schemes whose BlueprintName differs from the file-name prefix
      currentPrefix = projectName;
      suffix = baseName.slice(projectName.length);
    } else {
      console.log(`  ⚠ Skipping ${schemeFile}: cannot determine scheme name mapping`);
      continue;
    }

    const newBaseName = `${schemeName}${suffix}`;
    const newSchemePath = path.join(schemesDir, `${newBaseName}.xcscheme`);

    const updatedContent = content.replace(
      new RegExp(`(BlueprintName\\s*=\\s*")${escapeRegex(currentPrefix)}"`, 'g'),
      `$1${schemeName}"`
    );

    if (newSchemePath !== schemePath || updatedContent !== content) {
      fs.writeFileSync(newSchemePath, updatedContent, 'utf8');
      if (newSchemePath !== schemePath) {
        fs.unlinkSync(schemePath);
        console.log(`  ✓ Renamed: ${schemeFile} → ${newBaseName}.xcscheme`);
      } else {
        console.log(`  ✓ Updated: ${path.relative(projectRoot, schemePath)}`);
      }
      processed++;
    }
  }

  if (processed === 0) {
    console.log('  ✓ Xcode schemes already up to date');
  }
}

module.exports = { applyXcodeSchemes };
