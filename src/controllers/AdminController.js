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
    const { isActive, statutAbonnement, plan } = req.body;

    const salon = await Salon.findById(req.params.id);

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon non trouvé' });
    }

    if (isActive !== undefined) {
      salon.isActive = isActive;
    }

    if (statutAbonnement !== undefined) {
      salon.abonnement.statut = statutAbonnement;
    }

    if (plan !== undefined) {
      const { PLANS } = require('../config/plans');
      salon.plan = plan;
      const config = PLANS[plan] || PLANS.basic;
      salon.limits = {
        maxCustomers: config.maxCustomers,
        maxStaff: config.maxStaff,
        maxCampaignsPerMonth: config.maxCampaignsPerMonth,
        exportEnabled: config.exportEnabled,
        campaignsEnabled: config.campaignsEnabled,
      };
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
      plan 
    } = req.body;

    // 1. Check if user already exists
    let user = await User.findOne({ email: ownerEmail });
    if (user) {
      return res.status(400).json({ success: false, message: 'Un utilisateur avec cet email existe déjà' });
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
    const { PLANS } = require('../config/plans');
    const config = PLANS[plan || 'basic'] || PLANS.basic;

    const salon = await Salon.create({
      name: salonName,
      phone: salonPhone,
      email: salonEmail,
      address: salonAddress,
      owner: user._id,
      plan: plan || 'basic',
      isActive: true,
      limits: {
        maxCustomers: config.maxCustomers,
        maxStaff: config.maxStaff,
        maxCampaignsPerMonth: config.maxCampaignsPerMonth,
        exportEnabled: config.exportEnabled,
        campaignsEnabled: config.campaignsEnabled,
      },
      abonnement: {
        statut: 'essai',
        dateDebut: Date.now(),
        dateFin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days trial
      }
    });

    // 4. Link salon back to user
    user.salon = salon._id;
    await user.save();

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
