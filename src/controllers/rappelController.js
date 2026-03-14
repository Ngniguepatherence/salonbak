const mongoose   = require('mongoose');
const Client     = require('../models/Client');
const Prestation = require('../models/Prestation');
const Vente      = require('../models/vente');
const Salon      = require('../models/Salon');

/**
 * Calcule, pour chaque client du salon, sa dernière interaction :
 *   → dernière prestation (visite physique) OU dernière vente produit
 *   → on retient la date la plus récente des deux.
 *
 * Retourne un Map  clientId (string) → { derniereInteraction, nbVisites, montantTotal }
 */
async function getDerniereInteraction(salonId) {
  // ── 1. Agrège les prestations par client ──
  const prestations = await Prestation.aggregate([
    { $match: { salon: salonId } },
    { $sort:  { date: -1 } },
    {
      $group: {
        _id:                '$clientId',
        dernierePrestation: { $first: '$date' },   // date la + récente (tri desc)
        nbVisites:          { $sum: 1 },
        montantPrestations: { $sum: '$montant' },
      },
    },
  ]);

  // ── 2. Agrège les ventes produits par client ──
  //    On exclut les ventes sans clientId (ventes anonymes)
  const ventes = await Vente.aggregate([
    {
      $match: {
        salon:    salonId,
        clientId: { $exists: true, $ne: null },
        statut:   { $ne: 'annulee' },             // ignorer les annulées
      },
    },
    { $sort: { date: -1 } },
    {
      $group: {
        _id:          '$clientId',
        derniereVente: { $first: '$date' },
        montantVentes: { $sum: '$totalMontant' },
      },
    },
  ]);

  // ── 3. Fusion : on prend la date la plus récente des deux sources ──
  const venteMap = {};
  ventes.forEach(v => { venteMap[String(v._id)] = v; });

  const interactions = {};

  prestations.forEach(p => {
    const id    = String(p._id);
    const vente = venteMap[id];

    // Comparaison de dates YYYY-MM-DD (ordre lexicographique = ordre chronologique)
    const datePrest = p.dernierePrestation ?? '';
    const dateVente = vente?.derniereVente  ?? '';
    const derniereInteraction = datePrest >= dateVente ? datePrest : dateVente || datePrest;

    interactions[id] = {
      derniereInteraction,
      nbVisites:    p.nbVisites,
      montantTotal: (p.montantPrestations ?? 0) + (vente?.montantVentes ?? 0),
    };
  });

  // Clients avec ventes uniquement (aucune prestation enregistrée)
  Object.entries(venteMap).forEach(([id, v]) => {
    if (!interactions[id]) {
      interactions[id] = {
        derniereInteraction: v.derniereVente,
        nbVisites:           0,                  // 0 prestation salon, mais achat produit
        montantTotal:        v.montantVentes ?? 0,
      };
    }
  });

  return interactions;
}

/**
 * Score de risque de départ (0–100).
 * Plus le score est élevé, plus la cliente risque de ne pas revenir.
 *
 * Composantes :
 *   - Jours sans visite  : 0–60 pts  (plafond à 90 jours = score max)
 *   - Peu de visites     : 0–20 pts  (chaque visite réduit le risque)
 *   - Faible montant     : 0–20 pts  (seuil : 20 000 FCFA = risque nul)
 */
