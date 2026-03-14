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
    default: 25000, // FCFA
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
    min: [1,   'Minimum 1%'],
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

  // ── Paramètres métier ─────────────────────
  devise: {
    type: String,
    default: 'FCFA',
    maxlength: [10, 'La devise ne peut pas dépasser 10 caractères'],
  },
  horaires: {
    type: String,
    trim: true,
    maxlength: [100, 'Les horaires ne peuvent pas dépasser 100 caractères'],
  },

  // ── Rappels & SAV ─────────────────────────
  joursRappelInactivite: {
    type: Number,
    default: 30,
    min: [7,   'Minimum 7 jours'],
    max: [365, 'Maximum 365 jours'],
  },
  joursRappelSuivi: {
    type: Number,
    default: 14,
    min: [7,  'Minimum 7 jours'],
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
  isActive: {
    type: Boolean,
    default: true,
  },

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

module.exports = mongoose.model('Salon', salonSchema);