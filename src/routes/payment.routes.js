const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { protect, authorize } = require('../middleware/auth');
const verifyPawapaySignature = require('../middleware/verifyPawapaySignature');

// Routes utilitaires pawaPay V2 (Configuration & Prédiction)
router.get('/active-conf', paymentController.getActiveConfig);
router.post('/predict-provider', paymentController.predictProvider);
router.get('/plans', paymentController.getPlans);

// Routes de création de dépôt (USSD Push V2) pour abonnement
// 1. Par ID de salon (requiert d'être connecté)
router.post('/subscribe/:salonId', protect, (req, res, next) => {
  req.body.salonId = req.params.salonId;
  paymentController.createDeposit(req, res, next);
});

// 2. Par e-mail (sans connexion nécessaire, ex: relances ou admin)
router.post('/subscribe-by-email', paymentController.createDeposit);

// 3. Réservation (Booking) - frontend client BeautyFlow
router.post('/booking/:rendezvousId', paymentController.createBookingDeposit);

// Vérification manuelle synchrone d'un dépôt (redirection de retour client)
router.get('/verify', paymentController.verifyDeposit);

// Obtenir le statut d'un paiement en JSON (pour le polling frontend)
router.get('/status/:depositId', paymentController.getPaymentStatus);

// Webhooks pawaPay V2 sécurisés par signature / jeton
router.post('/webhook/pawapay/deposit', verifyPawapaySignature, paymentController.depositCallback);
router.post('/webhook/pawapay/payout', verifyPawapaySignature, paymentController.payoutCallback);
router.post('/webhook/pawapay/refund', verifyPawapaySignature, paymentController.refundCallback);

// Remboursement de transaction (Restreint à l'administrateur système)
router.post('/refund', protect, authorize('admin'), paymentController.createRefund);


module.exports = router;
