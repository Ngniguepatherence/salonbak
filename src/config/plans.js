const Plan = require('../models/Plan');

// Configuration statique de secours en cas d'erreur de base de données
const PLANS = {
  basic: {
    key: 'basic',
    name: 'Basic',
    price: 5000,
    maxCustomers: 300,
    maxStaff: 2,
    maxRendezvous: 100,
    maxCampaignsPerMonth: 0,
    campaignsEnabled: false,
    exportEnabled: false,
    analyticsLevel: 'basic',
    automationEnabled: false,
    multiBranchEnabled: false,
    loyaltyRulesEnabled: false,
    birthdayBonusEnabled: false,
    stockHistoryEnabled: false,
    scheduledCampaignsEnabled: false,
    customerSegmentationEnabled: false,
    profitEstimationEnabled: false,
    prioritySupport: false,
    description: 'Pour les petits salons (1-3 employés)',
    descriptionEn: 'For small salons (1-3 staff)',
    trialDurationDays: 14,
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    price: 20000,
    maxCustomers: -1,
    maxStaff: 6,
    maxRendezvous: -1,
    maxCampaignsPerMonth: 5,
    campaignsEnabled: true,
    exportEnabled: true,
    analyticsLevel: 'detailed',
    automationEnabled: false,
    multiBranchEnabled: false,
    loyaltyRulesEnabled: true,
    birthdayBonusEnabled: true,
    stockHistoryEnabled: true,
    exportEnabled: true,
    scheduledCampaignsEnabled: true,
    customerSegmentationEnabled: true,
    profitEstimationEnabled: true,
    prioritySupport: false,
    description: 'Pour les salons en croissance',
    descriptionEn: 'For growing salons',
    trialDurationDays: 14,
  },
  premium: {
    key: 'premium',
    name: 'Premium',
    price: 30000,
    maxCustomers: -1,
    maxStaff: -1,
    maxRendezvous: -1,
    maxCampaignsPerMonth: -1,
    campaignsEnabled: true,
    exportEnabled: true,
    analyticsLevel: 'advanced',
    automationEnabled: true,
    multiBranchEnabled: true,
    loyaltyRulesEnabled: true,
    birthdayBonusEnabled: true,
    stockHistoryEnabled: true,
    exportEnabled: true,
    scheduledCampaignsEnabled: true,
    customerSegmentationEnabled: true,
    profitEstimationEnabled: true,
    prioritySupport: true,
    description: 'Pour les instituts structurés',
    descriptionEn: 'For structured beauty institutes',
    trialDurationDays: 14,
  },
};

/**
 * Récupère un plan depuis la base de données.
 * @param {string} planName Clé du plan (basic, pro, premium)
 * @returns {Promise<Object>} Le plan trouvé en base ou le plan statique de secours
 */
const getPlan = async (planName) => {
  try {
    const key = String(planName || 'basic').toLowerCase();
    const plan = await Plan.findOne({ key });
    if (plan) {
      return plan.toObject();
    }
  } catch (err) {
    console.error(`⚠️ Impossible de récupérer le plan '${planName}' en base de données, utilisation du fallback.`, err.message);
  }
  return PLANS[planName] || PLANS.basic;
};

module.exports = {
  PLANS,
  getPlan,
};
