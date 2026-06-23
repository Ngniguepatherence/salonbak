// Configuration des plans d'abonnement et leurs limites
const PLANS = {
  basic: {
    name: 'basic',
    price: 5000,
    maxCustomers: 300,
    maxStaff: 2,
    maxRendezvous: 100,
    maxCampaignsPerMonth: 0,
    campaignsEnabled: false,
    exportEnabled: false,
    analyticsLevel: 'basic',
  },
  pro: {
    name: 'pro',
    price: 20000,
    maxCustomers: -1, // illimité
    maxStaff: 6,
    maxRendezvous: -1,
    maxCampaignsPerMonth: 5,
    campaignsEnabled: true,
    exportEnabled: true,
    analyticsLevel: 'detailed',
  },
  premium: {
    name: 'premium',
    price: 30000,
    maxCustomers: -1,
    maxStaff: -1,
    maxRendezvous: -1,
    maxCampaignsPerMonth: -1,
    campaignsEnabled: true,
    exportEnabled: true,
    analyticsLevel: 'advanced',
  },
};

const getPlan = (planName) => {
  return PLANS[planName] || PLANS.basic;
};

module.exports = {
  PLANS,
  getPlan,
};
