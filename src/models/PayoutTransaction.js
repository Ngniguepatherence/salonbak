const mongoose = require('mongoose');

const payoutTransactionSchema = new mongoose.Schema({
  salonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: [true, 'Une transaction doit être liée à un salon'],
  },
  rendezvousId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rendezvous',
  },
  pawapayPayoutId: {
    type: String,
    required: true,
    unique: true,
  },
  montant: {
    type: Number,
    required: [true, 'Le montant est requis'],
  },
  devise: {
    type: String,
    default: 'XAF',
  },
  statut: {
    type: String,
    enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'REJECTED', 'SUBMITTED'],
    default: 'PENDING',
  },
  failureReason: {
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('PayoutTransaction', payoutTransactionSchema);
