const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Vérifie le token JWT et attache l'utilisateur à req.user
 */
exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Accès non autorisé — token manquant' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('salon', 'name isActive abonnement');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });
    }

    if (!user.actif) {
      return res.status(403).json({ success: false, message: 'Compte désactivé' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }
};

/**
 * Restreint l'accès à certains rôles
 * Usage : authorize('admin', 'owner')
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Le rôle '${req.user.role}' n'est pas autorisé à accéder à cette ressource`,
      });
    }
    next();
  };
};

/**
 * Vérifie que l'utilisateur appartient bien au salon demandé
 * (ou qu'il est admin global)
 */
exports.belongsToSalon = (req, res, next) => {
  const salonId = req.params.salonId;

  // if (req.user.role === 'admin') return next();

  const userSalonId = req.user.salon?._id?.toString() || req.user.salon?.toString();

  if (!userSalonId || userSalonId !== salonId) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé — vous n\'appartenez pas à ce salon',
    });
  }

  next();
};

/**
 * Vérifie que l'abonnement du salon est actif
 */
exports.requireActiveSubscription = (req, res, next) => {
  // if (req.user.role === 'admin') return next();

  const salon = req.user.salon;
  if (!salon || !salon.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Salon inactif ou abonnement expiré',
    });
  }

  const now = new Date();
  const dateFin = new Date(salon.abonnement?.dateFin);
  if (isNaN(dateFin) || now > dateFin) {
    return res.status(403).json({
      success: false,
      message: 'Abonnement expiré — veuillez contacter LeaderBright pour le renouvellement',
    });
  }

  next();
};