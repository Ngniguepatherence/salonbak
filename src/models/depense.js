const mongoose = require('mongoose');

const depenseSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  description: {
    type: String,
    required: [true, 'Veuillez fournir un libellé'],
    trim: true,
    maxlength: [200, 'Le libellé ne peut pas dépasser 200 caractères'],
  },
  categorie: {
    type: String,
    default: 'autre',
  },
  montant: {
    type: Number,
    required: [true, 'Veuillez fournir un montant'],
    min: [0, 'Le montant ne peut pas être négatif'],
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  justificatif: {
    type: String, // URL vers le fichier uploadé
  },
  creePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

depenseSchema.index({ salon: 1, date: -1 });
depenseSchema.index({ salon: 1, categorie: 1 });

module.exports = mongoose.model('Depense', depenseSchema);