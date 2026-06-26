const express = require('express');
const router = express.Router({ mergeParams: true }); // pour accès à :salonId depuis les sous-routes

const { protect, authorize, belongsToSalon, requireActiveSubscription, checkPlanLimit } = require('../middleware/auth');

// Controllers spécifiques
const {
  onboardSalon,
  linkSalon,
  getSalon,
  updateSalon,
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  upgradeRequest,
  updateConfigFidelite,
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

const {
  getAbonnement,         // ← ajouter
  updateRappels,         // ← ajouter
} = require('../controllers/SalonController');

// Factory CRUD générique
const createTenantController = require('../controllers/TenantController');
const Client = require('../models/Client');
const Prestation = require('../models/Prestation');
const TypePrestation = require('../models/TypePrestation');
const Produit = require('../models/produit');
const Depense = require('../models/depense');

// Campagnes & Groupes de contacts
const {
  getCampagnes,
  createCampagne,
  updateCampagne,
  deleteCampagne,
  updateStats,
  getGroupes,
  createGroupe,
  updateGroupe,
  deleteGroupe,
} = require('../controllers/campaignController');

const clientCtrl = require('../controllers/ClientController');
const prestationCtrl = createTenantController(Prestation);
const typeCtrl = createTenantController(TypePrestation);
const produitCtrl = createTenantController(Produit);
const depenseCtrl = createTenantController(Depense, [{ path: 'creePar', select: 'name' }]);

// ==================== ONBOARDING ====================
router.post('/onboard', protect, onboardSalon);
router.post('/link', protect, linkSalon);

// ──────────────────────────────────────────────
// Middlewares communs à toutes les routes salon
// ──────────────────────────────────────────────
router.use(protect, belongsToSalon, requireActiveSubscription);

// ==================== SALON ====================
router.route('/')
  .get(getSalon)
  .put(authorize('owner'), updateSalon);

router.post('/fidelite', authorize('owner'), updateConfigFidelite);
router.post('/upgrade-request', authorize('owner'), upgradeRequest);

// ==================== STAFF ====================
router.route('/staff')
  .get(authorize('owner', 'staff'), getStaff)
  .post(authorize('owner'), checkPlanLimit('staff'), createStaff);

router.route('/staff/:userId')
  .put(authorize('owner'), updateStaff)
  .delete(authorize('owner'), deleteStaff);

// ==================== CLIENTS ====================
router.get('/clients/search', clientCtrl.search);

router.route('/clients')
  .get(authorize('owner'), clientCtrl.getAll)
  .post(checkPlanLimit('clients'), clientCtrl.create);

router.post('/clients/bulk', authorize('owner', 'staff'), checkPlanLimit('clients'), clientCtrl.bulkCreate);
router.post('/clients/check-duplicates', authorize('owner', 'staff'), clientCtrl.checkDuplicates);
router.post('/clients/bulk-import', authorize('owner', 'staff'), clientCtrl.bulkImport);

router.route('/clients/:id')
  .get(clientCtrl.getOne)
  .put(clientCtrl.update)
  .delete(authorize('owner'), clientCtrl.delete);

// ==================== ABONNEMENT ====================
router.route('/abonnement')
  .get(authorize('owner'), getAbonnement);

// ==================== RAPPELS ====================
// Note: router.use(protect, belongsToSalon) déjà appliqué
router.route('/rappels_config')
  .get(authorize('owner'), getRappels); // Attention: getRappels est le contrôleur des entités Rappel

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
  .post(authorize('owner', 'staff'), produitCtrl.create); // staff peut ajouter des produits

router.route('/produits/:id')
  .get(produitCtrl.getOne)
  .put(authorize('owner', 'staff'), produitCtrl.update)
  .delete(authorize('owner'), produitCtrl.delete);

// ==================== VENTES ====================
// owner → tout voir ; staff → seulement ses ventes du jour (filtrées côté controller)
router.route('/ventes')
  .get(authorize('owner', 'staff'), getVentes)
  .post(createVente);

router.route('/ventes/:id')
  .put(authorize('owner'), updateVente)
  .delete(authorize('owner', 'staff'), deleteVente);

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
  .post(checkPlanLimit('rendezvous'), createRendezVous);

router.route('/rendez-vous/:id')
  .put(updateRendezVous)
  .delete(deleteRendezVous);

// ==================== RAPPELS ====================
router.route('/:salonId/rappels')
  .get(authorize('owner'), getRappels);

// ==================== CAMPAGNES ====================
router.route('/campagnes')
  .get(authorize('owner', 'staff'), getCampagnes)
  .post(authorize('owner'), createCampagne);

router.route('/campagnes/:id')
  .put(authorize('owner'), updateCampagne)
  .delete(authorize('owner'), deleteCampagne);

router.post('/campagnes/:id/update-stats', authorize('owner', 'staff'), updateStats);

// ==================== GROUPES DE CONTACTS ====================
router.route('/groupes-contacts')
  .get(authorize('owner', 'staff'), getGroupes)
  .post(authorize('owner'), createGroupe);

router.route('/groupes-contacts/:id')
  .put(authorize('owner'), updateGroupe)
  .delete(authorize('owner'), deleteGroupe);


module.exports = router;
