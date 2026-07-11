const Salon = require('../models/Salon');
const User = require('../models/User');

/**
 * @desc    Get all salons (Admin only)
 * @route   GET /api/admin/salons
 * @access  Private/Admin
 */
exports.getAllSalons = async (req, res, next) => {
  try {
    const salons = await Salon.find().populate('owner', 'name email telephone');

    res.status(200).json({
      success: true,
      count: salons.length,
      data: salons
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get global statistics
 * @route   GET /api/admin/stats
 * @access  Private/Admin
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const totalSalons = await Salon.countDocuments();
    const activeSalons = await Salon.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments();

    // Revenue stats could be added here in the future

    res.status(200).json({
      success: true,
      data: {
        totalSalons,
        activeSalons,
        totalUsers
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a salon's status (activate/suspend)
 * @route   PUT /api/admin/salons/:id/status
 * @access  Private/Admin
 */
exports.updateSalonStatus = async (req, res, next) => {
  try {
    const { isActive, statutAbonnement, plan, abonnement } = req.body;
    console.log(req.body);
    const salon = await Salon.findById(req.params.id);

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon non trouvé' });
    }

    if (isActive !== undefined) {
      salon.isActive = isActive;
    }

    if (statutAbonnement !== undefined) {
      salon.abonnement.statut = statutAbonnement;
      if (statutAbonnement === 'actif') {
        const now = new Date();
        if (!salon.abonnement.dateFin || new Date(salon.abonnement.dateFin) < now) {
          salon.abonnement.dateDebut = now;
          salon.abonnement.dateFin = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
      }
    }

    if (plan !== undefined) {
      const { getPlan } = require('../config/plans');
      const selectedPlan = await getPlan(plan);
      salon.plan = plan;
      salon.limits = {
        maxCustomers: selectedPlan.maxCustomers !== undefined ? selectedPlan.maxCustomers : -1,
        maxStaff: selectedPlan.maxStaff !== undefined ? selectedPlan.maxStaff : -1,
        maxRendezvous: selectedPlan.maxRendezvous !== undefined ? selectedPlan.maxRendezvous : -1,
        maxCampaignsPerMonth: selectedPlan.maxCampaignsPerMonth !== undefined ? selectedPlan.maxCampaignsPerMonth : -1,
        exportEnabled: selectedPlan.exportEnabled || false,
        campaignsEnabled: selectedPlan.campaignsEnabled || false,
      };
      salon.abonnement.montant = selectedPlan.price;
    }

    if (abonnement !== undefined && typeof abonnement === 'object') {
      if (abonnement.statut !== undefined) salon.abonnement.statut = abonnement.statut;
      if (abonnement.montant !== undefined) salon.abonnement.montant = Number(abonnement.montant);
      if (abonnement.dureeJours !== undefined) salon.abonnement.dureeJours = Number(abonnement.dureeJours);
      if (abonnement.dateDebut !== undefined) salon.abonnement.dateDebut = new Date(abonnement.dateDebut);
      if (abonnement.dateFin !== undefined) salon.abonnement.dateFin = new Date(abonnement.dateFin);
      if (abonnement.renouvellementAuto !== undefined) salon.abonnement.renouvellementAuto = Boolean(abonnement.renouvellementAuto);
    }

    await salon.save();

    res.status(200).json({
      success: true,
      data: salon
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Create a new salon and its owner
 * @route   POST /api/admin/salons
 * @access  Private/Admin
 */
exports.createSalon = async (req, res, next) => {
  try {
    const {
      ownerName,
      ownerEmail,
      ownerPassword,
      ownerPhone,
      salonName,
      salonPhone,
      salonEmail,
      salonAddress,
      plan,
      affiliateCode
    } = req.body;

    // 1. Check if user already exists
    let user = await User.findOne({ email: ownerEmail });
    if (user) {
      return res.status(400).json({ success: false, message: 'Un utilisateur avec cet email existe déjà' });
    }

    // Validate affiliateCode if provided
    if (affiliateCode) {
      const Affiliate = require('../models/Affiliate');
      const affiliate = await Affiliate.findOne({ affiliateCode: affiliateCode.trim().toUpperCase() });
      if (!affiliate) {
        return res.status(400).json({ success: false, message: "Le code d'affiliation fourni est invalide." });
      }
    }

    // 2. Create the owner user
    user = await User.create({
      name: ownerName,
      email: ownerEmail,
      password: ownerPassword,
      telephone: ownerPhone,
      role: 'owner'
    });

    // 3. Create the salon
    const { getPlan } = require('../config/plans');
    const selectedPlan = await getPlan(plan || 'basic');
    const trialDays = selectedPlan.trialDurationDays || 14;

    const salon = await Salon.create({
      name: salonName,
      phone: salonPhone,
      email: salonEmail,
      address: salonAddress,
      owner: user._id,
      plan: plan || 'basic',
      affiliateCode: affiliateCode ? affiliateCode.trim().toUpperCase() : null,
      isActive: true,
      limits: {
        maxCustomers: selectedPlan.maxCustomers !== undefined ? selectedPlan.maxCustomers : 300,
        maxStaff: selectedPlan.maxStaff !== undefined ? selectedPlan.maxStaff : 2,
        maxRendezvous: selectedPlan.maxRendezvous !== undefined ? selectedPlan.maxRendezvous : 100,
        maxCampaignsPerMonth: selectedPlan.maxCampaignsPerMonth !== undefined ? selectedPlan.maxCampaignsPerMonth : 0,
        exportEnabled: selectedPlan.exportEnabled || false,
        campaignsEnabled: selectedPlan.campaignsEnabled || false,
      },
      abonnement: {
        statut: 'essai',
        dateDebut: Date.now(),
        dateFin: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
        montant: selectedPlan.price || 5000,
        renouvellementAuto: false
      }
    });

    // 4. Link salon back to user
    user.salon = salon._id;
    await user.save();

    // 5. Create staff members if any
    const { staffList } = req.body;
    if (staffList && Array.isArray(staffList)) {
      for (const staff of staffList) {
        if (staff.nom && staff.email && staff.motDePasse) {
          await User.create({
            name: staff.nom,
            email: staff.email,
            password: staff.motDePasse,
            telephone: staff.telephone,
            role: 'staff',
            salon: salon._id
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      data: {
        salon,
        owner: {
          _id: user._id,
          name: user.name,
          email: user.email
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get ALL users (owner + staff) for a salon — admin view
 * @route   GET /api/admin/salons/:id/users
 * @access  Private/Admin
 */
exports.getSalonUsers = async (req, res, next) => {
  try {
    const salonId = req.params.id;

    // 1. Get salon with owner populated
    const salon = await Salon.findById(salonId)
      .populate('owner', 'name email telephone role actif createdAt')
      .lean();

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon non trouvé' });
    }

    // 2. Get every user that has this salon as reference (catches both owner & staff)
    const usersWithRef = await User.find({ salon: salonId }).select('-password').lean();

    // 3. Build unified list — owner first, then others
    const allUsers = [];
    const seenIds = new Set();

    if (salon.owner && salon.owner._id) {
      allUsers.push({
        _id: salon.owner._id,
        name: salon.owner.name,
        email: salon.owner.email,
        telephone: salon.owner.telephone || '',
        role: 'owner',
        actif: salon.owner.actif !== false,
        createdAt: salon.owner.createdAt,
      });
      seenIds.add(salon.owner._id.toString());
    }

    for (const u of usersWithRef) {
      const uid = u._id.toString();
      if (!seenIds.has(uid)) {
        allUsers.push(u);
        seenIds.add(uid);
      }
    }

    res.status(200).json({ success: true, count: allUsers.length, data: allUsers });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add a staff member to a salon (admin only)
 * @route   POST /api/admin/salons/:id/users
 * @access  Private/Admin
 */
exports.addSalonStaff = async (req, res, next) => {
  try {
    const { name, email, password, telephone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email et password sont requis' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Un utilisateur avec cet email existe déjà' });
    }

    const salon = await Salon.findById(req.params.id);
    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon non trouvé' });
    }

    const staff = await User.create({
      name,
      email,
      password,
      telephone,
      role: 'staff',
      salon: salon._id,
    });

    res.status(201).json({
      success: true,
      data: { ...staff.toObject(), password: undefined },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update any user of a salon (admin only) — supports password reset
 * @route   PUT /api/admin/salons/:id/users/:userId
 * @access  Private/Admin
 */
exports.updateSalonStaff = async (req, res, next) => {
  try {
    const staff = await User.findOne({ _id: req.params.userId, salon: req.params.id });

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable dans ce salon' });
    }

    if (req.body.name !== undefined) staff.name = req.body.name;
    if (req.body.email !== undefined) staff.email = req.body.email;
    if (req.body.telephone !== undefined) staff.telephone = req.body.telephone;
    if (req.body.password && req.body.password !== '') {
      staff.password = req.body.password; // hashed automatically by pre('save')
    }

    await staff.save();
    res.status(200).json({ success: true, data: { ...staff.toObject(), password: undefined } });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a staff member from a salon (admin only)
 * @route   DELETE /api/admin/salons/:id/users/:userId
 * @access  Private/Admin
 */
exports.deleteSalonStaff = async (req, res, next) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.userId, salon: req.params.id, role: 'staff' });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Membre du staff introuvable' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
