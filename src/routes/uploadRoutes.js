const express = require('express');
const router = express.Router();
const { upload, uploadDirectBase64 } = require('../config/cloudinary');
const { protect } = require('../middleware/auth');

// Route pour uploader une seule image (Multipart ou Base64)
router.post('/single', protect, (req, res) => {
  // 1. Tenter l'upload multipart via Multer / CloudinaryStorage
  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('Erreur multer upload single :', err);
      // Si multer échoue mais qu'une string base64 est fournie dans req.body
      if (req.body && req.body.image && typeof req.body.image === 'string' && req.body.image.startsWith('data:')) {
        try {
          const url = await uploadDirectBase64(req.body.image);
          return res.status(200).json({ success: true, message: 'Image uploadée avec succès', url });
        } catch (base64Err) {
          console.error('Erreur fallback base64 single :', base64Err);
        }
      }
      return res.status(500).json({ success: false, message: err.message || 'Erreur lors du transfert vers Cloudinary' });
    }

    if (req.file) {
      const imageUrl = req.file.path || req.file.secure_url || req.file.url;
      return res.status(200).json({
        success: true,
        message: 'Image uploadée avec succès',
        url: imageUrl
      });
    }

    // 2. Si aucun fichier multipart n'a été intercepté, vérifier si une image en base64 est dans le body
    if (req.body && req.body.image && typeof req.body.image === 'string') {
      try {
        const url = await uploadDirectBase64(req.body.image);
        return res.status(200).json({ success: true, message: 'Image uploadée avec succès', url });
      } catch (uploadErr) {
        console.error('Erreur upload base64 direct :', uploadErr);
        return res.status(500).json({ success: false, message: uploadErr.message || 'Erreur upload Cloudinary' });
      }
    }

    return res.status(400).json({ success: false, message: 'Aucune image fournie' });
  });
});

// Route pour uploader plusieurs images (Multipart ou Base64)
router.post('/multiple', protect, (req, res) => {
  upload.array('images', 15)(req, res, async (err) => {
    if (err) {
      console.error('Erreur multer upload multiple :', err);
      if (req.body && req.body.images && Array.isArray(req.body.images)) {
        try {
          const urls = await Promise.all(
            req.body.images
              .filter(img => typeof img === 'string')
              .map(img => img.startsWith('http') ? Promise.resolve(img) : uploadDirectBase64(img))
          );
          return res.status(200).json({ success: true, message: 'Images uploadées avec succès', urls });
        } catch (base64Err) {
          console.error('Erreur fallback base64 multiple :', base64Err);
        }
      }
      return res.status(500).json({ success: false, message: err.message || 'Erreur lors du transfert vers Cloudinary' });
    }

    if (req.files && req.files.length > 0) {
      const urls = req.files.map(file => file.path || file.secure_url || file.url);
      return res.status(200).json({
        success: true,
        message: 'Images uploadées avec succès',
        urls: urls
      });
    }

    if (req.body && req.body.images && Array.isArray(req.body.images) && req.body.images.length > 0) {
      try {
        const urls = await Promise.all(
          req.body.images
            .filter(img => typeof img === 'string')
            .map(img => img.startsWith('http') ? Promise.resolve(img) : uploadDirectBase64(img))
        );
        return res.status(200).json({ success: true, message: 'Images uploadées avec succès', urls });
      } catch (uploadErr) {
        console.error('Erreur upload multiple base64 direct :', uploadErr);
        return res.status(500).json({ success: false, message: uploadErr.message || 'Erreur upload Cloudinary' });
      }
    }

    return res.status(400).json({ success: false, message: 'Aucune image fournie' });
  });
});

module.exports = router;
