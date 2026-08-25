const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { 
  login, 
  register,
  adminLogin, 
  updatePassword, 
  getMe, 
  initiateGoogleAuth, 
  googleAuthCallback, 
  googleTokenLogin,
  affiliateRegister,
  updatePayoutConfig,
  getAffiliateStats,
  createAffiliateCode,
  updateAffiliateProfile,
  verifyAffiliateEmail,
  resendAffiliateEmailCode
} = require('../controllers/AuthController');

const { protect } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests' }
});

router.post('/register', loginLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/admin-login', loginLimiter, adminLogin);

// Routes OAuth2 (Server-Side et Client-Side/Token)
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', googleAuthCallback);
router.post('/google', loginLimiter, googleTokenLogin);

// Routes Affiliation
router.post('/affiliate/register', loginLimiter, affiliateRegister);
router.post('/affiliate/verify-email', protect, verifyAffiliateEmail);
router.post('/affiliate/resend-email', protect, resendAffiliateEmailCode);
router.put('/affiliate/payout-config', protect, updatePayoutConfig);
router.get('/affiliate/stats', protect, getAffiliateStats);
router.post('/affiliate/create-code', protect, createAffiliateCode);
router.put('/affiliate/profile', protect, updateAffiliateProfile);

// PUT  /api/auth/password
router.put('/password', protect, updatePassword);

router.get('/me', protect, getMe);

module.exports = router;