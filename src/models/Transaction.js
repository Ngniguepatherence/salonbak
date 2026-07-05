const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: [true, 'Une transaction doit être liée à un salon'],
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Une transaction doit être liée à un utilisateur'],
  },
  montant: {
    type: Number,
    required: [true, 'Le montant est requis'],
  },
  devise: {
    type: String,
    default: 'FCFA',
  },
  reference: {
    type: String,
    required: [true, 'La référence interne est requise'],
    unique: true,
  },
  pawapayDepositId: {
    type: String,
  },
  statut: {
    type: String,
    enum: ["PENDING",
      "SUCCESSFUL",
      "FAILED",
      "CANCELLED",],
    default: 'PENDING',
  },
  type: {
    type: String,
    enum: ['abonnement', 'reservation'],
    default: 'abonnement',
  },
  plan: {
    type: String,
    enum: ['basic', 'pro', 'premium', 'reservation'],
    default: 'basic',
  },
  dureeJours: {
    type: Number,
    default: 30,
  },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
