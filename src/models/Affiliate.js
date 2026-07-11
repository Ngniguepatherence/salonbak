const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const affiliateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false,
  },
  role: {
    type: String,
    default: 'affiliate',
  },
  telephone: {
    type: String,
    trim: true,
    maxlength: [20, 'Le numéro de téléphone ne peut pas dépasser 20 caractères'],
  },
  ville: {
    type: String,
    trim: true,
    default: '',
  },
  pays: {
    type: String,
    trim: true,
    default: 'CM',
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  avatarUrl: {
    type: String,
  },
  affiliateCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  affiliateEarnings: {
    type: Number,
    default: 0,
  },
  payoutConfig: {
    payoutMomoNumber: {
      type: String,
      trim: true,
      default: '',
    },
    payoutOperator: {
      type: String,
      enum: ['mtn', 'orange', ''],
      default: '',
    },
    payoutMomoName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  actif: {
    type: Boolean,
    default: true,
  },
  derniereConnexion: {
    type: Date,
  },
}, { timestamps: true });

// Hash password before saving
affiliateSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  if (!this.password) return; // Google OAuth might not have password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Generate JWT token
affiliateSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '1d',
  });
};

// Match password
affiliateSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Affiliate', affiliateSchema);
