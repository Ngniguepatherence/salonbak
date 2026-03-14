const mongoose = require('mongoose');

const produitSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  nom: {
    type: String,
    required: [true, 'Veuillez fournir un nom de produit'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
  },
  categorie: {
    type: String,
    trim: true,
    maxlength: [100, 'La catégorie ne peut pas dépasser 100 caractères'],
  },
  prixAchat: {
    type: Number,
    min: [0, 'Le prix d\'achat ne peut pas être négatif'],
    default: 0,
  },
  prixVente: {
    type: Number,
    required: [true, 'Veuillez fournir un prix de vente'],
    min: [0, 'Le prix de vente ne peut pas être négatif'],
  },
  stock: {
    type: Number,
    default: 0,
    min: [0, 'Le stock ne peut pas être négatif'],
  },
  stockMinimum: {
    type: Number,
    default: 0,
  },
  actif: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

produitSchema.index({ salon: 1, categorie: 1 });

module.exports = mongoose.model('Produit', produitSchema);