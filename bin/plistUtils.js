'use strict';

/**
 * Lightweight helpers for regex-based plist XML manipulation.
 * Only supports the subset of plist types used by RNWL:
 *   boolean  → <true/> / <false/>
 *   string   → <string>…</string>
 *   string[] → <array><string>…</string>…</array>
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Serialize a JS value to its inline plist XML representation.
 */
function serializePlistValue(value) {
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (Array.isArray(value)) {
    const items = value.map(v => `\n\t\t<string>${v}</string>`).join('');
    return `<array>${items}\n\t</array>`;
  }
  return `<string>${String(value)}</string>`;
}

/**
 * Add or replace a key in plist XML content.
 * If the key already exists its value is updated in-place;
 * otherwise the entry is appended before </dict></plist>.
 */
function setPlistKey(content, key, value) {
  const ek = escapeRegex(key);
  const valuePat = '(?:<true/>|<false/>|<string>[^<]*</string>|<array>[\\s\\S]*?</array>)';
  const pattern = new RegExp(`\\t?<key>${ek}<\\/key>\\s*${valuePat}`);
  const entry = `\t<key>${key}</key>\n\t${serializePlistValue(value)}`;
  if (pattern.test(content)) {
    return content.replace(pattern, entry);
  }
  return content.replace('</dict>\n</plist>', `${entry}\n</dict>\n</plist>`);
}

/**
 * Remove a key (and its value) from plist XML content.
 * No-op if the key is not present.
 */
function removePlistKey(content, key) {
  const ek = escapeRegex(key);
  const valuePat = '(?:<true/>|<false/>|<string>[^<]*</string>|<array>[\\s\\S]*?</array>)';
  return content.replace(new RegExp(`\\s*\\t?<key>${ek}<\\/key>\\s*${valuePat}`), '');
}

module.exports = { serializePlistValue, setPlistKey, removePlistKey };
