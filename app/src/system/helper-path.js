'use strict';

/**
 * Where a helper script really lives.
 *
 * Inside the packaged app `__dirname` points into `app.asar`, and only
 * Electron's own fs can read that archive — python3 and powershell.exe cannot,
 * so a helper started from inside it fails with a confusing error on a machine
 * that never had a problem. Both helpers are unpacked beside the archive, so
 * that copy wins when it exists.
 */

const fs = require('node:fs');
const path = require('node:path');

const SEP = path.sep;

function helperPath(name) {
  const inPlace = path.join(__dirname, name);
  const unpacked = inPlace.replace(`${SEP}app.asar${SEP}`, `${SEP}app.asar.unpacked${SEP}`);
  if (unpacked !== inPlace && fs.existsSync(unpacked)) return unpacked;
  return inPlace;
}

module.exports = { helperPath };
