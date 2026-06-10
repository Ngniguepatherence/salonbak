const { Campaign, ContactGroup } = require('../models/Campaign');
const Client = require('../models/Client');

// ═══════════════════════════════════════════════════
// GROUPES DE CONTACTS
// ═══════════════════════════════════════════════════

/**
 * GET /api/salons/:salonId/groupes-contacts
 * Récupère tous les groupes de contacts du salon
 */
exports.getGroupes = async (req, res, next) => {
  try {
    const groupes = await ContactGroup
      .find({ salon: req.params.salonId })
      .populate('clients', 'nom telephone statut')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: groupes.length, data: groupes });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/salons/:salonId/groupes-contacts
 * Crée un nouveau groupe de contacts
 */
exports.createGroupe = async (req, res, next) => {
  try {
    const { nom, description, couleur, clients, type, filtres } = req.body;

    if (!nom) {
      return res.status(400).json({ success: false, message: 'Le nom du groupe est requis' });
    }

    // Vérifier que les clients appartiennent bien au salon
    if (clients && clients.length > 0) {
      const clientsValides = await Client.find({
        _id: { $in: clients },
        salon: req.params.salonId,
      }).select('_id');

      const idsValides = clientsValides.map(c => c._id.toString());
      const idsInvalides = clients.filter(id => !idsValides.includes(id));

      if (idsInvalides.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Certains clients sont invalides: ${idsInvalides.join(', ')}`,
        });
      }
    }

    const groupe = await ContactGroup.create({
      salon: req.params.salonId,
      nom,
      description,
      couleur: couleur || '#8b5cf6',
      clients: clients || [],
      type: type || 'manuel',
      filtres: filtres || {},
      creeePar: req.user._id,
    });

    const groupePopule = await groupe.populate('clients', 'nom telephone statut');

    res.status(201).json({ success: true, data: groupePopule });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/salons/:salonId/groupes-contacts/:id
 * Met à jour un groupe de contacts
 */
exports.updateGroupe = async (req, res, next) => {
  try {
    const { nom, description, couleur, clients, filtres } = req.body;

    const groupe = await ContactGroup.findOne({
      _id: req.params.id,
      salon: req.params.salonId,
    });

    if (!groupe) {
      return res.status(404).json({ success: false, message: 'Groupe introuvable' });
    }

    if (nom) groupe.nom = nom;
    if (description !== undefined) groupe.description = description;
    if (couleur) groupe.couleur = couleur;
    if (clients !== undefined) groupe.clients = clients;
    if (filtres) groupe.filtres = filtres;

    await groupe.save();
    const groupePopule = await groupe.populate('clients', 'nom telephone statut');

    res.status(200).json({ success: true, data: groupePopule });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/salons/:salonId/groupes-contacts/:id
 * Supprime un groupe de contacts
 */
exports.deleteGroupe = async (req, res, next) => {
  try {
    const groupe = await ContactGroup.findOneAndDelete({
      _id: req.params.id,
      salon: req.params.salonId,
    });

    if (!groupe) {
      return res.status(404).json({ success: false, message: 'Groupe introuvable' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════
// CAMPAGNES
// ═══════════════════════════════════════════════════

/**
 * GET /api/salons/:salonId/campagnes
 * Liste toutes les campagnes du salon
 */
exports.getCampagnes = async (req, res, next) => {
  try {
    const campagnes = await Campaign
      .find({ salon: req.params.salonId })
      .populate('groupes', 'nom couleur')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: campagnes.length, data: campagnes });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/salons/:salonId/campagnes
 * Crée une nouvelle campagne
 */
exports.createCampagne = async (req, res, next) => {
  try {
    const {
      nom, message, groupes, groupesPredefinies,
      delaiEntreMessages,
    } = req.body;

    if (!nom || !message) {
      return res.status(400).json({ success: false, message: 'Nom et message requis' });
    }

    const campagne = await Campaign.create({
      salon: req.params.salonId,
      nom,
      message,
      groupes: groupes || [],
      groupesPredefinies: groupesPredefinies || [],
      delaiEntreMessages: delaiEntreMessages || 30,
      statut: 'brouillon',
      creeePar: req.user._id,
    });

    res.status(201).json({ success: true, data: campagne });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/salons/:salonId/campagnes/:id
 * Met à jour une campagne (ex: statut, stats)
 */
exports.updateCampagne = async (req, res, next) => {
  try {
    const campagne = await Campaign.findOneAndUpdate(
      { _id: req.params.id, salon: req.params.salonId },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!campagne) {
      return res.status(404).json({ success: false, message: 'Campagne introuvable' });
    }

    res.status(200).json({ success: true, data: campagne });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/salons/:salonId/campagnes/:id
 * Supprime une campagne
 */
exports.deleteCampagne = async (req, res, next) => {
  try {
    const campagne = await Campaign.findOneAndDelete({
      _id: req.params.id,
      salon: req.params.salonId,
    });

    if (!campagne) {
      return res.status(404).json({ success: false, message: 'Campagne introuvable' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/salons/:salonId/campagnes/:id/update-stats
 * Met à jour les statistiques d'envoi d'une campagne
 */
exports.updateStats = async (req, res, next) => {
  try {
    const { envoyes, echecs, statut } = req.body;

    const campagne = await Campaign.findOne({
      _id: req.params.id,
      salon: req.params.salonId,
    });

    if (!campagne) {
      return res.status(404).json({ success: false, message: 'Campagne introuvable' });
    }

    if (envoyes !== undefined) campagne.stats.envoyes = envoyes;
    if (echecs !== undefined) campagne.stats.echecs = echecs;
    if (statut) campagne.statut = statut;

    if (statut === 'en_cours' && !campagne.stats.dateDebut) {
      campagne.stats.dateDebut = new Date();
    }
    if (statut === 'terminee') {
      campagne.stats.dateFin = new Date();
    }

    await campagne.save();
    res.status(200).json({ success: true, data: campagne });
  } catch (err) {
    next(err);
  }
};
