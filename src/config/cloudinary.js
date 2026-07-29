const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Importation universelle de multer-storage-cloudinary pour être compatible
// à la fois avec la version 2.x (import par défaut) et 4.x (import nommé)
let CloudinaryStorage;
const multerStorageCloudinary = require('multer-storage-cloudinary');
if (typeof multerStorageCloudinary === 'function') {
  CloudinaryStorage = multerStorageCloudinary;
} else if (multerStorageCloudinary && typeof multerStorageCloudinary.CloudinaryStorage === 'function') {
  CloudinaryStorage = multerStorageCloudinary.CloudinaryStorage;
} else {
  throw new Error('Impossible de charger CloudinaryStorage depuis multer-storage-cloudinary');
}

// Configuration universelle des options de stockage selon la version du package
const storageOptions = {
  cloudinary: require('cloudinary'),
};

if (typeof multerStorageCloudinary.CloudinaryStorage === 'function') {
  // Options pour la version 4.x (format imbriqué)
  storageOptions.params = {
    folder: 'beautyflow',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
  };
} else {
  // Options pour la version 2.x/3.x (format plat)
  storageOptions.folder = 'beautyflow';
  storageOptions.allowedFormats = ['jpg', 'png', 'jpeg', 'webp'];
}

const storage = new CloudinaryStorage(storageOptions);

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // Limite à 20 Mo max
});

module.exports = { cloudinary, upload };
