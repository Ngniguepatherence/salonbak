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
    required: [true, 'Veuillez fournir un client'],
  },
  typePrestation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypePrestation',
    required: [true, 'Veuillez fournir une prestation'],
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
    enum: ['en_attente', 'confirme', 'termine', 'annule'],
    default: 'en_attente',
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Les notes ne peuvent pas dépasser 500 caractères'],
  },
}, { timestamps: true });

rendezVousSchema.index({ salon: 1, date: 1 });
rendezVousSchema.index({ salon: 1, client: 1 });

module.exports = mongoose.model('RendezVous', rendezVousSchema);