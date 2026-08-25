const mongoose = require('mongoose');

// ─────────────────────────────────────────────
// SOUS-SCHÉMA ABONNEMENT
// ─────────────────────────────────────────────
const abonnementSchema = new mongoose.Schema({
  statut: {
    type: String,
    enum: ['actif', 'expire', 'suspendu', 'essai'],
    default: 'essai',
  },
  montant: {
    type: Number,
    default: 25000,
  },
  dureeJours: {
    type: Number,
    default: 30,
  },
  dateDebut: {
    type: Date,
    default: Date.now,
  },
  dateFin: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
  dernierPaiement: {
    type: Date,
    default: Date.now,
  },
  renouvellementAuto: {
    type: Boolean,
    default: false,
  },
  downgradePlan: {
    type: String,
    default: null,
  },
  downgradeDate: {
    type: Date,
    default: null,
  },
}, { _id: false });


const configFideliteSchema = new mongoose.Schema({
  visitesRequises: {
    type: Number,
    default: 10,
    min: [1, 'Minimum 1 visite requise'],
    max: [100, 'Maximum 100 visites'],
  },
  reductionPourcentage: {
    type: Number,
    default: 10,
    min: [1, 'Minimum 1%'],
    max: [100, 'Maximum 100%'],
  },
  visitesVIP: {
    type: Number,
    default: 20,
    min: [1, 'Minimum 1 visite pour le statut VIP'],
    max: [200, 'Maximum 200 visites'],
  },
}, { _id: false });
// ─────────────────────────────────────────────
// SCHÉMA PRINCIPAL SALON
// ─────────────────────────────────────────────
const salonSchema = new mongoose.Schema({

  // ── Identité ──────────────────────────────
  name: {
    type: String,
    required: [true, 'Veuillez fournir un nom de salon'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
  },
  oldSlugs: [{
    type: String,
    index: true,
  }],
  slogan: {
    type: String,
    trim: true,
    maxlength: [200, 'Le slogan ne peut pas dépasser 200 caractères'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
  },
  logoUrl: {
    type: String,
    trim: true,
  },
  bannerUrl: {
    type: String,
    trim: true,
  },
  galleryUrls: {
    type: [String],
    default: []
  },
  typeEtablissement: {
    type: String,
    enum: ['salon_coiffure', 'spa', 'institut_beaute', 'barbershop', 'onglerie', 'mixte', 'autre'],
    default: 'salon_coiffure',
  },

  // ── Contact ───────────────────────────────
  phone: {
    type: String,
    required: [true, 'Veuillez fournir un numéro de téléphone'],
    trim: true,
    maxlength: [20, 'Le numéro ne peut pas dépasser 20 caractères'],
  },
  email: {
    type: String,
    required: [true, 'Veuillez fournir un email'],
    trim: true,
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Veuillez fournir un email valide'],
  },

  // ── Localisation ──────────────────────────
  address: {
    type: String,
    required: [true, 'Veuillez fournir une adresse'],
    trim: true,
    maxlength: [200, "L'adresse ne peut pas dépasser 200 caractères"],
  },
  ville: {
    type: String,
    trim: true,
    maxlength: [100, 'La ville ne peut pas dépasser 100 caractères'],
  },
  pays: {
    type: String,
    trim: true,
    default: 'CM',
    maxlength: [10, 'Le code pays ne peut pas dépasser 10 caractères'],
  },
  location: {
    lat: { type: Number },
    lng: { type: Number }
  },

  // ── Paramètres métier ─────────────────────
  devise: {
    type: String,
    default: 'FCFA',
    maxlength: [10, 'La devise ne peut pas dépasser 10 caractères'],
  },
  horaires: {
    type: String,
    trim: true,
    maxlength: [1000, 'Les horaires ne peuvent pas dépasser 1000 caractères'],
  },
  availability: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // ── Rappels & SAV ─────────────────────────
  joursRappelInactivite: {
    type: Number,
    default: 30,
    min: [7, 'Minimum 7 jours'],
    max: [365, 'Maximum 365 jours'],
  },
  joursRappelSuivi: {
    type: Number,
    default: 14,
    min: [7, 'Minimum 7 jours'],
    max: [90, 'Maximum 90 jours'],
  },

  // ── Fidélité ──────────────────────────────
  configFidelite: {
    type: configFideliteSchema,
    default: () => ({}),
  },

  // ── Propriétaire & accès ──────────────────
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Veuillez fournir un propriétaire'],
  },
  abonnement: {
    type: abonnementSchema,
    default: () => ({}),
  },
  plan: {
    type: String,
    enum: ['basic', 'pro', 'premium'],
    default: 'basic',
  },
  affiliateCode: {
    type: String,
    default: null,
  },
  affiliatePaid: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  hidden: {
    type: Boolean,
    default: false,
  },
  limits: {
    maxCustomers: { type: Number, default: 300 },
    maxStaff: { type: Number, default: 2 },
    maxRendezvous: { type: Number, default: 100 },
    maxCampaignsPerMonth: { type: Number, default: 0 },
    exportEnabled: { type: Boolean, default: false },
    campaignsEnabled: { type: Boolean, default: false },
  },
  paymentConfig: {
    payoutMomoNumber: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: function (v) {
          if (!v) return true;
          const clean = v.replace(/\D/g, '');
          // Accept 9-digit local Cameroonian phone numbers or 12-digit international format (with 237)
          return clean.length === 9 || (clean.length === 12 && clean.startsWith('237'));
        },
        message: props => `${props.value} n'est pas un numéro Mobile Money valide !`
      }
    },
    payoutOperator: {
      type: String,
      enum: ['mtn', 'orange', ''],
      default: ''
    },
    payoutMomoName: {
      type: String,
      trim: true,
      default: ''
    },
    payoutMtnNumber: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: function (v) {
          if (!v) return true;
          const clean = v.replace(/\D/g, '');
          return clean.length === 9 || (clean.length === 12 && clean.startsWith('237'));
        },
        message: props => `${props.value} n'est pas un numéro MTN valide !`
      }
    },
    payoutMtnName: {
      type: String,
      trim: true,
      default: ''
    },
    payoutOrangeNumber: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: function (v) {
          if (!v) return true;
          const clean = v.replace(/\D/g, '');
          return clean.length === 9 || (clean.length === 12 && clean.startsWith('237'));
        },
        message: props => `${props.value} n'est pas un numéro Orange valide !`
      }
    },
    payoutOrangeName: {
      type: String,
      trim: true,
      default: ''
    },
    payoutWaveNumber: {
      type: String,
      trim: true,
      default: ''
    },
    payoutWaveName: {
      type: String,
      trim: true,
      default: ''
    }
  }

}, { timestamps: true });

