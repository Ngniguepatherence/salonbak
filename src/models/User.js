const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Veuillez fournir un nom'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères'],
  },
  email: {
    type: String,
    required: [true, 'Veuillez fournir un email'],
    trim: true,
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Veuillez fournir un email valide'],
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  password: {
    type: String,
    required: [
      function() { return !this.googleId; },
      'Veuillez fournir un mot de passe'
    ],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
    select: false, // Never returned in queries by default
  },
  role: {
    type: String,
    enum: ['owner', 'co_owner', 'staff', 'admin', 'affiliate'],
    default: 'staff',
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
  // Lien vers le salon — obligatoire sauf pour les admins globaux
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
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
  avatarUrl: {
    type: String,
  },
  actif: {
    type: Boolean,
    default: true,
  },
  derniereConnexion: {
    type: Date,
  },
  availability: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
}, { timestamps: true });

// Hash du mot de passe avant sauvegarde
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Génération du token JWT
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '1d',
  });
};

// Comparaison du mot de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);