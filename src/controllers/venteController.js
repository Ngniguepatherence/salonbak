const Vente   = require('../models/vente');
const Produit = require('../models/produit');

// @desc    Lister les ventes d'un salon
// @route   GET /api/salons/:salonId/ventes
exports.getVentes = async (req, res, next) => {
  try {
    const { from, to, clientId, statut } = req.query;
    const filter = { salon: req.params.salonId };

    if (clientId) filter.clientId = clientId;
    if (statut)   filter.statut   = statut;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to)   filter.date.$lte = to;
    }

    const ventes = await Vente.find(filter)
      .populate('clientId', 'nom telephone')
      .populate('employe',  'name email')
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({ success: true, count: ventes.length, data: ventes });
  } catch (err) {
    next(err);
  }
};

// @desc    Créer une vente
// @route   POST /api/salons/:salonId/ventes
exports.createVente = async (req, res, next) => {
  try {
    const { items, remise = 0, remisePct = 0, ...rest } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins un article est requis' });
    }

    // ── Recalcul des montants côté serveur (sécurité) ──
    const itemsCalcules = items.map((item) => ({
      ...item,
      montant: item.prixUnitaire * item.quantite,
    }));

    const sousTotal      = itemsCalcules.reduce((s, i) => s + i.montant, 0);
    const montantRemise  = remisePct > 0 ? (sousTotal * remisePct) / 100 : remise;
    const totalMontant   = sousTotal - montantRemise;

    // ── Décrémenter le stock pour les produits vendus ──
    const produitItems = itemsCalcules.filter(i => i.type === 'produit');
    if (produitItems.length > 0) {
      await Promise.all(
        produitItems.map(item =>
          Produit.findOneAndUpdate(
            { _id: item.referenceId, salon: req.params.salonId },
            { $inc: { stock: -item.quantite } }, // ✅ quantite pas stock
            { new: true }
          )
        )
      );
    }

    // ── Pas de décrémention pour les prestations (service immatériel) ──
    // const vente = new Vente({
    //   ...rest,
    //   salon: req.params.salonId,
    //   employe: req.user._id,
    //   lignes: lignesCalculees,
    //   sousTotal,
    //   remise: montantRemise,
    //   remisePct,
    //   total,
    // });
    const vente = await Vente({
      ...rest,
      salon:        req.params.salonId,
      employe:      req.user._id,
      items:        itemsCalcules,
      remise:       montantRemise,
      remisePct,
      totalMontant,
    });

    await vente.save();

    await vente.populate([
      { path: 'clientId', select: 'nom telephone' },
      { path: 'employe',  select: 'name email' },
    ]);

    res.status(201).json({ success: true, data: vente });
  } catch (err) {
    next(err);
  }
};

// @desc    Modifier le statut d'une vente (notes, statut seulement)
// @route   PUT /api/salons/:salonId/ventes/:id
exports.updateVente = async (req, res, next) => {
  try {
    // Protège les champs immuables après création
    delete req.body.salon;
    delete req.body.items;
    delete req.body.totalMontant;
    delete req.body.remise;
    delete req.body.remisePct;

    const vente = await Vente.findOne(
      { _id: req.params.id, salon: req.params.salonId },
      // req.body,
      // { new: true, runValidators: true }
    )
    if(!vente) {
      return res.status(404).json({ success: false, message: 'Vente introuvable' });
    }
    const champsAutorises = ['statut', 'modePaiement', 'notes', 'remise', 'remisePct', 'fideliteAppliquee'];
    champsAutorisés.forEach(champ => {
      if (req.body[champ] !== undefined) vente[champ] = req.body[champ];
    });
    
    await vente.save();

    await vente
    .populate('clientId', 'nom telephone')
      .populate('employe',  'name email');


    res.status(200).json({ success: true, data: vente });
  } catch (err) {
    next(err);
  }
};

// @desc    Supprimer une vente + restaurer le stock produits
// @route   DELETE /api/salons/:salonId/ventes/:id
exports.deleteVente = async (req, res, next) => {
  try {
    const vente = await Vente.findOne({
      _id:   req.params.id,
      salon: req.params.salonId,
    });

    if (!vente) {
      return res.status(404).json({ success: false, message: 'Vente introuvable' });
    }

    // ── Restaurer le stock pour les produits uniquement ──
    const produitItems = vente.items.filter(i => i.type === 'produit');
    if (produitItems.length > 0) {
      await Promise.all(
        produitItems.map(item =>
          Produit.findOneAndUpdate(
            { _id: item.referenceId, salon: req.params.salonId },
            { $inc: { quantite: +item.quantite } }, // ✅ on remet le stock
            { new: true }
          )
        )
      );
    }

    // ── Pas de restauration pour les prestations ──

    await vente.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};