// ─────────────────────────────────────────────
// MÉTHODES
// ─────────────────────────────────────────────

/** Vérifie si l'abonnement est toujours valide */
salonSchema.methods.isSubscriptionActive = function () {
  if (!this.isActive) return false;
  if (this.abonnement.statut === 'suspendu') return false;
  return new Date() <= new Date(this.abonnement.dateFin);
};

/** Retourne le nombre de jours restants avant expiration */
salonSchema.methods.joursAvantExpiration = function () {
  const fin = new Date(this.abonnement.dateFin);
  const diff = fin.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

/** Vérifie si une transition d'abonnement (downgrade planifié) est due et l'applique */
salonSchema.methods.checkSubscriptionTransition = async function () {
  const now = new Date();
  if (
    this.abonnement &&
    this.abonnement.downgradePlan &&
    this.abonnement.downgradeDate &&
    now > new Date(this.abonnement.downgradeDate)
  ) {
    const nextPlanName = this.abonnement.downgradePlan;
    const { getPlan } = require('../config/plans');
    const selectedPlan = await getPlan(nextPlanName);

    this.plan = nextPlanName;
    this.abonnement.downgradePlan = null;
    this.abonnement.downgradeDate = null;
    this.limits = {
      maxCustomers: selectedPlan.maxCustomers !== undefined ? selectedPlan.maxCustomers : -1,
      maxStaff: selectedPlan.maxStaff !== undefined ? selectedPlan.maxStaff : -1,
      maxRendezvous: selectedPlan.maxRendezvous !== undefined ? selectedPlan.maxRendezvous : -1,
      maxCampaignsPerMonth: selectedPlan.maxCampaignsPerMonth !== undefined ? selectedPlan.maxCampaignsPerMonth : -1,
      exportEnabled: selectedPlan.exportEnabled || false,
      campaignsEnabled: selectedPlan.campaignsEnabled || false,
    };

    await this.save();
    return true; // Transition effectuée
  }
  return false;
};

function createSlugString(text) {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

salonSchema.pre('save', async function () {
  if (!this.slug || this.isModified('name') || this.isModified('ville')) {
    const baseStr = [this.name, this.ville || ''].filter(Boolean).join(' ');
    let candidateSlug = createSlugString(baseStr);
    if (!candidateSlug) {
      candidateSlug = 'salon-' + Math.random().toString(36).substring(2, 7);
    }

    if (this.slug && this.slug !== candidateSlug) {
      if (!this.oldSlugs) this.oldSlugs = [];
      if (!this.oldSlugs.includes(this.slug)) {
        this.oldSlugs.push(this.slug);
      }
    }

    const SalonModel = this.constructor;
    let uniqueSlug = candidateSlug;
    let counter = 2;
    while (await SalonModel.exists({ _id: { $ne: this._id }, slug: uniqueSlug })) {
      uniqueSlug = `${candidateSlug}-${counter}`;
      counter++;
    }
    this.slug = uniqueSlug;
  }
});

module.exports = mongoose.model('Salon', salonSchema);