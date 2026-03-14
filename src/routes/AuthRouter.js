const express = require('express');
const router = express.Router();
const {login, updatePassword, getMe} = require('../controllers/AuthController');

const { protect } = require('../middleware/auth');
router.post('/login',login);
// PUT  /api/auth/password
router.put('/password', protect, updatePassword);

router.get('/me',protect, getMe);

module.exports = router;