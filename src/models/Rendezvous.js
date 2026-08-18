const mongoose = require('mongoose');

const rendezVousSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: false,
  },
  customerName: {
    type: String,
    trim: true,
  },
  customerPhone: {
    type: String,
    trim: true,
  },
  customerEmail: {
    type: String,
    trim: true,
  },
  typePrestation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypePrestation',
    required: [true, 'Veuillez fournir une prestation'],
  },
  prestations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypePrestation',
  }],
  paymentMode: {
    type: String,
    enum: ['online', 'onsite'],
    default: 'online',
  },
  commissionAmount: {
    type: Number,
    default: 0,
  },
  commissionPaid: {
    type: Boolean,
    default: false,
  },
  employe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  date: {
    type: String, // format YYYY-MM-DD — facilite les filtres par date exacte
    required: [true, 'Veuillez fournir une date'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'],
  },
  heure: {
    type: String, // format HH:mm
    required: [true, 'Veuillez fournir une heure'],
    match: [/^\d{2}:\d{2}$/, 'Format d\'heure invalide (HH:mm)'],
  },
  duree: {
    type: Number, // en minutes
    required: [true, 'Veuillez fournir une durée'],
    min: [15, 'Durée minimale : 15 minutes'],
  },
  statut: {
    type: String,
    enum: ['en_attente', 'confirme', 'termine', 'completed', 'annule', 'paid'],
    default: 'en_attente',
  },
  source: {
    type: String,
    enum: ['salon', 'en_ligne'],
    default: 'salon',
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Les notes ne peuvent pas dépasser 500 caractères'],
  },
  reference: {
    type: String,
    unique: true,
    sparse: true,
  },
}, { timestamps: true });

rendezVousSchema.index({ salon: 1, date: 1 });
rendezVousSchema.index({ salon: 1, client: 1 });

module.exports = mongoose.model('RendezVous', rendezVousSchema);