const express = require('express');
const router = express.Router();
const { login, adminLogin, updatePassword, getMe } = require('../controllers/AuthController');

const { protect } = require('../middleware/auth');
router.post('/login', login);
router.post('/admin-login', adminLogin);
// PUT  /api/auth/password
router.put('/password', protect, updatePassword);

router.get('/me', protect, getMe);

module.exports = router;