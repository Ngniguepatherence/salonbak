const Salon = require('../models/Salon');
const { getPlan } = require('../config/plans');
const { sendSubscriptionNotificationEmail } = require('./email.service');

class SubscriptionService {
  /**
   * Active ou renouvelle l'abonnement d'un salon avec calcul des quotas
   */
  async activateSubscription(salonId, planName, transactionReference, durationDays = 30) {
    try {
      const salon = await Salon.findById(salonId);
      if (!salon) {
        throw new Error(`Salon introuvable avec l'ID : ${salonId}`);
      }

      // 1. Récupérer les paramètres du plan dynamique en base de données
      const selectedPlan = await getPlan(planName);
      if (!selectedPlan) {
        throw new Error(`Plan d'abonnement introuvable : ${planName}`);
      }

      const now = new Date();
      const isCurrentlyActive = salon.isSubscriptionActive();
      const currentPlanName = salon.plan || 'basic';
      const oldPlan = await getPlan(currentPlanName);

      // Déterminer si c'est un achat de même plan, un upgrade ou un downgrade
      const isSamePlan = currentPlanName.toLowerCase() === planName.toLowerCase();
      const isUpgrade = !isSamePlan && isCurrentlyActive && salon.abonnement.statut !== 'essai' && selectedPlan.price > oldPlan.price;
      const isDowngrade = !isSamePlan && isCurrentlyActive && salon.abonnement.statut !== 'essai' && selectedPlan.price < oldPlan.price;

      if (isDowngrade) {
        // --- CAS DU DOWNGRADE ---
        // Le changement ne prend effet qu'à la fin de la période payée.
        // Le salon reste Premium jusqu'à sa date d'expiration actuelle.
        // La durée du nouveau plan s'ajoute à la date de fin.
        const originalDateFin = new Date(salon.abonnement.dateFin);

        const dateFinActuelle = new Date(salon.abonnement.dateFin);
        dateFinActuelle.setDate(dateFinActuelle.getDate() + Number(durationDays));
        salon.abonnement.dateFin = dateFinActuelle;

        // Programmer le déclassement
        salon.abonnement.downgradePlan = planName;
        // La date de transition est l'ancienne date de fin (quand le premium se termine)
        salon.abonnement.downgradeDate = originalDateFin;

        salon.abonnement.statut = 'actif';
        salon.abonnement.dernierPaiement = Date.now();
        salon.abonnement.montant = selectedPlan.price;
        salon.abonnement.renouvellementAuto = false;

        // Note : On ne met PAS à jour salon.plan ni salon.limits ici ! Ils restent Premium.
      } else if (isUpgrade) {
        // --- CAS DE L'UPGRADE ---
        // Il passe Premium immédiatement.
        // Les jours restants de l'ancien plan (Basic) sont convertis en jours équivalents sur le nouveau plan (Premium).
        const joursRestants = salon.joursAvantExpiration();
        const priceRatio = selectedPlan.price > 0 ? (oldPlan.price / selectedPlan.price) : 1;
        const joursEquivalents = Math.floor(joursRestants * priceRatio);

        salon.plan = planName;
        salon.abonnement.statut = 'actif';
        salon.abonnement.dernierPaiement = Date.now();
        salon.abonnement.montant = selectedPlan.price;
        salon.abonnement.renouvellementAuto = false;

        // Annuler tout downgrade planifié puisque l'utilisateur vient d'upgrader
        salon.abonnement.downgradePlan = null;
        salon.abonnement.downgradeDate = null;

        // Date de fin : aujourd'hui + durée de la nouvelle souscription + jours convertis
        const dateFin = new Date();
        dateFin.setDate(dateFin.getDate() + Number(durationDays) + joursEquivalents);
        salon.abonnement.dateFin = dateFin;

        // Mettre à jour les limites du salon immédiatement
        salon.limits = {
          maxCustomers: selectedPlan.maxCustomers !== undefined ? selectedPlan.maxCustomers : -1,
          maxStaff: selectedPlan.maxStaff !== undefined ? selectedPlan.maxStaff : -1,
          maxRendezvous: selectedPlan.maxRendezvous !== undefined ? selectedPlan.maxRendezvous : -1,
          maxCampaignsPerMonth: selectedPlan.maxCampaignsPerMonth !== undefined ? selectedPlan.maxCampaignsPerMonth : -1,
          exportEnabled: selectedPlan.exportEnabled || false,
          campaignsEnabled: selectedPlan.campaignsEnabled || false,
        };
      } else {
        // --- CAS DE RENOUVELLEMENT OU D'ACHAT DE PLAN EXPIRE / ESSAI ---
        salon.plan = planName;
        salon.abonnement.statut = 'actif';
        salon.abonnement.dernierPaiement = Date.now();
        salon.abonnement.montant = selectedPlan.price;
        salon.abonnement.renouvellementAuto = false;

        // Si c'est le même plan, on annule un éventuel downgrade en attente par sécurité
        if (isSamePlan) {
          salon.abonnement.downgradePlan = null;
          salon.abonnement.downgradeDate = null;
        }

        // Calcul cumulable si actif, sinon part de maintenant
        const dateFinActuelle = isCurrentlyActive && salon.abonnement.dateFin ? new Date(salon.abonnement.dateFin) : new Date();
        dateFinActuelle.setDate(dateFinActuelle.getDate() + Number(durationDays));
        salon.abonnement.dateFin = dateFinActuelle;

        // Mettre à jour les limites
        salon.limits = {
          maxCustomers: selectedPlan.maxCustomers !== undefined ? selectedPlan.maxCustomers : -1,
          maxStaff: selectedPlan.maxStaff !== undefined ? selectedPlan.maxStaff : -1,
          maxRendezvous: selectedPlan.maxRendezvous !== undefined ? selectedPlan.maxRendezvous : -1,
          maxCampaignsPerMonth: selectedPlan.maxCampaignsPerMonth !== undefined ? selectedPlan.maxCampaignsPerMonth : -1,
          exportEnabled: selectedPlan.exportEnabled || false,
          campaignsEnabled: selectedPlan.campaignsEnabled || false,
        };
      }

      await salon.save();
      console.log(`[SUBSCRIPTION SERVICE] Abonnement ${planName} activé pour le salon ${salon.name} (Ref: ${transactionReference}). Type d'opération : ${isDowngrade ? 'Downgrade' : isUpgrade ? 'Upgrade' : 'Renouvellement/Achat'}. Date fin globale : ${salon.abonnement.dateFin}`);

      // Déclencher l'envoi d'email de confirmation au salon & alerte admin
      sendSubscriptionNotificationEmail({
        to: salon.email,
        salonName: salon.name,
        plan: planName,
        amount: selectedPlan.price,
        reference: transactionReference
      }).catch(e => console.warn('Erreur notification email abonnement:', e.message));

      // 2. Check if this is the first payment of the salon and handles affiliate payment
      if (salon.affiliateCode && !salon.affiliatePaid) {
        try {
          const Affiliate = require('../models/Affiliate');
          const affiliate = await Affiliate.findOne({ affiliateCode: salon.affiliateCode });
          if (affiliate) {
            console.log(`[AFFILIATE SYSTEM] First payment completed for salon: ${salon.name} (Plan: ${planName}, Price: ${selectedPlan.price} XAF). Ref: ${transactionReference}. Triggering payout for affiliate: ${affiliate.name} (Code: ${salon.affiliateCode})`);
            
            // Commission calculation: 20% of subscription price
            const commissionAmount = Math.round(selectedPlan.price * 0.20);
            
            if (commissionAmount > 0) {
              const pawapayService = require('./pawapay.service');
              const PayoutTransaction = require('../models/PayoutTransaction');
              const crypto = require('crypto');
              
              const payoutId = crypto.randomUUID();
              
              let payoutPhone = affiliate.telephone || '';
              let payoutOperator = '';
              let payoutName = affiliate.name;
              
              if (affiliate.payoutConfig) {
                if (affiliate.payoutConfig.payoutMomoNumber) payoutPhone = affiliate.payoutConfig.payoutMomoNumber;
                if (affiliate.payoutConfig.payoutOperator) payoutOperator = affiliate.payoutConfig.payoutOperator;
                if (affiliate.payoutConfig.payoutMomoName) payoutName = affiliate.payoutConfig.payoutMomoName;
              }
              
              if (payoutPhone) {
                let detectedProvider = 'MTN_MOMO_CMR';
                if (payoutOperator === 'orange') {
                  detectedProvider = 'ORANGE_CMR';
                } else if (payoutOperator === 'mtn') {
                  detectedProvider = 'MTN_MOMO_CMR';
                } else {
                  try {
                    const prediction = await pawapayService.predictProvider(payoutPhone);
                    if (prediction && prediction.provider) {
                      detectedProvider = prediction.provider;
                    }
                  } catch (e) {
                    console.warn(`[AFFILIATE SYSTEM] Predict provider failed, using default: ${detectedProvider}`);
                  }
                }
                
                const payoutRecord = new PayoutTransaction({
                  salonId: salon._id,
                  userId: affiliate._id,
                  pawapayPayoutId: payoutId,
                  montant: commissionAmount,
                  devise: 'XAF',
                  statut: 'PENDING',
                  type: 'affiliate_commission'
                });
                await payoutRecord.save();
                
                try {
                  await pawapayService.initiatePayout({
                    payoutId,
                    amount: commissionAmount,
                    phone: payoutPhone,
                    provider: detectedProvider,
                    description: `Affiliation ${salon.name}`.slice(0, 22)
                  });
                  
                  // Mark salon affiliate as paid
                  salon.affiliatePaid = true;
                  await salon.save();
                  
                  // Update affiliate earnings cache
                  affiliate.affiliateEarnings = (affiliate.affiliateEarnings || 0) + commissionAmount;
                  await affiliate.save();
                  
                  console.log(`[AFFILIATE SYSTEM] Affiliate payout initiated successfully for amount: ${commissionAmount} XAF`);

                  // Auto-vérification automatique en tâche de fond après 10 secondes
                  const paymentService = require('./payment.service');
                  setTimeout(async () => {
                    try {
                      console.log(`[AFFILIATE SYSTEM] Auto-vérification du Payout ${payoutId}...`);
                      const statusData = await pawapayService.getPayoutStatus(payoutId);
                      const status = statusData?.status || statusData?.payoutStatus;
                      if (status && status !== 'PENDING' && status !== 'SUBMITTED') {
                        const failureReason = statusData.failureReason?.failureMessage || statusData.failureReason;
                        await paymentService.processCompletedPayout(payoutId, status, failureReason);
                      }
                    } catch (autoCheckError) {
                      console.error(`[AFFILIATE SYSTEM] Échec de l'auto-vérification du Payout ${payoutId}:`, autoCheckError.message);
                    }
                  }, 10000);
                } catch (payoutError) {
                  payoutRecord.statut = 'FAILED';
                  payoutRecord.failureReason = payoutError.message || 'Erreur lors de l\'initiation du décaissement';
                  await payoutRecord.save();
                  console.error(`[AFFILIATE SYSTEM] Affiliate payout initiation failed: ${payoutError.message}`);
                }
              } else {
                console.warn(`[AFFILIATE SYSTEM] Affiliate has no payout phone number configured. Payout skipped.`);
              }
            }
          } else {
            console.warn(`[AFFILIATE SYSTEM] Salon has affiliateCode ${salon.affiliateCode} but no matching affiliate user was found.`);
          }
        } catch (affiliateError) {
          console.error('[AFFILIATE SYSTEM] Error processing affiliate payout:', affiliateError);
        }
      }

      return salon;
    } catch (error) {
      console.error('Erreur lors de l\'activation de l\'abonnement:', error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();
