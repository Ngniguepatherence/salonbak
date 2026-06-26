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
  getSalonAppointments
} = require('../controllers/MarketplaceController');

const { protectAppUser } = require('../middleware/auth');

// Auth routes for marketplace
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/google', googleLogin);
router.get('/auth/me', protectAppUser, getMe);

// Public browsing routes
router.get('/salons', getSalons);
router.get('/salons/:slug', getSalonBySlug);
router.get('/salons/:slug/appointments', getSalonAppointments);

// Protected action route
router.post('/bookings', protectAppUser, createBooking);

module.exports = router;
