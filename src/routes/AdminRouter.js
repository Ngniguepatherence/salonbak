const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getAllSalons,
  getDashboardStats,
  updateSalonStatus,
  createSalon,
  getSalonUsers,
  addSalonStaff,
  updateSalonStaff,
  deleteSalonStaff,
} = require('../controllers/AdminController');

const router = express.Router();

// Protection admin pour toutes les routes
router.use(protect);
router.use(authorize('admin'));

// Salons CRUD
router.route('/salons')
  .get(getAllSalons)
  .post(createSalon);

router.route('/salons/:id/status')
  .put(updateSalonStatus);

router.route('/stats')
  .get(getDashboardStats);

// Gestion des utilisateurs d'un salon (owner + staff)
router.route('/salons/:id/users')
  .get(getSalonUsers)
  .post(addSalonStaff);

router.route('/salons/:id/users/:userId')
  .put(updateSalonStaff)
  .delete(deleteSalonStaff);

module.exports = router;
