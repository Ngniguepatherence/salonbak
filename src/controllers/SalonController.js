const Salon = require('../models/Salon');
const User  = require('../models/User');

// ─────────────────────────────────────────────
// CHAMPS QU'UN OWNER PEUT MODIFIER
// (tout ce qui n'est pas ici est bloqué)
// ─────────────────────────────────────────────
const OWNER_EDITABLE_FIELDS = [
  'name', 'slogan', 'description', 'logoUrl', 'typeEtablissement',
  'phone', 'email',
  'address', 'ville', 'pays', 'devise', 'horaires',
  'joursRappelInactivite', 'joursRappelSuivi','configFidelite',
];

// Champs que seul l'admin peut toucher
const ADMIN_ONLY_FIELDS = ['owner', 'abonnement', 'isActive'];

// ─────────────────────────────────────────────
// HELPER — filtrer le body selon le rôle
// ─────────────────────────────────────────────
function sanitizeBody(body, role) {
  const cleaned = {};

  if (role === 'admin') {
    // L'admin peut tout modifier sauf les champs système
    const systemFields = ['_id', '__v', 'createdAt', 'updatedAt'];
    Object.keys(body).forEach(key => {
      if (!systemFields.includes(key)) cleaned[key] = body[key];
    });
  } else {
    // Owner : uniquement les champs autorisés
    OWNER_EDITABLE_FIELDS.forEach(field => {
      if (body[field] !== undefined) cleaned[field] = body[field];
    });
  }

  return cleaned;
}

// ─────────────────────────────────────────────
// GET /api/salons/:salonId
// ─────────────────────────────────────────────
exports.getSalon = async (req, res, next) => {
  try {
    const salon = await Salon
      .findById(req.params.salonId)
      .populate('owner', 'name email telephone');

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }
    console.log(salon);
    res.status(200).json({ success: true, data: salon });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PUT /api/salons/:salonId
// ─────────────────────────────────────────────
exports.updateSalon = async (req, res, next) => {
  try {
    const body = sanitizeBody(req.body, req.user.role);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun champ modifiable fourni' });
    }

    const salon = await Salon.findByIdAndUpdate(
      req.params.salonId,
      { $set: body },
      { new: true, runValidators: true }
    ).populate('owner', 'name email telephone');

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    res.status(200).json({ success: true, data: salon });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PATCH /api/salons/:salonId/rappels
// Raccourci dédié pour les paramètres de rappel
// ─────────────────────────────────────────────
exports.updateRappels = async (req, res, next) => {
  try {
    const { joursRappelInactivite, joursRappelSuivi } = req.body;
    const update = {};

    if (joursRappelInactivite !== undefined) update.joursRappelInactivite = Number(joursRappelInactivite);
    if (joursRappelSuivi      !== undefined) update.joursRappelSuivi      = Number(joursRappelSuivi);

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'joursRappelInactivite ou joursRappelSuivi requis' });
    }

    const salon = await Salon.findByIdAndUpdate(
      req.params.salonId,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('owner', 'name email telephone');

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    res.status(200).json({ success: true, data: salon });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// GET /api/salons/:salonId/abonnement
// Infos abonnement enrichies (lecture seule)
// ─────────────────────────────────────────────
exports.getAbonnement = async (req, res, next) => {
  try {
    const salon = await Salon.findById(req.params.salonId).select('abonnement isActive name');

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    const joursRestants = salon.joursAvantExpiration();

    res.status(200).json({
      success: true,
      data: {
        ...salon.abonnement.toObject(),
        active:         salon.isSubscriptionActive(),
        joursRestants,
        expirationProche: joursRestants <= 10,
        expirationImminente: joursRestants <= 5,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// STAFF
// ─────────────────────────────────────────────

exports.getStaff = async (req, res, next) => {
  try {
    const staff = await User
      .find({ salon: req.params.salonId, role: 'staff' })
      .select('-password');

    res.status(200).json({ success: true, count: staff.length, data: staff });
  } catch (err) {
    next(err);
  }
};

exports.createStaff = async (req, res, next) => {
  try {
    const { name, email, password, telephone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email et password requis' });
    }

    const staff = await User.create({
      name,
      email,
      password,
      telephone,
      role: 'staff',
      salon: req.params.salonId,
    });

    res.status(201).json({
      success: true,
      data: { ...staff.toObject(), password: undefined },
    });
  } catch (err) {
    next(err);
  }
};

exports.updateStaff = async (req, res, next) => {
  try {
    // Champs interdits
    delete req.body.role;
    delete req.body.salon;
    delete req.body.password;

    const staff = await User.findOneAndUpdate(
      { _id: req.params.userId, salon: req.params.salonId, role: 'staff' },
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Membre du staff introuvable' });
    }

    res.status(200).json({ success: true, data: staff });
  } catch (err) {
    next(err);
  }
};

exports.deleteStaff = async (req, res, next) => {
  try {
    const staff = await User.findOneAndDelete({
      _id: req.params.userId,
      salon: req.params.salonId,
      role: 'staff',
    });

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Membre du staff introuvable' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};