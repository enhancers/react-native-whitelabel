'use strict';

/**
 * Lightweight helpers for regex-based AndroidManifest.xml manipulation.
 */

/**
 * Find an existing unmarked <intent-filter> whose content matches dataPattern
 * and wrap it with RNWL marker comments in-place.
 * Returns updated content, or null if no matching unmarked block was found.
 */
function wrapExistingIntentFilter(content, dataPattern, markerStart, markerEnd) {
  const re = /^([ \t]*)<intent-filter(?:[^>]*)>[\s\S]*?<\/intent-filter>/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    if (!dataPattern.test(match[0])) continue;
    const indent = match[1];
    const block = match[0];
    const wrapped = `${indent}${markerStart}\n${block}\n${indent}${markerEnd}`;
    return content.slice(0, match.index) + wrapped + content.slice(match.index + block.length);
  }
  return null;
}

module.exports = { wrapExistingIntentFilter };
