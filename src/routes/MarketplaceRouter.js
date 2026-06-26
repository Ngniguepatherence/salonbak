const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  getSalons,
  getSalonBySlug,
  createBooking,
  googleLogin,
  getSalonAppointments,
  updateProfile,
  toggleFavorite,
  initiateGoogleAuth,
  googleAuthCallback
} = require('../controllers/MarketplaceController');

const { protectAppUser } = require('../middleware/auth');

// Auth routes for marketplace
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/google', initiateGoogleAuth);
router.get('/auth/google/callback', googleAuthCallback);
router.post('/auth/google', googleLogin);
router.get('/auth/me', protectAppUser, getMe);
router.put('/auth/profile', protectAppUser, updateProfile);
router.post('/auth/favorites/toggle', protectAppUser, toggleFavorite);


// Public browsing routes
router.get('/salons', getSalons);
router.get('/salons/:slug', getSalonBySlug);
router.get('/salons/:slug/appointments', getSalonAppointments);

// Protected action route
router.post('/bookings', protectAppUser, createBooking);

module.exports = router;
