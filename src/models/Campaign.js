const mongoose = require('mongoose');

// ─────────────────────────────────────────────
// Modèle Groupe de Contacts
// ─────────────────────────────────────────────
const contactGroupSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  nom: {
    type: String,
    required: [true, 'Le nom du groupe est requis'],
    trim: true,
    maxlength: [100, 'Nom trop long'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description trop longue'],
  },
  couleur: {
    type: String,
    default: '#8b5cf6', // violet par défaut
  },
  // Liste des IDs de clients dans ce groupe
  clients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
  }],
  // Filtres automatiques (pour groupes dynamiques)
  filtres: {
    statut: { type: String, enum: ['all', 'nouvelle', 'reguliere', 'vip', 'inactif'], default: 'all' },
    inactifDepuis: { type: Number, default: null }, // jours
  },
  type: {
    type: String,
    enum: ['manuel', 'automatique'],
    default: 'manuel',
  },
}, { timestamps: true });

contactGroupSchema.index({ salon: 1 });

// ─────────────────────────────────────────────
// Modèle Campagne
// ─────────────────────────────────────────────
const campaignSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  nom: {
    type: String,
    required: [true, 'Le nom de la campagne est requis'],
    trim: true,
    maxlength: [150, 'Nom trop long'],
  },
  message: {
    type: String,
    required: [true, 'Le message est requis'],
    maxlength: [2000, 'Message trop long'],
  },
  groupes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContactGroup',
  }],
  // Groupes prédéfinis (all, vip, inactives, nouvelles)
  groupesPredefinies: [{
    type: String,
    enum: ['all', 'vip', 'inactives', 'nouvelles'],
  }],
  statut: {
    type: String,
    enum: ['brouillon', 'en_cours', 'terminee', 'annulee'],
    default: 'brouillon',
  },
  // Statistiques d'envoi
  stats: {
    total: { type: Number, default: 0 },
    envoyes: { type: Number, default: 0 },
    echecs: { type: Number, default: 0 },
    dateDebut: { type: Date, default: null },
    dateFin: { type: Date, default: null },
  },
  // Config anti-ban
  delaiEntreMessages: {
    type: Number,
    default: 30, // secondes entre chaque message
    min: 10,
    max: 300,
  },
  creeePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

campaignSchema.index({ salon: 1, statut: 1 });
campaignSchema.index({ salon: 1, createdAt: -1 });

const ContactGroup = mongoose.model('ContactGroup', contactGroupSchema);
const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = { Campaign, ContactGroup };
