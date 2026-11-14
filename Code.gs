const SHEET_NAME = 'The Election Data';
const CACHE_SECONDS = 20;
const STALE_SECONDS = 21600;

function doGet() {
  const cache = CacheService.getScriptCache();
  let body = cache.get('results');
  if (!body) {
    const lock = LockService.getScriptLock();
    const locked = lock.tryLock(5000);
    try {
      body = cache.get('results');
      if (!body) {
        try {
          body = JSON.stringify(buildResults_());
          cache.put('results', body, CACHE_SECONDS);
          cache.put('lastGood', body, STALE_SECONDS);
        } catch (error) {

          body = cache.get('lastGood') ||
            JSON.stringify({ error: String(error && error.message ? error.message : error), states: [] });
        }
      }
    } finally {
      if (locked) lock.releaseLock();
    }
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
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
    imgA: header.indexOf('IMAGE A'),
    imgB: header.indexOf('IMAGE B'),
    imgC: header.indexOf('IMAGE C')
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

  const images = {
    gop: findImage_(sheet, rowNumbers, col.imgA, 'a'),
    dem: findImage_(sheet, rowNumbers, col.imgB, 'b'),
    ind: findImage_(sheet, rowNumbers, col.imgC, 'c')
  };

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

  return { year: year || null, updated: lastChanged_(states), states: states };
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

function findImage_(sheet, rowNumbers, colIndex, key) {
  if (colIndex === -1) return '';
  for (let k = 0; k < rowNumbers.length; k++) {
    const cell = sheet.getRange(rowNumbers[k], colIndex + 1);
    const value = cell.getValue();
    if (value === '' || value === null) continue;
    try {
      return toImageUrl_(value, cell.getFormula(), key);
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
  cache.put('img:' + key, url, 300);
  return url;
}

function authorize() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch('https://www.google.com');
  SpreadsheetApp.getActiveSpreadsheet();
}
