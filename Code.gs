const SHEET_NAME = 'The Election Data';
const SETTINGS_SHEET_NAME = 'Settings';
const SAVED_FILE_NAME = 'Election Map Saved Elections.json';
const CACHE_SECONDS = 10;
const STALE_SECONDS = 21600;
const IMAGE_CACHE_SECONDS = 600;

function doGet(e) {
  if (e && e.parameter && e.parameter.saved) {
    return jsonOut_(readSaved_().data);
  }
  const cache = CacheService.getScriptCache();
  const fresh = cache.get('results');
  if (fresh) return textOut_(fresh);

  const stale = cache.get('lastGood');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) {
    return textOut_(stale || errorBody_('The sheet is busy, try again in a moment.'));
  }
  try {
    const again = cache.get('results');
    if (again) return textOut_(again);
    const built = rebuild_(false);
    return textOut_(built.body || stale || errorBody_(built.error));
  } finally {
    lock.releaseLock();
  }
}

function rebuild_(refreshImages) {
  const cache = CacheService.getScriptCache();
  try {
    if (refreshImages) cache.remove('imgs');
    const body = JSON.stringify(buildResults_());
    cachePut_(cache, 'results', body, CACHE_SECONDS);
    cachePut_(cache, 'lastGood', body, STALE_SECONDS);
    return { body: body, error: '' };
  } catch (error) {
    return { body: '', error: String(error && error.message ? error.message : error) };
  }
}

function cachePut_(cache, key, value, seconds) {
  try {
    cache.put(key, value, seconds);
  } catch (error) {
    cache.remove(key);
  }
}

function textOut_(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function errorBody_(message) {
  return JSON.stringify({ error: message || 'Results are not available yet', states: [] });
}

function refreshResults() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    rebuild_(false);
  } finally {
    lock.releaseLock();
  }
}

function onSheetChange() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    rebuild_(true);
  } finally {
    lock.releaseLock();
  }
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const name = trigger.getHandlerFunction();
    if (name === 'refreshResults' || name === 'onSheetChange') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('refreshResults').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
  onSheetChange();
}

function buildResults_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEET_NAME) || book.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const header = values[0].map(function (h) { return String(h).trim().toUpperCase(); });

  const need = function (name) {
    const index = header.indexOf(name);
    if (index === -1) throw new Error('Column "' + name + '" not found in row 1 of ' + sheet.getName());
    return index;
  };
  const col = {
    year: need('YEAR'),
    abbr: need('ABBREVIATIONS'),
    name: need('STATES'),
    ev: need('ELECTORAL VOTES'),
    candA: need('CANDIDATE A'),
    candB: need('CANDIDATE B'),
    gop: need('GOP VOTES'),
    dem: need('DNC VOTES'),
    counted: need('REPORTING'),
    total: need('TOTAL VOTES'),
    winner: need('WINNER'),
    candC: header.indexOf('CANDIDATE C'),
    ind: header.indexOf('IND VOTES'),
    imgA: firstHeader_(header, ['REPUBLICAN IMAGE', 'IMAGE A']),
    imgB: firstHeader_(header, ['DEMOCRAT IMAGE', 'IMAGE B']),
    imgC: firstHeader_(header, ['INDEPENDENT IMAGE', 'IMAGE C'])
  };

  const num = function (v) { const n = Number(v); return isFinite(n) ? n : 0; };
  const isError = function (v) { return typeof v === 'string' && v.charAt(0) === '#'; };

  let rows = [];
  const rowNumbers = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const abbr = String(r[col.abbr]).trim().toUpperCase();
    if (abbr === 'NATIONAL') break;
    if (abbr.length !== 2 || !String(r[col.name]).trim()) continue;

    if ([r[col.gop], r[col.dem], r[col.total], r[col.counted], r[col.winner]].some(isError)) {
      throw new Error('Sheet is mid-calculation (error value in row ' + (i + 1) + ')');
    }
    rows.push(r);
    rowNumbers.push(i + 1);
  }

  const year = rows.reduce(function (max, r) { return Math.max(max, num(r[col.year])); }, 0);
  if (year) rows = rows.filter(function (r) { return num(r[col.year]) === year; });
  if (!rows.length) throw new Error('No state rows found');

  const images = readImages_(sheet, values, rowNumbers, [col.imgA, col.imgB, col.imgC]);

  const states = rows.map(function (r) {
    const gop = Math.round(num(r[col.gop]));
    const dem = Math.round(num(r[col.dem]));
    const ind = col.ind === -1 ? 0 : Math.round(num(r[col.ind]));
    const total = num(r[col.total]);
    const counted = num(r[col.counted]) || gop + dem + ind;
    const reporting = total > 0 ? Math.min(100, Math.round((counted / total) * 10000) / 100) : 0;
    const candA = String(r[col.candA]).trim();
    const candB = String(r[col.candB]).trim();
    const candC = col.candC === -1 ? 'Independent' : String(r[col.candC]).trim() || 'Independent';
    const winner = String(r[col.winner]).trim().toLowerCase();
    const called = winner !== '' && [candA, candB, candC].some(function (name) { return name.toLowerCase() === winner; });

    return {
      name: titleCase_(String(r[col.name])),
      abbr: String(r[col.abbr]).trim().toUpperCase(),
      electoral_votes: num(r[col.ev]),
      votes_gop: gop,
      votes_dem: dem,
      votes_ind: ind,
      reporting: reporting,
      gop_candidate: candA,
      dem_candidate: candB,
      ind_candidate: candC,
      gop_image: images.gop,
      dem_image: images.dem,
      ind_image: images.ind,
      called: called
    };
  });

  return {
    year: year || null,
    updated: lastChanged_(states),
    county_range: readCountyRange_(book),
    saved_elections: savedInfo_(),
    states: states
  };
}

