const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  key: {
    type: String,
    required: [true, 'La clé du plan est requise'],
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Le nom du plan est requis'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Le prix du plan est requis'],
    min: [0, 'Le prix ne peut pas être négatif']
  },
  devise: {
    type: String,
    default: 'FCFA',
    trim: true
  },
  maxCustomers: {
    type: Number,
    default: -1 // -1 signifie illimité
  },
  maxStaff: {
    type: Number,
    default: -1
  },
  maxRendezvous: {
    type: Number,
    default: -1
  },
  maxCampaignsPerMonth: {
    type: Number,
    default: -1
  },
  campaignsEnabled: {
    type: Boolean,
    default: false
  },
  exportEnabled: {
    type: Boolean,
    default: false
  },
  analyticsLevel: {
    type: String,
    enum: ['basic', 'detailed', 'advanced'],
    default: 'basic'
  },
  automationEnabled: {
    type: Boolean,
    default: false
  },
  multiBranchEnabled: {
    type: Boolean,
    default: false
  },
  loyaltyRulesEnabled: {
    type: Boolean,
    default: false
  },
  birthdayBonusEnabled: {
    type: Boolean,
    default: false
  },
  stockHistoryEnabled: {
    type: Boolean,
    default: false
  },
  scheduledCampaignsEnabled: {
    type: Boolean,
    default: false
  },
  customerSegmentationEnabled: {
    type: Boolean,
    default: false
  },
  profitEstimationEnabled: {
    type: Boolean,
    default: false
  },
  prioritySupport: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    default: ''
  },
  descriptionEn: {
    type: String,
    default: ''
  },
  trialDurationDays: {
    type: Number,
    default: 14 // 14 jours d'essai par défaut
  }
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
