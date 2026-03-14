const mongoose = require('mongoose');

const typePrestationSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  nom: {
    type: String,
    required: [true, 'Veuillez fournir un nom de catégorie'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
  },
  prix: {
    type: String,
    required: [true, 'Veuillez fournir un prix'],
    trim: true,
    maxlength: [100, 'Le prix ne peut pas dépasser 100 caractères'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
  },
  couleur: {
    type: String,
    default: '#6366f1', // couleur par défaut
  },
  categorie: {
    type: String,
    default: 'coiffure',
  },
  actif: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

typePrestationSchema.index({ salon: 1 });

module.exports = mongoose.model('TypePrestation', typePrestationSchema);