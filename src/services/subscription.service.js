const Salon = require('../models/Salon');
const { getPlan } = require('../config/plans');

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

      return salon;
    } catch (error) {
      console.error('Erreur lors de l\'activation de l\'abonnement:', error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();
