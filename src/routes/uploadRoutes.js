const express = require('express');
const router = express.Router();
const { upload } = require('../config/cloudinary');
const { protect } = require('../middleware/auth');

// Route pour uploader une seule image
router.post('/single', protect, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image fournie' });
    }
    
    res.status(200).json({
      success: true,
      message: 'Image uploadée avec succès',
      url: req.file.path // URL retournée par Cloudinary
    });
  } catch (error) {
    console.error('Erreur lors de l\'upload :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'upload' });
  }
});

// Route pour uploader plusieurs images
router.post('/multiple', protect, upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune image fournie' });
    }
    
    const urls = req.files.map(file => file.path);
    
    res.status(200).json({
      success: true,
      message: 'Images uploadées avec succès',
      urls: urls
    });
  } catch (error) {
    console.error('Erreur lors de l\'upload multiple :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'upload' });
  }
});

module.exports = router;
