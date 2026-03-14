const mongoose = require('mongoose');

const prestationSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  // Référence à la cliente
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Veuillez fournir une cliente'],
  },
  // Référence au type de prestation du catalogue
  typePrestationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypePrestation',
    required: [true, 'Veuillez fournir un type de prestation'],
  },
  // Employé(e) qui a effectué la prestation
  employe: {
    type: String,
    trim: true,
    maxlength: [100, "Le nom de l'employé ne peut pas dépasser 100 caractères"],
  },
  // Montant facturé (peut différer du prix catalogue si remise)
  montant: {
    type: Number,
    required: [true, 'Veuillez fournir un montant'],
    min: [0, 'Le montant ne peut pas être négatif'],
  },
  // Date de la visite au format YYYY-MM-DD
  date: {
    type: String,
    required: [true, 'Veuillez fournir une date'],
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'],
  },
  // Notes libres
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Les notes ne peuvent pas dépasser 500 caractères'],
  },
}, { timestamps: true });

prestationSchema.index({ salon: 1, clientId: 1 });
prestationSchema.index({ salon: 1, date: 1 });

module.exports = mongoose.model('Prestation', prestationSchema);