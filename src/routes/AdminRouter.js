const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getAllSalons,
  getDashboardStats,
  updateSalonStatus,
  createSalon
} = require('../controllers/AdminController');

const router = express.Router();

// Appliquer le middleware de protection et de restriction Administrateur
// à toutes les routes de ce routeur
router.use(protect);
router.use(authorize('admin'));

router.route('/salons')
  .get(getAllSalons)
  .post(createSalon);

router.route('/salons/:id/status')
  .put(updateSalonStatus);

router.route('/stats')
  .get(getDashboardStats);

module.exports = router;
