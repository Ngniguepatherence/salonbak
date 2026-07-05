const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, adminLogin, updatePassword, getMe, initiateGoogleAuth, googleAuthCallback, googleTokenLogin } = require('../controllers/AuthController');

const { protect } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.post('/admin-login', loginLimiter, adminLogin);

// Routes OAuth2 (Server-Side et Client-Side/Token)
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', googleAuthCallback);
router.post('/google', loginLimiter, googleTokenLogin);

// PUT  /api/auth/password
router.put('/password', protect, updatePassword);

router.get('/me', protect, getMe);

module.exports = router;