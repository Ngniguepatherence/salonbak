const Transaction = require('../models/Transaction');
const Rendezvous = require('../models/Rendezvous');
const PayoutTransaction = require('../models/PayoutTransaction');
const subscriptionService = require('./subscription.service');

class PaymentService {
  /**
   * Crée un enregistrement de transaction en attente (PENDING)
   */
  async createPendingTransaction({ salonId, userId, amount, reference, depositId, type, plan, durationDays }) {
    try {
      const transaction = await Transaction.create({
        salonId,
        userId,
        montant: amount,
        devise: 'XAF',
        reference,
        pawapayDepositId: depositId,
        type: type || 'abonnement',
        plan: plan || 'basic',
        dureeJours: durationDays || 30,
        statut: 'PENDING'
      });
      return transaction;
    } catch (error) {
      console.error('Erreur createPendingTransaction:', error);
      throw error;
    }
  }

  /**
   * Traite la notification finale d'un paiement réussi ou échoué
   */
  async processCompletedDeposit(depositId, status, clientReferenceId) {
    try {
      const isSuccessful = status === 'COMPLETED' || status === 'SUCCESS';

      const transaction = await Transaction.findOne({ pawapayDepositId: depositId });
      if (transaction) {
        if (transaction.statut !== 'PENDING') {
          console.log(`[PAYMENT SERVICE] Transaction ${transaction.reference} déjà traitée (Statut: ${transaction.statut})`);
          return transaction;
        }

        if (isSuccessful) {
          transaction.statut = 'SUCCESSFUL';
          await transaction.save();

          if (transaction.type === 'reservation') {
            // Logique de réservation
            const booking = await Rendezvous.findOne({ reference: transaction.reference }).populate('salon').populate('typePrestation');
            if (booking && booking.statut !== 'paid') {
              booking.statut = 'paid';
              await booking.save();
              console.log(`[PAYMENT SERVICE] Réservation ${transaction.reference} marquée comme payée.`);

              if (booking.salon && booking.salon.phone) {
                const amount = transaction.montant || 0;
                if (amount > 0) {
                  // Récupérer le prix de base de la prestation pour calculer le reversement net de commission
                  let basePrice = amount;
                  if (booking.typePrestation && booking.typePrestation.prix) {
                    basePrice = parseInt(booking.typePrestation.prix.replace(/\D/g, ''), 10) || amount;
                  }
                  
                  const payoutAmount = Math.floor(basePrice * 0.95);
                  const commission = basePrice - payoutAmount;
                  console.log(`[PAYMENT SERVICE] Reversement au salon initié : ${payoutAmount} XAF (Commission: ${commission} XAF sur prix de base ${basePrice} XAF)`);

                  const pawapayService = require('./pawapay.service');
                  const crypto = require('crypto');

                  let detectedProvider = 'MTN_MOMO_CMR';
                  try {
                    const prediction = await pawapayService.predictProvider(booking.salon.phone);
                    if (prediction && prediction.provider) {
                      detectedProvider = prediction.provider;
                    }
                  } catch (e) {
                    console.warn(`[PAYMENT SERVICE] Impossible de prédire le provider, utilisation par défaut.`);
                  }

                  const payoutId = crypto.randomUUID();
                  
                  // Enregistrer la tentative de décaissement
                  const payoutRecord = new PayoutTransaction({
                    salonId: booking.salon._id,
                    rendezvousId: booking._id,
                    pawapayPayoutId: payoutId,
                    montant: payoutAmount,
                    devise: 'XAF',
                    statut: 'PENDING'
                  });
                  await payoutRecord.save();

                  try {
                    await pawapayService.initiatePayout({
                      payoutId,
                      amount: payoutAmount,
                      phone: booking.salon.phone,
                      provider: detectedProvider
                    });
                  } catch (payoutError) {
                    payoutRecord.statut = 'FAILED';
                    payoutRecord.failureReason = payoutError.message || 'Erreur inconnue';
                    await payoutRecord.save();
                    console.error(`[PAYMENT SERVICE] Echec de l'initiation du reversement: ${payoutError.message}`);
                  }
                } else {
                  console.warn(`[PAYMENT SERVICE] Impossible de faire le payout, montant introuvable pour le depositId: ${depositId}`);
                }
              }
            }
          } else {
            // Activer la logique d'abonnement via le service dédié
            await subscriptionService.activateSubscription(
              transaction.salonId,
              transaction.plan,
              transaction.reference,
              transaction.dureeJours
            );
          }
        } else if (status === 'FAILED' || status === 'CANCELLED') {
          transaction.statut = status.toUpperCase();
          await transaction.save();
        }
        return transaction;
      }

      console.warn(`[PAYMENT SERVICE] Aucune transaction trouvée pour le dépôt ID: ${depositId}`);
      return null;
    } catch (error) {
      console.error('Erreur processCompletedDeposit:', error);
      throw error;
    }
  }

  /**
   * Traite la notification d'un reversement (payout) pawaPay
   */
  async processCompletedPayout(payoutId, status, failureReason) {
    try {
      const isSuccessful = status === 'COMPLETED' || status === 'SUCCESS';
      
      const payoutRecord = await PayoutTransaction.findOne({ pawapayPayoutId: payoutId });
      if (payoutRecord) {
        if (payoutRecord.statut === 'SUCCESSFUL' || (payoutRecord.statut !== 'PENDING' && payoutRecord.statut !== 'SUBMITTED')) {
          console.log(`[PAYMENT SERVICE] Payout ${payoutId} déjà traité (Statut: ${payoutRecord.statut})`);
          return payoutRecord;
        }

        if (isSuccessful) {
          payoutRecord.statut = 'SUCCESSFUL';
          await payoutRecord.save();
          console.log(`[PAYMENT SERVICE] Payout ${payoutId} confirmé avec succès !`);
        } else if (status === 'FAILED' || status === 'REJECTED') {
          payoutRecord.statut = status.toUpperCase();
          payoutRecord.failureReason = failureReason || 'Erreur pawaPay';
          await payoutRecord.save();
          console.error(`[PAYMENT SERVICE] Payout ${payoutId} échoué: ${payoutRecord.failureReason}`);
        }
        return payoutRecord;
      }
      
      console.warn(`[PAYMENT SERVICE] Aucun PayoutTransaction trouvé pour l'ID: ${payoutId}`);
      return null;
    } catch (error) {
      console.error('Erreur processCompletedPayout:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
