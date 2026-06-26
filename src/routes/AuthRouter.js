const express = require('express');
const router = express.Router();
const { login, adminLogin, updatePassword, getMe, initiateGoogleAuth, googleAuthCallback, googleTokenLogin } = require('../controllers/AuthController');

const { protect } = require('../middleware/auth');
router.post('/login', login);
router.post('/admin-login', adminLogin);

// Routes OAuth2 (Server-Side et Client-Side/Token)
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', googleAuthCallback);
router.post('/google', googleTokenLogin);

// PUT  /api/auth/password
router.put('/password', protect, updatePassword);

router.get('/me', protect, getMe);

module.exports = router;