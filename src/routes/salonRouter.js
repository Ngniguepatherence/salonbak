const express = require('express');
const router = express.Router({ mergeParams: true }); // pour accès à :salonId depuis les sous-routes

const { protect, authorize, belongsToSalon, requireActiveSubscription } = require('../middleware/auth');

// Controllers spécifiques
const {
  getSalon,
  updateSalon,
//   getStaff,
//   createStaff,
//   updateStaff,
//   deleteStaff,
} = require('../controllers/SalonController');
const { getRappels } = require('../controllers/rappelController');
const {
  getVentes,
  createVente,
  updateVente,
  deleteVente,
} = require('../controllers/venteController');

const {
  getRendezVous,
  createRendezVous,
  updateRendezVous,
  deleteRendezVous,
} = require('../controllers/Rendezvouscontroller');

// Factory CRUD générique
const createTenantController = require('../controllers/TenantController');
const Client = require('../models/Client');
const Prestation = require('../models/Prestation');
const TypePrestation = require('../models/TypePrestation');
const Produit = require('../models/produit');
const Depense = require('../models/depense');

const clientCtrl       = createTenantController(Client);
const prestationCtrl   = createTenantController(Prestation);
const typeCtrl         = createTenantController(TypePrestation);
const produitCtrl      = createTenantController(Produit);
const depenseCtrl      = createTenantController(Depense, [{ path: 'creePar', select: 'name' }]);

// ──────────────────────────────────────────────
// Middlewares communs à toutes les routes salon
// ──────────────────────────────────────────────
router.use(protect, belongsToSalon, requireActiveSubscription);

// ==================== SALON ====================
router.route('/')
  .get(getSalon)
  .put(authorize('owner'), updateSalon);

// // ==================== STAFF ====================
// router.route('/staff')
//   .get(authorize('owner'), getStaff)
//   .post(authorize('owner'), createStaff);

// router.route('/staff/:userId')
//   .put(authorize('owner'), updateStaff)
//   .delete(authorize('owner'), deleteStaff);

// ==================== CLIENTS ====================
router.route('/clients')
  .get(clientCtrl.getAll)
  .post(clientCtrl.create);

router.route('/clients/:id')
  .get(clientCtrl.getOne)
  .put(clientCtrl.update)
  .delete(authorize('owner'), clientCtrl.delete);

// ==================== TYPES DE PRESTATIONS ====================
router.route('/types-prestations')
  .get(typeCtrl.getAll)
  .post(authorize('owner'), typeCtrl.create);

router.route('/types-prestations/:id')
  .get(typeCtrl.getOne)
  .put(authorize('owner'), typeCtrl.update)
  .delete(authorize('owner'), typeCtrl.delete);

// ==================== PRESTATIONS ====================
router.route('/prestations')
  .get(prestationCtrl.getAll)
  .post(authorize('owner'), prestationCtrl.create);

router.route('/prestations/:id')
  .get(prestationCtrl.getOne)
  .put(authorize('owner'), prestationCtrl.update)
  .delete(authorize('owner'), prestationCtrl.delete);

// ==================== PRODUITS ====================
router.route('/produits')
  .get(produitCtrl.getAll)
  .post(authorize('owner'), produitCtrl.create);

router.route('/produits/:id')
  .get(produitCtrl.getOne)
  .put(authorize('owner'), produitCtrl.update)
  .delete(authorize('owner'), produitCtrl.delete);

// ==================== VENTES ====================
router.route('/ventes')
  .get(getVentes)
  .post(createVente);

router.route('/ventes/:id')
  .put(authorize('owner'), updateVente)
  .delete(authorize('owner'), deleteVente);

// ==================== DÉPENSES ====================
router.route('/depenses')
  .get(authorize('owner'), depenseCtrl.getAll)
  .post(authorize('owner'), depenseCtrl.create);

router.route('/depenses/:id')
  .get(authorize('owner'), depenseCtrl.getOne)
  .put(authorize('owner'), depenseCtrl.update)
  .delete(authorize('owner'), depenseCtrl.delete);

// ==================== RENDEZ-VOUS ====================
router.route('/rendez-vous')
  .get(getRendezVous)
  .post(createRendezVous);

router.route('/rendez-vous/:id')
  .put(updateRendezVous)
  .delete(deleteRendezVous);

// ==================== RAPPELS ====================
router.route('/:salonId/rappels')
  .get(authorize('owner'), getRappels);


module.exports = router;
