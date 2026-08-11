const RendezVous = require('../models/Rendezvous');

// @desc    Lister les rendez-vous d'un salon
// @route   GET /api/salons/:salonId/rendez-vous
// @access  Private
exports.getRendezVous = async (req, res, next) => {
  try {
    const { date, clientId, statut, from, to } = req.query;
    const filter = { salon: req.params.salonId };

    if (date)     filter.date = date;
    if (clientId) filter.client = clientId;
    if (statut)   filter.statut = statut;

    // Plage de dates
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to)   filter.date.$lte = to;
    }

    const data = await RendezVous.find(filter)
      .populate('client',       'nom telephone')
      .populate('typePrestation', 'nom prix couleur')
      .populate('employe',      'name email')
      .sort({ date: 1, heure: 1 });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
};

// @desc    Créer un rendez-vous
// @route   POST /api/salons/:salonId/rendez-vous
// @access  Private
exports.createRendezVous = async (req, res, next) => {
  try {
    const { clientId, typePrestationId, ...rest } = req.body;
    
    const rdv = new RendezVous({
      ...rest,
      client: clientId || req.body.client,
      typePrestation: typePrestationId || req.body.typePrestation,
      salon:   req.params.salonId,
      employe: req.body.employe || req.user?._id,
    });

    await rdv.save();

    await rdv.populate([
      { path: 'client',        select: 'nom telephone' },
      { path: 'typePrestation', select: 'nom prix couleur' },
      { path: 'employe',       select: 'name email' },
    ]);

    res.status(201).json({ success: true, data: rdv });
  } catch (err) {
    next(err);
  }
};

// @desc    Mettre à jour un rendez-vous
// @route   PUT /api/salons/:salonId/rendez-vous/:id
// @access  Private
exports.updateRendezVous = async (req, res, next) => {
  try {
    delete req.body.salon;

    if (req.body.clientId) {
      req.body.client = req.body.clientId;
      delete req.body.clientId;
    }
    if (req.body.typePrestationId) {
      req.body.typePrestation = req.body.typePrestationId;
      delete req.body.typePrestationId;
    }

    const existingRdv = await RendezVous.findOne({ _id: req.params.id, salon: req.params.salonId });
    if (!existingRdv) {
      return res.status(404).json({ success: false, message: 'Rendez-vous introuvable' });
    }

    const previousStatut = existingRdv.statut;
    const newStatut = req.body.statut;

    const rdv = await RendezVous.findOneAndUpdate(
      { _id: req.params.id, salon: req.params.salonId },
      req.body,
      { new: true, runValidators: true }
    ).populate('client',        'nom telephone')
     .populate('typePrestation', 'nom prix couleur')
     .populate('prestations', 'nom prix')
     .populate('employe',       'name email');

    const isTerminalNow = ['completed', 'termine', 'honore', 'effectue'].includes((newStatut || '').toLowerCase());
    const wasTerminalBefore = ['completed', 'termine', 'honore', 'effectue'].includes((previousStatut || '').toLowerCase());

    if (isTerminalNow && !wasTerminalBefore && rdv.client) {
      try {
        const Client = require('../models/Client');
        const Salon = require('../models/Salon');
        const clientObj = await Client.findById(rdv.client._id || rdv.client);
        const salonObj = await Salon.findById(req.params.salonId);

        if (clientObj) {
          const configFidelite = salonObj?.configFidelite || { visitesRequises: 10, visitesVIP: 20 };
          let price = 0;
          if (rdv.prestations && rdv.prestations.length > 0) {
            price = rdv.prestations.reduce((sum, p) => sum + (parseInt((p.prix || '').toString().replace(/\D/g, ''), 10) || 0), 0);
          } else if (rdv.typePrestation && rdv.typePrestation.prix) {
            price = parseInt((rdv.typePrestation.prix || '').toString().replace(/\D/g, ''), 10) || 0;
          }

          if (typeof clientObj.enregistrerVisite === 'function') {
            clientObj.enregistrerVisite(price, configFidelite);
          } else {
            clientObj.pointsFidelite = (clientObj.pointsFidelite || 0) + 1;
            clientObj.nombreVisites = (clientObj.nombreVisites || 0) + 1;
            clientObj.totalDepense = (clientObj.totalDepense || 0) + price;
            clientObj.derniereVisite = new Date();
          }
          await clientObj.save();
          console.log(`[FIDELITE] Visite et point enregistrés pour le client ${clientObj.nom} suite au rdv terminé.`);
        }
      } catch (fideliteErr) {
        console.error('[FIDELITE ERR]', fideliteErr.message);
      }
    }

    res.status(200).json({ success: true, data: rdv });
  } catch (err) {
    next(err);
  }
};

// @desc    Supprimer un rendez-vous
// @route   DELETE /api/salons/:salonId/rendez-vous/:id
// @access  Private
exports.deleteRendezVous = async (req, res, next) => {
  try {
    const rdv = await RendezVous.findOneAndDelete({
      _id: req.params.id,
      salon: req.params.salonId,
    });

    if (!rdv) {
      return res.status(404).json({ success: false, message: 'Rendez-vous introuvable' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};