function calculerScoreRisque(joursSansVisite, nbVisites, montantTotal) {
  if (joursSansVisite === null) return 55; // jamais venue → risque moyen-élevé

  const scoreAbsence  = Math.min(60, (joursSansVisite / 90) * 60);
  const scoreVisites  = Math.max(0, 20 - (nbVisites ?? 0) * 3);
  const scoreMontant  = Math.max(0, 20 - Math.min(20, (montantTotal ?? 0) / 1000));

  return Math.round(Math.min(100, scoreAbsence + scoreVisites + scoreMontant));
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER PRINCIPAL
// GET /api/salons/:salonId/rappels
// ─────────────────────────────────────────────────────────────────────────────
exports.getRappels = async (req, res, next) => {
  try {
    const salonId = mongoose.Types.ObjectId.createFromHexString(req.params.salonId);

    // Paramètres SAV depuis le salon (configurable par le propriétaire)
    const salon           = await Salon.findById(salonId).select('joursRappelInactivite joursRappelSuivi').lean();
    const joursInactivite = salon?.joursRappelInactivite ?? 30;
    const joursSuivi      = salon?.joursRappelSuivi      ?? 14;

    // Données
    const [clients, interactions] = await Promise.all([
      Client.find({ salon: salonId, actif: true }).lean(),
      getDerniereInteraction(salonId),
    ]);

    const now = new Date();

    const result = clients.map(c => {
      const id   = String(c._id);
      const info = interactions[id];

      // ── Jours sans visite ──
      let joursSansVisite = null;
      if (info?.derniereInteraction) {
        // Comparaison en ms depuis minuit local pour éviter les décalages UTC
        const d = new Date(info.derniereInteraction + 'T00:00:00');
        joursSansVisite = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      }

      // ── Anniversaire ──
      let anniversaireCeMois    = false;
      let joursAvantAnniversaire = null;
      if (c.dateNaissance) {
        const anniv = new Date(c.dateNaissance);
        anniversaireCeMois = anniv.getMonth() === now.getMonth();
        // Prochain anniversaire (cette année ou l'an prochain)
        const prochain = new Date(now.getFullYear(), anniv.getMonth(), anniv.getDate());
        if (prochain < now) prochain.setFullYear(now.getFullYear() + 1);
        joursAvantAnniversaire = Math.floor((prochain - now) / (1000 * 60 * 60 * 24));
      }

      // ── Score risque ──
      const scoreRisque = calculerScoreRisque(joursSansVisite, info?.nbVisites, info?.montantTotal);

      return {
        _id:            c._id,
        nom:            c.nom,
        prenom:         c.prenom,
        telephone:      c.telephone,
        email:          c.email,
        dateNaissance:  c.dateNaissance,
        notes:          c.notes,
        // Stats activité
        derniereInteraction: info?.derniereInteraction ?? null,
        joursSansVisite,
        nbVisites:           info?.nbVisites   ?? 0,
        montantTotal:        info?.montantTotal ?? 0,
        // Flags SAV
        estInactif:      joursSansVisite !== null && joursSansVisite >= joursInactivite,
        estJamaisVenu:   !info,                         // aucune prestation ni vente
        estASuivre:      joursSansVisite !== null &&
                         joursSansVisite >= 7 &&
                         joursSansVisite < joursInactivite, // entre suivi et inactivité
        anniversaireCeMois,
        joursAvantAnniversaire,
        scoreRisque,
      };
    });

    // ── Catégories triées ──
    const inactifs      = result.filter(c => c.estInactif)
                                .sort((a, b) => b.scoreRisque - a.scoreRisque);  // risque décroissant

    const asSuivre      = result.filter(c => c.estASuivre)
                                .sort((a, b) => b.joursSansVisite - a.joursSansVisite); // les + longtemps absentes en premier

    const anniversaires = result.filter(c => c.anniversaireCeMois)
                                .sort((a, b) => a.joursAvantAnniversaire - b.joursAvantAnniversaire); // les + proches en premier

    const jamaisVenus   = result.filter(c => c.estJamaisVenu);

    res.status(200).json({
      success: true,
      data: {
        tous: result,
        inactifs,
        asSuivre,
        anniversaires,
        jamaisVenus,
        stats: {
          totalClients:    clients.length,
          nbInactifs:      inactifs.length,
          nbASuivre:       asSuivre.length,
          nbAnniversaires: anniversaires.length,
          nbJamaisVenus:   jamaisVenus.length,
          joursInactivite,
          joursSuivi,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};