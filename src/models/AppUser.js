const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const appUserSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Veuillez fournir un nom complet'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
  },
  email: {
    type: String,
    required: [true, 'Veuillez fournir un email'],
    trim: true,
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Veuillez fournir un email valide'],
  },
  password: {
    type: String,
    required: [true, 'Veuillez fournir un mot de passe'],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false, // Ne pas retourner dans les requêtes par défaut
  },
  telephone: {
    type: String,
    trim: true,
    maxlength: [20, 'Le numéro de téléphone ne peut pas dépasser 20 caractères'],
  },
  role: {
    type: String,
    default: 'app_user',
  },
  avatarUrl: {
    type: String,
  },
  actif: {
    type: Boolean,
    default: true,
  },
  favoris: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon'
  }],
  visits: [{
    salonSlug: String,
    salonNom: String,
    visitedAt: Date
  }],
  derniereConnexion: {
    type: Date,
  },
}, { timestamps: true });

// Hash du mot de passe avant sauvegarde
appUserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Génération du token JWT
appUserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role }, 
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Comparaison du mot de passe
appUserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('AppUser', appUserSchema);
