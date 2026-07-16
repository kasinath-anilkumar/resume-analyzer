const multer = require('multer');
const path = require('path');

// In-memory leads-sheet upload. Small cap (a leads sheet is tiny). Accepts .csv
// and .xlsx — extension + a permissive MIME check; the parser
// (services/sheetImport.js) sniffs the real format and is defensive regardless.
const base = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const okExt = ext === '.csv' || ext === '.txt' || ext === '.xlsx';
    const okMime =
      mime.startsWith('text/') ||
      mime === 'application/csv' ||
      mime === 'application/vnd.ms-excel' || // some browsers label .csv this way
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
      mime === 'application/octet-stream';
    if (okExt && okMime) return cb(null, true);
    cb(new Error(`“${ext || 'that'}” files aren’t supported — upload a .csv or .xlsx leads sheet.`), false);
  },
});

// Wrap multer's .single() so ANY upload problem (wrong type, too large) returns a
// clean 400 with a helpful message, instead of falling through to the global
// error handler as a generic 500.
const single = (field) => (req, res, next) => {
  base.single(field)(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (max 5 MB).'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Upload a single CSV file.'
          : (err.message || 'Could not read the uploaded file.');
    return res.status(400).json({ success: false, message });
  });
};

module.exports = { single };
