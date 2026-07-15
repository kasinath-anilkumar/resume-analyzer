const multer = require('multer');
const path = require('path');
const { matchesExtension } = require('../utils/fileType');

// Keep the uploaded file in memory as a Buffer. The resume is then streamed
// to Supabase Storage (or written to local disk as a fallback) by the
// storage service — nothing is persisted to a temp path here.
const storage = multer.memoryStorage();

// File filter — accept documents and images. Images/scanned docs are OCR'd.
const allowedExtensions = [
  '.pdf', '.doc', '.docx', '.txt', '.rtf',
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif',
];
const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'application/rtf',
  'text/rtf',
  // Browsers sometimes send a generic type; the extension gate below still applies.
  'application/octet-stream',
];

const fileFilter = (req, file, cb) => {
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase();

  // The extension is the authoritative gate (it drives the parser choice);
  // the mimetype only needs to be plausible (known doc type, image/*, text/*,
  // or the generic octet-stream some browsers emit).
  const extAllowed = allowedExtensions.includes(extname);
  const mimeAllowed =
    allowedMimeTypes.includes(mimetype) ||
    mimetype.startsWith('image/') ||
    mimetype.startsWith('text/');

  if (extAllowed && mimeAllowed) {
    return cb(null, true);
  }
  cb(new Error('Unsupported file type. Allowed: PDF, DOC, DOCX, TXT, RTF, and images (JPG/PNG/etc.).'), false);
};

// Multer upload config
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 1,                   // single résumé per request
    fields: 30,                 // form fields (name, screening answers, quiz, …)
  },
  fileFilter: fileFilter,
});

// Post-upload content check: the extension + MIME the client sends are spoofable,
// so verify the file's ACTUAL magic bytes match the declared extension. This is
// what stops "malware.exe renamed to cv.pdf" (which the fileFilter can't catch —
// req.file.buffer isn't populated until after multer runs). No file → skip (the
// apply route also accepts manual details with no upload).
const validateResumeContent = (req, res, next) => {
  if (!req.file || !req.file.buffer) return next();
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!matchesExtension(req.file.buffer, ext)) {
    return res.status(400).json({
      success: false,
      message: "The file's contents don't match its type. Please upload a genuine PDF, DOC/DOCX, RTF, TXT, or image résumé.",
    });
  }
  next();
};

upload.validateResumeContent = validateResumeContent;
module.exports = upload;
