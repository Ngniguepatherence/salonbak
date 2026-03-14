const User = require('../models/User');
const Salon = require('../models/Salon');

/**
 * Construit la réponse de session à renvoyer au frontend
 */
function buildSessionResponse(user, salon, token) {
  const permissions = {
    owner: [
      'clients:read', 'clients:write', 'clients:delete',
      'prestations:read', 'prestations:write', 'prestations:delete',
      'produits:read', 'produits:write', 'produits:delete',
      'ventes:read', 'ventes:write', 'ventes:delete',
      'depenses:read', 'depenses:write', 'depenses:delete',
      'staff:read', 'staff:write', 'staff:delete',
      'salon:read', 'salon:write',
    ],
    staff: [
      'clients:read', 'clients:write',
      'prestations:read',
      'produits:read',
      'ventes:read', 'ventes:write',
    ],
  };

  return {
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      telephone: user.telephone,
      avatarUrl: user.avatarUrl,
      salon: user.salon,
    },
    salon: salon || null,
    session: {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      permissions: permissions[user.role] || [],
      salonId: salon?._id || null,
      salonName: salon?.name || null,
      token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    },
  };
}

// @desc    Login
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
   
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email }).select('+password').populate('salon');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
    }

    if (!user.actif) {
      return res.status(403).json({ success: false, message: 'Compte désactivé' });
    }
     
    // Vérification abonnement pour owner/staff
    if (user.role !== 'admin' && user.salon) {
      const salon = user.salon;
      if (!salon.isActive || new Date() > new Date(salon.abonnement?.dateFin)) {
        return res.status(403).json({
          success: false,
          message: 'Abonnement expiré — veuillez contacter LeaderBright',
        });
      }
    }
    
    // Mise à jour de la dernière connexion
    user.derniereConnexion = new Date();
    console.log('Tentative de login pour email:', email);
    await user.save();
    
    const token = user.getSignedJwtToken();
    const salon = user.role === 'admin' ? null : user.salon;

    res.status(200).json({
      success: true,
      ...buildSessionResponse(user, salon, token),
    });
  } catch (err) {
   console.error('Erreur lors du login:', err);
   next(err);
  }
};

// @desc    Récupérer l'utilisateur connecté
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('salon');
    const salon = user.role === 'admin' ? null : user.salon;
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      ...buildSessionResponse(user, salon, token),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Changer son mot de passe
// @route   PUT /api/auth/password
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Les deux mots de passe sont requis' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }

    user.password = newPassword;
    await user.save();

    const token = user.getSignedJwtToken();
    res.status(200).json({ success: true, token });
  } catch (err) {
    next(err);
  }
};