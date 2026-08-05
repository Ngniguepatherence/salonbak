const crypto = require('crypto');
const Salon = require('../models/Salon');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const pawapayService = require('../services/pawapay.service');
const paymentService = require('../services/payment.service');
const subscriptionService = require('../services/subscription.service');
const { getPlan } = require('../config/plans');
const { isSafeRedirect } = require('../utils/security');

/**
 * Obtient la configuration active pawaPay
 * Route: GET /api/payments/active-conf
 */
exports.getActiveConfig = async (req, res, next) => {
  try {
    const { country = 'CMR', operationType = 'DEPOSIT' } = req.query;
    const config = await pawapayService.getActiveConfig(country, operationType);
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('Erreur getActiveConfig:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur récupération configuration pawaPay.' });
  }
};

/**
 * Prédit le provider en fonction du numéro de téléphone
 * Route: POST /api/payments/predict-provider
 */
exports.predictProvider = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber est requis.' });
    }
    const prediction = await pawapayService.predictProvider(phoneNumber);
    res.status(200).json({ success: true, data: prediction });
  } catch (error) {
    console.error('Erreur predictProvider:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur prédiction provider.' });
  }
};

/**
 * Création d'un dépôt (USSD Push V2) pour un abonnement ou un paiement direct
 * Route: POST /api/payments/deposit
 */
