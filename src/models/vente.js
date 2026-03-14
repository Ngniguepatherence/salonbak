const mongoose = require('mongoose');

const venteItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['produit', 'prestation'],
    required: true,
  },
  // referenceId pointe vers Produit ou Prestation selon type
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  nom: {
    type: String,
    required: true,
    trim: true,
    // snapshot du nom au moment de la vente — ne pas populate
  },
  quantite: {
    type: Number,
    required: true,
    default: 1,
    min: [1, 'La quantité doit être au moins 1'],
  },
  prixUnitaire: {
    type: Number,
    required: true,
    min: [0, 'Le prix ne peut pas être négatif'],
  },
  montant: {
    type: Number,
    required: true,
    min: [0, 'Le montant ne peut pas être négatif'],
    // montant = prixUnitaire * quantite (calculé backend)
  },
}, { _id: false });

const venteSchema = new mongoose.Schema({
  salon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salon',
    required: true,
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
  },
  employe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  items: {
    type: [venteItemSchema],
    required: true,
    validate: {
      validator: (v) => v.length > 0,
      message: 'Une vente doit contenir au moins un article',
    },
  },
  remise:    { type: Number, default: 0 },    // montant FCFA
  remisePct: { type: Number, default: 0 },    // pourcentage
  totalMontant: {
    type: Number,
    required: true,
    min: [0, 'Le total ne peut pas être négatif'],
  },
  modePaiement: {
    type: String,
    enum: ['especes', 'mobile_money', 'carte', 'mixte'],
    default: 'especes',
  },
  statut: {
    type: String,
    enum: ['en_attente', 'payee', 'annulee'],
    default: 'payee',
  },
  notes: { type: String, maxlength: 500 },
  date: {
    type: String, // YYYY-MM-DD — cohérent avec tous les autres modèles
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'],
  },
  // Permet de recalculer proprement en cas de suppression
  pointsAttribues: {
    type: Number,
    default: 0,
  },
  fideliteAppliquee: {
    type: Boolean,
    default: false, // true si une réduction fidélité a été utilisée sur cette vente
  },
}, { timestamps: true });

venteSchema.index({ salon: 1, date: -1 });
venteSchema.index({ salon: 1, clientId: 1 });

venteSchema.post('save', async function (doc) {
  // Pas de client associé → rien à faire
  if (!doc.clientId) return;
  // Vente annulée → pas de points
  if (doc.statut === 'annulee') return;
 
  try {
    const Client = mongoose.model('Client');
    const Salon  = mongoose.model('Salon');
 
    const [client, salon] = await Promise.all([
      Client.findById(doc.clientId),
      Salon.findById(doc.salon),
    ]);
 
    if (!client || !salon) return;
 
    // 1 point par visite (= 1 vente), montant total dépensé
    const points = 1;
    client.enregistrerVisite(doc.totalMontant, salon.configFidelite);
    client.pointsAttribues = points; // pour info, pas bloquant
 
    // Snapshot des points attribués sur la vente elle-même
    // (sans re-déclencher le hook → updateOne direct)
    await Promise.all([
      client.save(),
      mongoose.model('Vente').updateOne(
        { _id: doc._id },
        { $set: { pointsAttribues: points } },
      ),
    ]);
  } catch (err) {
    // Ne pas bloquer la vente si la fidélité échoue
    console.error('[Fidélité] Erreur mise à jour points :', err.message);
  }
});
 
// ─────────────────────────────────────────────────────────────────────────────
// HOOK POST findOneAndUpdate (statut → annulee) — retire les points si annulation
// ─────────────────────────────────────────────────────────────────────────────
venteSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;
  if (doc.statut !== 'annulee') return;
  if (!doc.clientId) return;
  if (doc.pointsAttribues === 0) return; // déjà rollbacké ou jamais attribués
 
  try {
    const Client = mongoose.model('Client');
    const Salon  = mongoose.model('Salon');
 
    const [client, salon] = await Promise.all([
      Client.findById(doc.clientId),
      Salon.findById(doc.salon),
    ]);
 
    if (!client || !salon) return;
 
    // Retire les points et recalcule le statut
    client.pointsFidelite = Math.max(0, client.pointsFidelite - doc.pointsAttribues);
    client.nombreVisites  = Math.max(0, client.nombreVisites  - 1);
    client.totalDepense   = Math.max(0, client.totalDepense   - doc.totalMontant);
 
    // Recalcule le statut après retrait
    const cfg = salon.configFidelite;
    if (client.pointsFidelite >= cfg.visitesVIP) {
      client.statut = 'vip';
    } else if (client.pointsFidelite >= cfg.visitesRequises) {
      client.statut = 'regulier';
    } else {
      client.statut = 'nouveau';
    }
 
    await Promise.all([
      client.save(),
      mongoose.model('Vente').updateOne(
        { _id: doc._id },
        { $set: { pointsAttribues: 0 } },
      ),
    ]);
  } catch (err) {
    console.error('[Fidélité] Erreur rollback points :', err.message);
  }
});

module.exports = mongoose.model('Vente', venteSchema);