/**
 * System-info report used by the About panel and the crash banner.
 *
 * Run from app/:   node scripts/selftest-system-info.js
 */
'use strict';

const { describePlatform, safeErrorMessage, formatSystemInfo } = require('../src/system-info');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// A complete report carries everything support asks for.
{
  const text = formatSystemInfo({
    version: '0.2.5',
    electron: '38.0.0',
    chrome: '140.0.0.0',
    node: '20.18.0',
    platform: 'win32',
    release: '10.0.22631',
    arch: 'x64',
    locale: 'th-TH',
    provider: 'free-pi',
    language: 'th',
    dataDir: 'C:\\Users\\me\\AppData\\Roaming\\FreePi',
    packaged: true,
  });
  check('version line', text.includes('NTAPI v0.2.5'), text);
  check('runtime line', text.includes('Electron 38.0.0') && text.includes('Chrome 140.0.0.0'), text);
  check('os line', text.includes('Windows 10.0.22631 x64'), text);
  check('locale line', text.includes('Locale: th-TH'), text);
  check('provider line', text.includes('Provider: free-pi'), text);
  check('data folder line', text.includes('Data folder: C:\\Users\\me'), text);
  check('packaged line', text.includes('Packaged: yes'), text);
}

// A half-filled report must not print "undefined" or throw.
{
  const text = formatSystemInfo({});
  check('empty info still yields the app name', text === 'NTAPI', JSON.stringify(text));
  check('empty info has no undefined', !text.includes('undefined'), text);
}

// A version that already carries a "v" must not become "vv".
check('no doubled v', formatSystemInfo({ version: 'v1.2.3' }) === 'NTAPI v1.2.3');

// Platform names, and an unknown platform still describes something.
check('macOS name', describePlatform({ platform: 'darwin', release: '23.6.0', arch: 'arm64' }) === 'macOS 23.6.0 arm64');
check('linux name', describePlatform({ platform: 'linux', release: '6.8.0', arch: 'x64' }) === 'Linux 6.8.0 x64');
check('unknown platform', describePlatform({ platform: 'freebsd' }).includes('freebsd'));
check('missing platform', describePlatform({}) === 'Unknown OS');

// Error coercion: the banner must stay readable.
check('Error message', safeErrorMessage(new Error('boom')) === 'boom');
check('plain string', safeErrorMessage('oops') === 'oops');
check('null is empty', safeErrorMessage(null) === '');
check('object with no message is stringified', safeErrorMessage(42) === '42');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: system info and error text are safe to show and copy');
