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
    const rdv = await RendezVous.create({
      ...req.body,
      salon:   req.params.salonId,
      employe: req.body.employe || req.user._id,
    });

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

    const rdv = await RendezVous.findOneAndUpdate(
      { _id: req.params.id, salon: req.params.salonId },
      req.body,
      { new: true, runValidators: true }
    ).populate('client',        'nom telephone')
     .populate('typePrestation', 'nom prix couleur')
     .populate('employe',       'name email');

    if (!rdv) {
      return res.status(404).json({ success: false, message: 'Rendez-vous introuvable' });
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