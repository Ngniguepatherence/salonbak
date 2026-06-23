const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/PaymentController');
const { protect } = require('../middleware/auth'); // Assumant l'existence d'un middleware d'authentification

// Route pour initier le paiement d'un abonnement pour un salon (Nécessite d'être connecté)
router.post('/subscribe/:salonId', protect, paymentController.initiateSubscriptionPayment);
// router.get('/subscribe/:salonId', protect, paymentController.initiateSubscriptionPayment);

// Route publique pour initier un abonnement via l'email quand on est bloqué au login
router.post('/subscribe-by-email', paymentController.initiateSubscriptionByEmail);

// Webhook Tranzak (Route publique appelée par les serveurs de Tranzak)
router.post('/webhook/tranzak', paymentController.tranzakWebhook);

// Route pour simuler la complétion d'un paiement en mode développement/test
router.get('/simulate-payment', paymentController.simulatePayment);

// Route pour vérifier le paiement de manière synchrone lors de la redirection
router.get('/verify', paymentController.verifyPayment);

module.exports = router;
