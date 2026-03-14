const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
        maxlength: [50, 'Name can not be more than 50 characters']
    },
    telephone: {
        type: String,
        required: [true, 'Please provide a telephone number'],
        trim: true,
        maxlength: [20, 'Telephone number can not be more than 20 characters']
    },
    dateAnniversaire: {
        type: Date,
        required: [true, 'Please provide a date of birth']
    },
    status: {
        type: String,
        enum: ['nouvelle', 'reguliere', 'inactif'],
        default: 'nouvelle'
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [500, 'Notes can not be more than 500 characters']
    },
     // ── Fidélité ──────────────────────────────
  pointsFidelite: {
    type: Number,
    default: 0,
    min: [0, 'Les points ne peuvent pas être négatifs'],
  },
  statut: {
    type: String,
    enum: ['nouveau','nouvelle', 'regulier', 'vip'],
    default: 'nouveau',
  },
 
  // ── Statistiques visites ───────────────────
  nombreVisites: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalDepense: {
    type: Number,
    default: 0,
    min: 0,
  },
  derniereVisite: {
    type: Date,
    default: null,
  },

  // ── Parrainage ────────────────────────────
  parrainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
  },
  // Nombre de filleuls que ce client a amenés
  nombreFilleuls: {
    type: Number,
    default: 0,
    min: 0,
  },
 
  // ── Statut ────────────────────────────────
  actif: {
    type: Boolean,
    default: true,
  },
    salon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Salon',
        required: [true, 'Please provide a salon']
    }
}, { timestamps: true });

clientSchema.index({ salon: 1, nom: 1 });
clientSchema.index({ salon: 1, statut: 1 });
clientSchema.index({ salon: 1, derniereVisite: 1 });
clientSchema.index({ salon: 1, parrainId: 1 }); // retrouver les filleuls d'un parrain


clientSchema.methods.ajouterPoints = function (points, configFidelite) {
  this.pointsFidelite += points;
  this.nombreVisites  += points;
 
  // Mise à jour automatique du statut
  if (this.pointsFidelite >= configFidelite.visitesVIP) {
    this.statut = 'vip';
  } else if (this.pointsFidelite >= configFidelite.visitesRequises) {
    this.statut = 'regulier';
  } else {
    this.statut = 'nouveau';
  }
};
 
/**
 * Enregistre une visite : incrémente compteurs + met à jour derniereVisite.
 * @param {number} montant - montant dépensé lors de la visite
 * @param {object} configFidelite - { visitesRequises, visitesVIP }
 */
clientSchema.methods.enregistrerVisite = function (montant, configFidelite) {
  this.nombreVisites += 1;
  this.totalDepense  += montant;
  this.derniereVisite = new Date();
  this.ajouterPoints(1, configFidelite); // 1 point par visite
};
 
/**
 * Retourne le nombre de réductions déjà gagnées.
 * @param {number} visitesRequises
 */
clientSchema.methods.reductionsGagnees = function (visitesRequises) {
  return Math.floor(this.pointsFidelite / visitesRequises);
};
 
/**
 * Retourne la progression vers la prochaine réduction (0–100).
 * @param {number} visitesRequises
 */
clientSchema.methods.progressionFidelite = function (visitesRequises) {
  const reste = this.pointsFidelite % visitesRequises;
  return Math.min(Math.round((reste / visitesRequises) * 100), 100);
};
 
module.exports = mongoose.model('Client', clientSchema);