function readSetting_(book, label) {
  const sheet = book.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) return '';
  const values = sheet.getRange(1, 1, Math.min(sheet.getLastRow() || 1, 40), Math.min(sheet.getLastColumn() || 1, 6)).getValues();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length - 1; c++) {
      if (String(values[r][c]).trim().toUpperCase() === label) return values[r][c + 1];
    }
  }
  return '';
}

function readCountyRange_(book) {
  try {
    let start = Math.round(Number(readSetting_(book, 'START YEAR')));
    let end = Math.round(Number(readSetting_(book, 'END YEAR')));
    if (!isFinite(start) || !isFinite(end) || start < 1 || end < 1) return null;
    if (start > end) { const swap = start; start = end; end = swap; }
    return { start: start, end: end };
  } catch (error) {
    return null;
  }
}


function jsonOut_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function readSaved_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('savedFileId');
  let file = null;
  if (id) {
    try { file = DriveApp.getFileById(id); } catch (error) { file = null; }
  }
  if (!file) {
    const found = DriveApp.getFilesByName(SAVED_FILE_NAME);
    file = found.hasNext() ? found.next() : DriveApp.createFile(SAVED_FILE_NAME, JSON.stringify({ elections: {} }), MimeType.PLAIN_TEXT);
    props.setProperty('savedFileId', file.getId());
  }
  let data;
  try { data = JSON.parse(file.getBlob().getDataAsString()); } catch (error) { data = null; }
  if (!data || typeof data.elections !== 'object') data = { elections: {} };
  return { file: file, data: data };
}

function savedInfo_() {
  const props = PropertiesService.getScriptProperties();
  const updated = props.getProperty('savedUpdated');
  if (!updated) return null;
  return { years: JSON.parse(props.getProperty('savedYears') || '[]'), updated: updated };
}

function writeSaved_(file, data) {
  file.setContent(JSON.stringify(data));
  const props = PropertiesService.getScriptProperties();
  const years = Object.keys(data.elections).map(Number).sort(function (a, b) { return a - b; });
  props.setProperty('savedYears', JSON.stringify(years));
  if (years.length) props.setProperty('savedUpdated', new Date().toISOString());
  else props.deleteProperty('savedUpdated');
  CacheService.getScriptCache().remove('results');
}

