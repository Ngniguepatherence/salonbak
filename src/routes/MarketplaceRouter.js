const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
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
  googleAuthCallback,
  getSalonSharePreview,
  getCitySharePreview,
  getBookingsCount,
  getClientBookings,
  getClientLoyalty,
  confirmBookingCompletion,
  generateSitemapXml,
  getRobotsTxt,
  trackSalonEvent,
  getSalonAnalytics
} = require('../controllers/MarketplaceController');

const { protectAppUser, optionalAppUser } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sitemap & Robots
router.get('/sitemap.xml', generateSitemapXml);
router.get('/robots.txt', getRobotsTxt);

// Auth routes for marketplace
router.post('/auth/register', loginLimiter, register);
router.post('/auth/login', loginLimiter, login);
router.get('/auth/google', initiateGoogleAuth);
router.get('/auth/google/callback', googleAuthCallback);
router.post('/auth/google', loginLimiter, googleLogin);
router.get('/auth/me', protectAppUser, getMe);
router.get('/auth/loyalty', protectAppUser, getClientLoyalty);
router.put('/auth/profile', protectAppUser, updateProfile);
router.post('/auth/favorites/toggle', protectAppUser, toggleFavorite);


// Public browsing routes
router.get('/salons', getSalons);
router.get('/salons/:slug', getSalonBySlug);
router.get('/salons/:slug/share-preview', getSalonSharePreview);
router.get('/salons/city-preview/:city', getCitySharePreview);
router.get('/salons/city-preview/:category/:city', getCitySharePreview);
router.get('/salons/:slug/appointments', getSalonAppointments);
router.post('/salons/:slug/track', optionalAppUser, trackSalonEvent);
router.get('/salons/:id/analytics', getSalonAnalytics);
router.get('/bookings/count', getBookingsCount);

// Action routes (Guest booking allowed with optionalAppUser)
router.post('/bookings', optionalAppUser, createBooking);
router.get('/bookings', protectAppUser, getClientBookings);
router.post('/bookings/:id/confirm-completion', protectAppUser, confirmBookingCompletion);

module.exports = router;
