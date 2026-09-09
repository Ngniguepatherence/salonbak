const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
    index: true,
  },
  rendezvous: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RendezVous',
    required: false,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: false,
  },
  appUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppUser',
    required: false,
  },
  authorName: {
    type: String,
    required: [true, 'Veuillez renseigner votre nom'],
    trim: true,
    maxlength: [80, 'Le nom ne peut pas dépasser 80 caractères'],
  },
  rating: {
    type: Number,
    required: [true, 'Veuillez donner une note'],
    min: [1, 'La note minimale est 1'],
    max: [5, 'La note maximale est 5'],
  },
  comment: {
    type: String,
    required: [true, 'Veuillez laisser un commentaire'],
    trim: true,
    maxlength: [1000, 'Le commentaire ne peut pas dépasser 1000 caractères'],
  },
  serviceName: {
    type: String,
    trim: true,
  },
  photos: [{
    type: String,
  }],
  isVerified: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

reviewSchema.index({ salon: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