function doPost(e) {
  let out;
  try {
    const request = JSON.parse(e.postData.contents);
    const password = String(readSetting_(SpreadsheetApp.getActiveSpreadsheet(), 'SAVE PASSWORD')).trim();
    if (!password) throw new Error('Saving is switched off. Type a SAVE PASSWORD on the Settings tab first.');
    if (String(request.key).trim() !== password) throw new Error('Wrong save password.');

    const year = Math.round(Number(request.year));
    if (!isFinite(year) || year < 1788 || year > 2200) throw new Error('Bad election year.');

    const cleaned = {};
    let count = 0;
    Object.keys(request.counties || {}).forEach(function (fips) {
      const v = request.counties[fips];
      if (!/^\d{5}$/.test(fips) || !Array.isArray(v) || v.length !== 3) return;
      const row = v.map(function (n) { n = Math.round(Number(n)); return isFinite(n) && n > 0 ? n : 0; });
      if (row[0] + row[1] + row[2] <= 0) return;
      cleaned[fips] = row;
      count++;
    });
    if (!count) throw new Error('No county results were sent.');

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const saved = readSaved_();
      saved.data.elections[year] = { saved: new Date().toISOString(), counties: cleaned };
      writeSaved_(saved.file, saved.data);
    } finally {
      lock.releaseLock();
    }
    out = { ok: true, year: year, counties: count, updated: savedInfo_().updated };
  } catch (error) {
    out = { ok: false, error: String(error && error.message ? error.message : error) };
  }
  return jsonOut_(out);
}

function clearSavedElections() {
  const saved = readSaved_();
  writeSaved_(saved.file, { elections: {} });
}

function titleCase_(text) {
  return text.trim().toLowerCase().replace(/\b[a-z]+/g, function (word) {
    return word === 'of' ? word : word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function lastChanged_(states) {
  const props = PropertiesService.getScriptProperties();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(states));
  const fingerprint = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  if (props.getProperty('fingerprint') !== fingerprint) {
    props.setProperty('fingerprint', fingerprint);
    props.setProperty('changedAt', new Date().toISOString());
  }
  return props.getProperty('changedAt');
}

function firstHeader_(header, names) {
  for (let i = 0; i < names.length; i++) {
    const index = header.indexOf(names[i]);
    if (index !== -1) return index;
  }
  return -1;
}

function readImages_(sheet, values, rowNumbers, columns) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('imgs');
  if (cached) {
    try { return JSON.parse(cached); } catch (error) {}
  }
  const floating = floatingImages_(sheet);
  const keys = ['gop', 'dem', 'ind'];
  const letters = ['a', 'b', 'c'];
  const out = {};
  keys.forEach(function (key, k) {
    out[key] = findImage_(sheet, values, rowNumbers, columns[k], letters[k], floating);
  });
  cachePut_(cache, 'imgs', JSON.stringify(out), IMAGE_CACHE_SECONDS);
  return out;
}

function floatingImages_(sheet) {
  const map = {};
  try {
    sheet.getImages().forEach(function (image) {
      const column = image.getAnchorCell().getColumn();
      if (!map[column]) {
        const url = image.getUrl();
        if (url) map[column] = url;
      }
    });
  } catch (error) {}
  return map;
}

function findImage_(sheet, values, rowNumbers, colIndex, key, floating) {
  if (colIndex === -1) return '';
  if (floating[colIndex + 1]) return floating[colIndex + 1];
  for (let k = 0; k < rowNumbers.length; k++) {
    const value = values[rowNumbers[k] - 1][colIndex];
    if (value === '' || value === null || value === undefined) continue;
    try {
      const formula = sheet.getRange(rowNumbers[k], colIndex + 1).getFormula();
      return toImageUrl_(value, formula, key);
    } catch (error) {
      return '';
    }
  }
  return '';
}

function toImageUrl_(value, formula, key) {
  const match = /^=IMAGE\(\s*"([^"]+)"/i.exec(formula || '');
  if (match) return match[1];
  if (value && typeof value === 'object' && typeof value.getContentUrl === 'function') {
    const source = value.getUrl();
    return source ? source : hostImage_(value.getContentUrl(), key);
  }
  const text = String(value).trim();
  return /^https?:\/\/\S+$/i.test(text) ? text : '';
}

function hostImage_(contentUrl, key) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('img:' + key);
  if (cached) return cached;
  const blob = UrlFetchApp.fetch(contentUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getBlob();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, blob.getBytes());
  const hash = digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  const name = 'election-map-' + hash;
  const folders = DriveApp.getFoldersByName('Election Map Images');
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Election Map Images');
  const files = folder.getFilesByName(name);
  let file;
  if (files.hasNext()) {
    file = files.next();
  } else {
    file = folder.createFile(blob.setName(name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w600';
  cachePut_(cache, 'img:' + key, url, 21600);
  return url;
}

function authorize() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch('https://www.google.com');
  SpreadsheetApp.getActiveSpreadsheet();
}