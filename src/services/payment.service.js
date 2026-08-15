const Transaction = require('../models/Transaction');
const Rendezvous = require('../models/Rendezvous');
const PayoutTransaction = require('../models/PayoutTransaction');
const subscriptionService = require('./subscription.service');
const { sendPaymentNotificationEmail } = require('./email.service');

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
  async processCompletedDeposit(depositId, status, clientReferenceId, failureReasonData) {
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

          // Envoyer l'email de notification de paiement au client et alerte à l'admin
          sendPaymentNotificationEmail({
            to: null, // S'il n'y a pas d'email direct dans transaction, l'alerte admin part automatiquement
            name: 'Client BeautyFlow',
            amount: transaction.montant,
            reference: transaction.reference,
            type: transaction.type === 'reservation' ? 'Réservation en ligne' : `Abonnement (${transaction.plan})`
          }).catch(e => console.warn('Erreur notification email paiement:', e.message));

          if (transaction.type === 'reservation') {
            // Logique de réservation
            const booking = await Rendezvous.findOne({ reference: transaction.reference }).populate('salon').populate('typePrestation').populate('prestations');
            if (booking && booking.statut !== 'paid') {
              booking.statut = 'paid';
              await booking.save();
              console.log(`[PAYMENT SERVICE] Réservation ${transaction.reference} marquée comme payée en ligne.`);
              
              // Déclencher le reversement (Payout) immédiatement après le dépôt réussi
              try {
                await this.executeBookingPayout(booking);
                console.log(`[PAYMENT SERVICE] Payout initié automatiquement pour la réservation ${transaction.reference}.`);
              } catch (payoutError) {
                console.error(`[PAYMENT SERVICE] Erreur lors de l'initiation automatique du Payout pour ${transaction.reference}:`, payoutError);
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
        } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED') {
          transaction.statut = status.toUpperCase();
          if (failureReasonData) {
            let reasonStr = '';
            if (typeof failureReasonData === 'object') {
              reasonStr = failureReasonData.failureMessage || failureReasonData.failureCode || failureReasonData.rejectionReason || JSON.stringify(failureReasonData);
            } else {
              reasonStr = String(failureReasonData);
            }
            transaction.failureReason = reasonStr;
          }
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

  /**
   * Exécute le Payout au salon pour une réservation complétée/confirmée
   */
  async executeBookingPayout(booking) {
    try {
      if (!booking || !booking.salon) {
        throw new Error('Réservation ou salon introuvable');
      }

      // Vérifier si un payout a déjà été effectué ou initié pour ce rendez-vous
      const existingPayout = await PayoutTransaction.findOne({
        rendezvousId: booking._id,
        statut: { $in: ['PENDING', 'SUBMITTED', 'SUCCESSFUL'] }
      });

      if (existingPayout) {
        console.log(`[PAYMENT SERVICE] Payout déjà existant pour le rendez-vous ${booking.reference} (Statut: ${existingPayout.statut})`);
        return existingPayout;
      }

      // Trouver la transaction de paiement associée pour connaître le montant total payé
      const transaction = await Transaction.findOne({
        reference: booking.reference,
        statut: 'SUCCESSFUL',
        type: 'reservation'
      });

      const totalPaid = transaction ? transaction.montant : 0;
      let basePrice = 0;

      if (booking.prestations && booking.prestations.length > 0) {
        basePrice = booking.prestations.reduce((sum, p) => {
          return sum + (parseInt((p.prix || '').toString().replace(/\D/g, ''), 10) || 0);
        }, 0);
      } else if (booking.typePrestation && booking.typePrestation.prix) {
        basePrice = parseInt(booking.typePrestation.prix.toString().replace(/\D/g, ''), 10) || totalPaid;
      } else if (totalPaid > 0) {
        basePrice = Math.floor((totalPaid * 0.98) / 1.12);
      }

      const payoutAmount = basePrice;
      if (payoutAmount <= 0) {
        console.warn(`[PAYMENT SERVICE] Montant de Payout invalide (${payoutAmount}) pour la réservation ${booking.reference}`);
        return null;
      }

      const commission = Math.floor(basePrice * 0.10);
      console.log(`[PAYMENT SERVICE] Exécution du reversement pour la réservation ${booking.reference} : ${payoutAmount} XAF (Commission: ${commission} XAF sur prix de base ${basePrice} XAF)`);

      const pawapayService = require('./pawapay.service');
      const crypto = require('crypto');

      let payoutPhone = booking.salon.phone;
      if (booking.salon.paymentConfig && booking.salon.paymentConfig.payoutMtnNumber) {
        payoutPhone = booking.salon.paymentConfig.payoutMtnNumber;
      } else if (booking.salon.paymentConfig && booking.salon.paymentConfig.payoutMomoNumber) {
        payoutPhone = booking.salon.paymentConfig.payoutMomoNumber;
      }

      let detectedProvider = 'MTN_MOMO_CMR';
      try {
        const prediction = await pawapayService.predictProvider(payoutPhone);
        if (prediction && prediction.provider) {
          detectedProvider = prediction.provider;
        }
      } catch (e) {
        console.warn(`[PAYMENT SERVICE] Impossible de prédire le provider, utilisation par défaut.`);
      }

      const payoutId = crypto.randomUUID();

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
          phone: payoutPhone,
          provider: detectedProvider,
          clientReferenceId: booking.reference,
          description: `RDV ${booking.reference}`
        });

        // Vérification automatique en tâche de fond après 10 secondes (Auto-Polling)
        setTimeout(async () => {
          try {
            console.log(`[PAYMENT SERVICE] Auto-vérification du statut du Payout ${payoutId}...`);
            const statusData = await pawapayService.getPayoutStatus(payoutId);
            const status = statusData?.status || statusData?.payoutStatus;
            console.log(`[PAYMENT SERVICE] Statut automatique récupéré pour Payout ${payoutId}: ${status}`);

            const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status);
            if (isTerminal) {
              const failureReason = statusData.failureReason?.failureMessage || statusData.failureReason;
              await this.processCompletedPayout(payoutId, status, failureReason);
            }
          } catch (autoCheckError) {
            console.error(`[PAYMENT SERVICE] Échec de l'auto-vérification du Payout ${payoutId}:`, autoCheckError.message);
          }
        }, 10000);

      } catch (payoutError) {
        payoutRecord.statut = 'FAILED';
        payoutRecord.failureReason = payoutError.message || 'Erreur inconnue';
        await payoutRecord.save();
        console.error(`[PAYMENT SERVICE] Échec de l'initiation du reversement: ${payoutError.message}`);
      }

      return payoutRecord;
    } catch (error) {
      console.error('Erreur executeBookingPayout:', error);
      throw error;
    }
  }
}

module.exports = new PaymentService();
