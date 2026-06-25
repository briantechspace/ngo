const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const isCloudinaryConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

let upload;

if (isCloudinaryConfigured) {
  try {
    const cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    const storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'ngo_blogs',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
        transformation: [{ width: 1200, height: 630, crop: 'limit' }] // optimized for social sharing and banner layouts
      }
    });

    upload = multer({ storage: storage });
    console.log('✅ Cloudinary Multer Storage initialized successfully.');
  } catch (error) {
    console.error('⚠️ Failed to initialize Cloudinary storage. Falling back to local storage.', error.message);
    initializeLocalStorage();
  }
} else {
  console.log('ℹ️ Cloudinary credentials not detected in environment. Initializing local storage fallback.');
  initializeLocalStorage();
}

function initializeLocalStorage() {
  const uploadDir = path.join(__dirname, 'public', 'uploads');
  
  // Ensure local uploads directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
      const filetypes = /jpeg|jpg|png|gif|webp/;
      const mimetype = filetypes.test(file.mimetype);
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Error: Only images are allowed (jpeg, jpg, png, gif, webp)!'));
    }
  });
  console.log('✅ Local Multer Storage initialized at /public/uploads.');
}

// Helper function to extract the URL after upload
function getUploadedFileUrl(req) {
  if (!req.file) return null;
  
  if (isCloudinaryConfigured && req.file.path && (req.file.path.startsWith('http://') || req.file.path.startsWith('https://'))) {
    return req.file.path; // Cloudinary returns the full URL in path
  }
  
  // Local storage fallback return path relative to the public directory
  return `/uploads/${req.file.filename}`;
}

module.exports = {
  upload,
  getUploadedFileUrl
};
