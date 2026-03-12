/**
 * Audit script for Media Kit mapping consistency.
 *
 * Checks:
 * - screens without any match
 * - screens with multiple matching entries
 * - address mismatches against expected mapped address
 * - risky altPatterns that look like regex without explicit "re:" prefix
 *
 * Usage:
 *   node backend/scripts/audit-midiakit-mapping.js
 *   node backend/scripts/audit-midiakit-mapping.js --fix
 */
const sequelize = require('../config/database');
const Screen = require('../models/Screen');
const { mediaKitData, matchScreen } = require('./seed-midiakit');

const autoFix = process.argv.includes('--fix');

function normalizeText(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function formatIssueList(title, rows, mapper) {
  console.log(`\n${title}: ${rows.length}`);
  rows.forEach((row, index) => {
    console.log(`  ${index + 1}. ${mapper(row)}`);
  });
}

async function runAudit() {
  try {
    await sequelize.authenticate();

    const screens = await Screen.findAll({ order: [['name', 'ASC']] });
    const unmatched = [];
    const ambiguous = [];
    const addressMismatch = [];
    let fixed = 0;

    for (const screen of screens) {
      const matches = mediaKitData.filter(entry => matchScreen(screen.name, entry));

      if (matches.length === 0) {
        unmatched.push(screen);
        continue;
      }

      if (matches.length > 1) {
        ambiguous.push({
          screen,
          patterns: matches.map(m => m.matchPattern)
        });
      }

      const selected = matches[0];
      const expectedAddress = selected.address && selected.address.includes(',') ? selected.address : null;
      if (!expectedAddress) continue;

      const currentNorm = normalizeText(screen.address);
      const expectedNorm = normalizeText(expectedAddress);

      if (currentNorm !== expectedNorm) {
        if (autoFix) {
          await screen.update({ address: expectedAddress });
          fixed += 1;
        }
        addressMismatch.push({
          screen,
          expectedAddress,
          currentAddress: screen.address || ''
        });
      }
    }

    const riskyAltPatterns = [];
    for (const entry of mediaKitData) {
      for (const alt of entry.altPatterns || []) {
        const looksRegex = /[|*+?()[\]{}]/.test(alt);
        if (looksRegex && !alt.startsWith('re:')) {
          riskyAltPatterns.push({ matchPattern: entry.matchPattern, altPattern: alt });
        }
      }
    }

    console.log('\n' + '='.repeat(68));
    console.log('MEDIA KIT MAPPING AUDIT');
    console.log('='.repeat(68));
    console.log(`Screens analyzed: ${screens.length}`);
    console.log(`Auto-fix mode: ${autoFix ? 'ON' : 'OFF'}`);
    if (autoFix) console.log(`Addresses fixed: ${fixed}`);

    if (unmatched.length) {
      formatIssueList('Unmatched screens', unmatched, s => s.name);
    }

    if (ambiguous.length) {
      formatIssueList(
        'Ambiguous matches',
        ambiguous,
        a => `${a.screen.name} -> ${a.patterns.join(' | ')}`
      );
    }

    if (addressMismatch.length) {
      formatIssueList(
        'Address mismatches',
        addressMismatch,
        a => `${a.screen.name} | atual: ${a.currentAddress || '(vazio)'} | esperado: ${a.expectedAddress}`
      );
    }

    if (riskyAltPatterns.length) {
      formatIssueList(
        'Risky altPatterns (regex-like without re:)',
        riskyAltPatterns,
        r => `${r.matchPattern} -> ${r.altPattern}`
      );
    }

    const hasIssues =
      unmatched.length > 0 ||
      ambiguous.length > 0 ||
      addressMismatch.length > 0 ||
      riskyAltPatterns.length > 0;

    if (hasIssues) {
      console.log('\nAudit result: FAIL');
      process.exit(1);
    }

    console.log('\nAudit result: PASS');
    process.exit(0);
  } catch (err) {
    console.error('Audit error:', err.message);
    process.exit(1);
  }
}

runAudit();
