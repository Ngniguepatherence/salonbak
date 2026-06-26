const Salon = require('../models/Salon');
const User  = require('../models/User');

// ─────────────────────────────────────────────
// CHAMPS QU'UN OWNER PEUT MODIFIER
// (tout ce qui n'est pas ici est bloqué)
// ─────────────────────────────────────────────
const OWNER_EDITABLE_FIELDS = [
  'name', 'slogan', 'description', 'logoUrl', 'bannerUrl', 'galleryUrls', 'typeEtablissement',
  'phone', 'email',
  'address', 'ville', 'pays', 'devise', 'horaires', 'availability',
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
// POST /api/salons/onboard
// (Owner créant son premier salon)
// ─────────────────────────────────────────────
exports.onboardSalon = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Seul un propriétaire peut créer un salon' });
    }
    if (user.salon) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà un salon associé' });
    }

    const {
      name, phone, email, address, ville, typeEtablissement, description, logoUrl, bannerUrl, galleryUrls, plan,
      slogan, devise, pays, horaires
    } = req.body;

    if (!name || !phone || !email || !address) {
      return res.status(400).json({ success: false, message: 'name, phone, email et address sont requis' });
    }

    const { PLANS } = require('../config/plans');
    const config = PLANS ? (PLANS[plan || 'pro'] || PLANS.pro) : {
      maxCustomers: 500, maxStaff: 5, maxRendezvous: 200, maxCampaignsPerMonth: 0, exportEnabled: false, campaignsEnabled: false
    };

    const salon = await Salon.create({
      name,
      phone,
      email,
      address,
      ville,
      typeEtablissement: typeEtablissement || 'salon_coiffure',
      description,
      logoUrl,
      bannerUrl,
      galleryUrls: galleryUrls || [],
      slogan,
      devise: devise || 'FCFA',
      pays: pays || 'CM',
      horaires,
      owner: user._id,
      plan: plan || 'pro',
      isActive: true,
      limits: {
        maxCustomers: config.maxCustomers || 500,
        maxStaff: config.maxStaff || 5,
        maxRendezvous: config.maxRendezvous || 200,
        maxCampaignsPerMonth: config.maxCampaignsPerMonth || 0,
        exportEnabled: config.exportEnabled || false,
        campaignsEnabled: config.campaignsEnabled || false,
      },
      abonnement: {
        statut: 'essai',
        dateDebut: Date.now(),
        dateFin: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial as stated in UI
      }
    });

    user.salon = salon._id;
    await user.save();

    // Renvoyer la session mise à jour (via AuthController)
    const { buildSessionResponse } = require('./AuthController');
    const token = user.getSignedJwtToken();

    res.status(201).json({
      success: true,
      ...buildSessionResponse(user, salon, token)
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// POST /api/salons/link
// (Owner liant son compte à un salon existant via slug ou ID)
// ─────────────────────────────────────────────
exports.linkSalon = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Seul un propriétaire peut lier un salon' });
    }
    if (user.salon) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà un salon associé' });
    }

    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({ success: false, message: 'slug ou identifiant du salon requis' });
    }

    let salon = await Salon.findOne({ slug: identifier.trim().toLowerCase() });
    
    if (!salon) {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(identifier.trim())) {
        salon = await Salon.findById(identifier.trim());
      }
    }

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable avec ce code ou slug' });
    }

    // Associer le salon à l'utilisateur
    user.salon = salon._id;
    await user.save();

    // Renvoyer la session mise à jour (via AuthController)
    const { buildSessionResponse } = require('./AuthController');
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Salon lié avec succès !',
      ...buildSessionResponse(user, salon, token)
    });
  } catch (err) {
    next(err);
  }
};

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
    const salon = await Salon
      .findById(req.params.salonId)
      .select('abonnement isActive name plan limits');

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    const joursRestants = salon.joursAvantExpiration();

    res.status(200).json({
      success: true,
      data: {
        ...salon.abonnement.toObject(),
        plan:                salon.plan,           // 'basic' | 'pro' | 'premium'
        limits:              salon.limits,         // On retourne les limites enregistrées en base
        active:              salon.isSubscriptionActive(),
        joursRestants,
        expirationProche:    joursRestants <= 10,
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
    const staff = await User.findOne({
      _id: req.params.userId,
      salon: req.params.salonId,
      role: { $in: ['staff', 'owner'] }
    });

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Membre du staff introuvable' });
    }

    // Mettre à jour les champs autorisés
    if (req.body.name !== undefined) staff.name = req.body.name;
    if (req.body.email !== undefined) staff.email = req.body.email;
    if (req.body.telephone !== undefined) staff.telephone = req.body.telephone;
    if (req.body.avatarUrl !== undefined) staff.avatarUrl = req.body.avatarUrl;
    if (req.body.availability !== undefined) staff.availability = req.body.availability;
    if (req.body.password !== undefined && req.body.password !== '') {
      staff.password = req.body.password; // Ce sera hashé par le hook pre('save') !
    }

    await staff.save();

    res.status(200).json({ success: true, data: { ...staff.toObject(), password: undefined } });
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

// ─────────────────────────────────────────────
// POST /api/salons/:salonId/upgrade-request
// Prévient l'admin
// ─────────────────────────────────────────────
exports.upgradeRequest = async (req, res, next) => {
  try {
    const { plan: targetPlan } = req.body;
    const salon = await Salon.findById(req.params.salonId).populate('owner');

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    // Log pour l'admin (pourrait être un mail ultérieurement)
    console.log(`[UPGRADE REQUEST] @ ${new Date().toISOString()}`);
    console.log(`- Salon: ${salon.name}`);
    console.log(`- Propriétaire: ${salon.owner?.name} (${salon.owner?.email})`);
    console.log(`- Nouveau Plan souhaité: ${targetPlan}`);

    res.status(200).json({ 
      success: true, 
      message: 'Demande d\'upgrade reçue. Un conseiller vous contactera par WhatsApp ou par mail.' 
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// PUT /api/salons/:salonId/fidelite
// Mise à jour explicite de la config fidélité
// ─────────────────────────────────────────────
exports.updateConfigFidelite = async (req, res, next) => {
  try {
    const { visitesRequises, reductionPourcentage, visitesVIP } = req.body;
    
    const update = {};
    if (visitesRequises !== undefined) update['configFidelite.visitesRequises'] = Number(visitesRequises);
    if (reductionPourcentage !== undefined) update['configFidelite.reductionPourcentage'] = Number(reductionPourcentage);
    if (visitesVIP     !== undefined) update['configFidelite.visitesVIP'] = Number(visitesVIP);

    const salon = await Salon.findByIdAndUpdate(
      req.params.salonId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    res.status(200).json({ success: true, data: salon });
  } catch (err) {
    next(err);
  }
};