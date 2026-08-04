const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudinary');
const { protect } = require('../middleware/auth');

// Route pour uploader une seule image
router.post('/single', protect, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Erreur lors de l\'upload Cloudinary :', err);
      return res.status(500).json({ success: false, message: err.message || 'Erreur lors du transfert vers Cloudinary' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image fournie' });
    }

    const imageUrl = req.file.path || req.file.secure_url || req.file.url;
    res.status(200).json({
      success: true,
      message: 'Image uploadée avec succès',
      url: imageUrl
    });
  });
});

// Route pour uploader plusieurs images
router.post('/multiple', protect, (req, res) => {
  upload.array('images', 10)(req, res, (err) => {
    if (err) {
      console.error('Erreur lors de l\'upload multiple Cloudinary :', err);
      return res.status(500).json({ success: false, message: err.message || 'Erreur lors du transfert vers Cloudinary' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune image fournie' });
    }

    const urls = req.files.map(file => file.path || file.secure_url || file.url);
    res.status(200).json({
      success: true,
      message: 'Images uploadées avec succès',
      urls: urls
    });
  });
});

module.exports = router;
