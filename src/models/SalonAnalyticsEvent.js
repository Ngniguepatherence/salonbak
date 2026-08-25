const mongoose = require('mongoose');

const salonAnalyticsEventSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
    index: true,
  },
  eventType: {
    type: String,
    enum: ['view_page', 'booking_started', 'booking_completed'],
    required: true,
  },
  customerName: {
    type: String,
    trim: true,
    default: 'Visiteur Anonyme',
  },
  customerPhone: {
    type: String,
    trim: true,
    default: '',
  },
  customerEmail: {
    type: String,
    trim: true,
    default: '',
  },
  selectedServices: [{
    type: String,
  }],
  appUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppUser',
    default: null,
  },
  userAgent: {
    type: String,
    default: '',
  },
  ip: {
    type: String,
    default: '',
  }
}, { timestamps: true });

module.exports = mongoose.model('SalonAnalyticsEvent', salonAnalyticsEventSchema);
