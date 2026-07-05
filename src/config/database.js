const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Validate and clean MongoDB URI
    let mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // Remove any invalid characters from database name in URI
    // MongoDB database names cannot contain: / \ . " $
    // Replace invalid characters with hyphens
    const uriParts = mongoUri.split('/');
    if (uriParts.length > 3) {
      // There's a database name specified
      const dbName = uriParts[uriParts.length - 1].split('?')[0]; // Remove query params
      const cleanDbName = dbName.replace(/[\/\\\.\"$]/g, '-');
      uriParts[uriParts.length - 1] = cleanDbName + (mongoUri.includes('?') ? mongoUri.split('?')[1] : '');
      mongoUri = uriParts.join('/');
    }

    const conn = await mongoose.connect(mongoUri, {
      // These options are recommended for Mongoose 6+
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);

    // Seeding et synchronisation des plans par défaut
    try {
      const Plan = require('../models/Plan');
      const defaultPlans = [
        {
          key: 'basic',
          name: 'Basic',
          price: 5000,
          devise: 'FCFA',
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
        {
          key: 'pro',
          name: 'Pro',
          price: 20000,
          devise: 'FCFA',
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
          scheduledCampaignsEnabled: true,
          customerSegmentationEnabled: true,
          profitEstimationEnabled: true,
          prioritySupport: false,
          description: 'Pour les salons en croissance',
          descriptionEn: 'For growing salons',
          trialDurationDays: 14,
        },
        {
          key: 'premium',
          name: 'Premium',
          price: 30000,
          devise: 'FCFA',
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
          scheduledCampaignsEnabled: true,
          customerSegmentationEnabled: true,
          profitEstimationEnabled: true,
          prioritySupport: true,
          description: 'Pour les instituts structurés',
          descriptionEn: 'For structured beauty institutes',
          trialDurationDays: 14,
        }
      ];
      for (const defaultPlan of defaultPlans) {
        await Plan.findOneAndUpdate(
          { key: defaultPlan.key },
          { $set: defaultPlan },
          { upsert: true, new: true }
        );
      }
      console.log('🌱 Plans successfully seeded and synced in Database!');
    } catch (seedError) {
      console.error('❌ Error seeding/syncing default plans:', seedError.message);
    }

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