exports.createDeposit = async (req, res, next) => {
  try {
    const { salonId, email, plan, dureeJours = 30, phone, operator } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Le numéro de téléphone mobile money (phone) est requis.' });
    }

    let targetSalon;
    let userId = req.user ? req.user.id : null;

    // 1. Résoudre le salon (soit par salonId, soit par e-mail)
    if (salonId) {
      targetSalon = await Salon.findById(salonId);
    } else if (email) {
      const user = await User.findOne({ email }).populate('salon');
      if (user) {
        targetSalon = user.salon;
        userId = user._id;
      }
    }

    if (!targetSalon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable.' });
    }

    // 2. Récupérer le montant du plan choisi (prix exact sans frais supplémentaires)
    const selectedPlan = await getPlan(plan);
    const basePrice = selectedPlan ? selectedPlan.price : 5000;
    const amount = basePrice;

    // 3. Générer les identifiants uniques
    const reference = `SUB-${crypto.randomUUID()}`;
    const depositId = crypto.randomUUID();

    // 4. Enregistrer la transaction initiale en attente (PENDING)
    const transaction = await paymentService.createPendingTransaction({
      salonId: targetSalon._id,
      userId,
      amount,
      reference,
      depositId,
      type: 'abonnement',
      plan: plan || 'basic',
      durationDays: dureeJours
    });

    // Déterminer le provider pawaPay V2 pour le Cameroun
    let provider = 'MTN_MOMO_CMR';
    if (operator === 'orange') {
      provider = 'ORANGE_CMR';
    } else if (operator === 'mtn') {
      provider = 'MTN_MOMO_CMR';
    } else {
      // Deviner par rapport au numéro si non spécifié
      const cleanPhone = phone.replace(/\D/g, '');
      const localPhone = cleanPhone.startsWith('237') ? cleanPhone.slice(3) : cleanPhone;
      if (localPhone.startsWith('69') || localPhone.startsWith('655') || localPhone.startsWith('656') || localPhone.startsWith('657') || localPhone.startsWith('658') || localPhone.startsWith('659')) {
        provider = 'ORANGE_CMR';
      }
    }

    // 5. Appeler l'API pawaPay V2 pour initier le paiement USSD Push
    const planLabel = (selectedPlan?.name || plan || 'Basic').toLowerCase();
    const pawaPayResult = await pawapayService.initiateDeposit({
      depositId,
      amount,
      phone,
      clientReferenceId: reference,
      description: `Abo Beautyflow ${planLabel}`.slice(0, 22),
      provider
    });

    // Déterminer le lien de retour pour la vérification
    const verifyUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/payments/verify?depositId=${depositId}&ref=${reference}&returnUrl=${encodeURIComponent(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/login`)}`;

    // Get provider details to send to frontend for the waiting screen
    let providerInfo = null;
    try {
      // On récupère la config active pour chercher le provider
      const config = await pawapayService.getActiveConfig('CMR', 'DEPOSIT');
      const countryConfig = config.countries.find(c => c.country === 'CMR');
      if (countryConfig) {
        providerInfo = countryConfig.providers.find(p => p.provider === provider);
      }
    } catch (err) {
      console.warn("Could not fetch provider info for UI", err.message);
    }

    res.status(200).json({
      success: true,
      message: 'Demande de paiement initiée. Saisissez votre PIN de validation sur votre téléphone.',
      data: {
        depositId,
        reference,
        status: pawaPayResult.status, // ex: SUBMITTED, ACCEPTED
        verifyUrl,
        providerInfo, // Info utile pour l'interface de validation frontend
        // En mode développement sans token pawaPay, on renvoie le lien de simulation
        paymentLink: !process.env.PAWAPAY_API_TOKEN
          ? `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/payments/simulate-payment?ref=${reference}&salonId=${targetSalon._id}&returnUrl=${encodeURIComponent(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/login?payment=success`)}`
          : null
      }
    });

  } catch (error) {
    console.error('Erreur createDeposit:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de l\'initiation du paiement.' });
  }
};

/**
 * Création d'un dépôt pour le paiement d'une réservation (Booking)
 * Route: POST /api/payments/booking/:rendezvousId
 */
exports.createBookingDeposit = async (req, res, next) => {
  try {
    const { rendezvousId } = req.params;
    const { phone, operator, amount } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Le numéro de téléphone mobile money est requis.' });
    }
    const Rendezvous = require('../models/Rendezvous');
    const booking = await Rendezvous.findById(rendezvousId).populate('salon').populate('typePrestation');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable.' });
    }

    if (booking.statut === 'paid') {
      return res.status(400).json({ success: false, message: 'Cette réservation est déjà payée.' });
    }

    // Récupérer le prix de la prestation pour le calcul exact avec frais (collection + payout) à la charge du client
    let basePrice = 0;
    if (booking.typePrestation && booking.typePrestation.prix) {
      basePrice = parseInt(booking.typePrestation.prix.replace(/\D/g, ''), 10);
    }

    let calculatedAmount = amount;
    if (basePrice > 0) {
      const rColl = 0.02; // 1% pawaPay + 1% MMO
      const rPayout = 0.02; // 1% pawaPay + 1% MMO
      const salonPayout = basePrice * 0.90; // Le salon reçoit 90% (10% platform commission)
      calculatedAmount = Math.ceil((basePrice + salonPayout * rPayout) / (1 - rColl));
    }

    if (!calculatedAmount) {
      return res.status(400).json({ success: false, message: 'Le montant est requis.' });
    }

    const reference = booking.reference || `BKG-${crypto.randomUUID()}`;
    if (!booking.reference) {
      booking.reference = reference;
      await booking.save();
    }

    const depositId = crypto.randomUUID();

    // Enregistrer la transaction
    const transaction = await paymentService.createPendingTransaction({
      salonId: booking.salon._id,
      userId: req.user ? req.user.id : (booking.client || null),
      amount: calculatedAmount,
      reference,
      depositId,
      type: 'reservation',
      plan: 'reservation',
      durationDays: 0
    });

    let provider = 'MTN_MOMO_CMR';
    if (operator === 'orange') {
      provider = 'ORANGE_CMR';
    } else if (operator === 'mtn') {
      provider = 'MTN_MOMO_CMR';
    } else {
      const cleanPhone = phone.replace(/\D/g, '');
      const localPhone = cleanPhone.startsWith('237') ? cleanPhone.slice(3) : cleanPhone;
      if (localPhone.startsWith('69') || localPhone.startsWith('655') || localPhone.startsWith('656') || localPhone.startsWith('657') || localPhone.startsWith('658') || localPhone.startsWith('659')) {
        provider = 'ORANGE_CMR';
      }
    }

    const pawaPayResult = await pawapayService.initiateDeposit({
      depositId,
      amount: calculatedAmount,
      phone,
      clientReferenceId: reference,
      description: `Reservation ${booking.salon.nom || booking.salon.name}`.slice(0, 22),
      provider
    });


    res.status(200).json({
      success: true,
      message: 'Demande de paiement de réservation initiée.',
      data: {
        depositId,
        reference,
        status: pawaPayResult.status
      }
    });

  } catch (error) {
    console.error('Erreur createBookingDeposit:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de l\'initiation du paiement.' });
  }
};

/**
 * Webhook callback pour la réception des notifications de dépôts pawaPay V2
 * Route: POST /api/payments/webhook/pawapay/deposit
 */
exports.depositCallback = async (req, res, next) => {
  try {
    const payload = req.body;
    console.log('[PAWAPAY WEBHOOK] Callback Deposit V2 reçu :', payload);

    // pawaPay peut envoyer un tableau de notifications ou un objet simple
    const notifications = Array.isArray(payload) ? payload : [payload];

    for (const notif of notifications) {
      const { depositId, status, clientReferenceId } = notif;
      if (!depositId) continue;

      // Déléguer au service de paiement pour traiter les transactions/réservations
      await paymentService.processCompletedDeposit(depositId, status, clientReferenceId);
    }

    res.status(200).send();
  } catch (error) {
    console.error('Erreur dans depositCallback:', error);
    res.status(500).send();
  }
};

/**
 * Webhook callback pour la réception des notifications de décaissements (Payouts)
 * Route: POST /api/payments/webhook/pawapay/payout
 */
exports.payoutCallback = async (req, res, next) => {
  try {
    const payload = req.body;
    console.log('[PAWAPAY WEBHOOK] Callback Payout V2 reçu :', payload);

    const notifications = Array.isArray(payload) ? payload : [payload];

    for (const notif of notifications) {
      const { payoutId, status, failureReason } = notif;
      if (!payoutId) continue;

      let reason = '';
      if (failureReason && typeof failureReason === 'object') {
        reason = failureReason.failureMessage || failureReason.failureCode;
      } else if (failureReason) {
        reason = String(failureReason);
      }

      await paymentService.processCompletedPayout(payoutId, status, reason);
    }

    res.status(200).send();
  } catch (error) {
    console.error('Erreur dans payoutCallback:', error);
    res.status(500).send();
  }
};

/**
 * Webhook callback pour la réception des notifications de remboursements
 * Route: POST /api/payments/webhook/pawapay/refund
 */
exports.refundCallback = async (req, res, next) => {
  try {
    const payload = req.body;
    console.log('[PAWAPAY WEBHOOK] Callback Refund V2 reçu :', payload);

    const notifications = Array.isArray(payload) ? payload : [payload];
    for (const notif of notifications) {
      const { refundId, depositId, status } = notif;
      console.log(`[REFUND CALLBACK] Remboursement ID: ${refundId} pour le dépôt: ${depositId} -> Statut: ${status}`);
      // Optionnel : ajouter ici la mise à jour de statut de remboursement en base si nécessaire
    }

    res.status(200).send();
  } catch (error) {
    console.error('Erreur dans refundCallback:', error);
    res.status(500).send();
  }
};

/**
 * Vérification manuelle/synchrone d'un dépôt après redirection ou interrogation
 * Route: GET /api/payments/verify
 */
exports.verifyDeposit = async (req, res, next) => {
  try {
    const { depositId, ref, returnUrl } = req.query;
    const defaultLoginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

    const getSafeRedirectUrl = (url, fallback = defaultLoginUrl) => {
      return isSafeRedirect(url) ? url : fallback;
    };

    if (!depositId) {
      return res.redirect(getSafeRedirectUrl(returnUrl));
    }

    // Interroger l'API V2 pour récupérer le statut réel du dépôt
    const depositData = await pawapayService.getDepositStatus(depositId);
    const status = depositData?.status;

    // Mettre à jour l'état de la transaction en base de données
    await paymentService.processCompletedDeposit(depositId, status, ref);

    if (status === 'COMPLETED' || status === 'SUCCESS') {
      return res.redirect(getSafeRedirectUrl(returnUrl, `${defaultLoginUrl}?payment=success`));
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      return res.redirect(getSafeRedirectUrl(returnUrl, `${defaultLoginUrl}?payment=error`));
    } else {
      const pendingUrl = returnUrl ? returnUrl.replace('payment=success', 'payment=pending') : `${defaultLoginUrl}?payment=pending`;
      return res.redirect(getSafeRedirectUrl(pendingUrl, `${defaultLoginUrl}?payment=pending`));
    }

  } catch (error) {
    console.error('Erreur verifyDeposit:', error);
    const defaultLoginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    const errorUrl = req.query.returnUrl || `${defaultLoginUrl}?payment=error`;
    return res.redirect(getSafeRedirectUrl(errorUrl, `${defaultLoginUrl}?payment=error`));
  }
};

/**
 * Déclenche une demande de remboursement (Réservé à l'administrateur)
 * Route: POST /api/payments/refund
 */
exports.createRefund = async (req, res, next) => {
  try {
    const { depositId, amount, description } = req.body;

    if (!depositId || !amount) {
      return res.status(400).json({ success: false, message: 'Les paramètres depositId et amount sont requis.' });
    }

    const refundId = crypto.randomUUID();

    const result = await pawapayService.initiateRefund({
      refundId,
      depositId,
      amount,
      description
    });

    res.status(200).json({
      success: true,
      message: 'Demande de remboursement soumise à pawaPay.',
      data: {
        refundId,
        status: result.status
      }
    });

  } catch (error) {
    console.error('Erreur createRefund:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la demande de remboursement.' });
  }
};



/**
 * Retourne le statut de la transaction en format JSON (pour le polling frontend)
 * Route: GET /api/payments/status/:depositId
 */
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const depositId = req.params.depositId;
    let transaction = await Transaction.findOne({ pawapayDepositId: depositId });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction introuvable' });
    }

    // Si la transaction est toujours PENDING, interroger l'API pawaPay en direct pour mise à jour
    if (transaction.statut === 'PENDING') {
      try {
        const depositData = await pawapayService.getDepositStatus(depositId);
        if (depositData && depositData.status && depositData.status !== 'PENDING' && depositData.status !== 'SUBMITTED') {
          transaction = await paymentService.processCompletedDeposit(
            depositId,
            depositData.status,
            transaction.reference,
            depositData.failureReason || depositData.rejectionReason || depositData.failureMessage
          );
        }
      } catch (err) {
        console.warn(`[getPaymentStatus] Impossible d'interroger pawaPay en direct : ${err.message}`);
      }
    }

    let message = null;
    const reason = ((transaction.failureReason || '') + '').toLowerCase();
    const isFailed = transaction.statut === 'FAILED' || transaction.statut === 'CANCELLED' || transaction.statut === 'REJECTED';
    if (isFailed) {
      if (reason.includes('insufficient') || reason.includes('solde') || reason.includes('not_enough') || reason.includes('funds') || reason.includes('balance')) {
        message = 'Solde insuffisant dans votre compte Mobile Money.';
      } else if (reason.includes('cancel') || reason.includes('annul')) {
        message = 'Paiement annulé par l\'utilisateur.';
      } else if (reason.includes('timeout') || reason.includes('expir')) {
        message = 'Délai d\'attente dépassé (expiration du paiement).';
      } else {
        message = transaction.failureReason || 'Le paiement Mobile Money n\'a pas pu être validé.';
      }
    }

    res.status(200).json({
      success: true,
      status: transaction.statut,
      failureReason: transaction.failureReason,
      message
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Retourne la liste des plans d'abonnement actifs
 * Route: GET /api/payments/plans
 */
exports.getPlans = async (req, res, next) => {
  try {
    const Plan = require('../models/Plan');
    let dbPlans = await Plan.find({});
    if (!dbPlans || dbPlans.length === 0) {
      const { PLANS } = require('../config/plans');
      dbPlans = Object.values(PLANS);
    }
    res.status(200).json({ success: true, data: dbPlans });
  } catch (error) {
    console.error('Erreur getPlans:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la récupération des plans.' });
  }
};

