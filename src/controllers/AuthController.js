const User = require('../models/User');
const Affiliate = require('../models/Affiliate');
const Salon = require('../models/Salon');
const { sendAffiliateVerificationEmail } = require('../services/email.service');
const { OAuth2Client } = require('google-auth-library');
const { isSafeRedirect } = require('../utils/security');
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || 'dummy_client_id_for_dev',
  process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret_for_dev',
  process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/google/callback`
);

/**
 * Construit la réponse de session à renvoyer au frontend
 */
const buildSessionResponse = (user, salon, token) => {
const ownerPermissions = [
  'clients:read', 'clients:write', 'clients:delete',
  'prestations:read', 'prestations:write', 'prestations:delete',
  'produits:read', 'produits:write', 'produits:delete',
  'ventes:read', 'ventes:write', 'ventes:delete',
  'depenses:read', 'depenses:write', 'depenses:delete',
  'staff:read', 'staff:write', 'staff:delete',
  'salon:read', 'salon:write',
];

const permissions = {
  owner: ownerPermissions,
  co_owner: ownerPermissions,
  staff: [
    'clients:read', 'clients:write',
    'prestations:read',
    'produits:read',
    'ventes:read', 'ventes:write',
  ],
  affiliate: [
    'affiliate:read',
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
      ville: user.ville || '',
      pays: user.pays || 'CM',
      affiliateCode: user.affiliateCode || null,
      affiliateEarnings: user.affiliateEarnings || 0,
      payoutConfig: user.payoutConfig || null,
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
};

exports.buildSessionResponse = buildSessionResponse;

// @desc    Login
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }
    let user = await User.findOne({ email }).select('+password').populate('salon');
    if (!user) {
      user = await Affiliate.findOne({ email }).select('+password');
    }
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
    if (user.role !== 'admin' && user.role !== 'affiliate') {
      if (!user.salon) {
        return res.status(403).json({
          success: false,
          message: "Aucun salon n'est associé à ce compte. Veuillez finaliser votre inscription ou contacter le support.",
        });
      }

      // Vérification que le salon existe réellement en base (cas de salon supprimé)
      const Salon = require('../models/Salon');
      const salonDoc = await Salon.findById(user.salon._id || user.salon);
      if (!salonDoc) {
        return res.status(403).json({
          success: false,
          message: "Salon introuvable — ce salon n'existe plus dans le système. Veuillez contacter le support.",
        });
      }

      const salon = salonDoc;
      if (!salon.isActive || new Date() > new Date(salon.abonnement?.dateFin)) {
        return res.status(403).json({
          success: false,
          message: 'Abonnement expiré — veuillez contacter Beautyflow',
        });
      }
    }

    // Mise à jour de la dernière connexion
    user.derniereConnexion = new Date();
    console.log('Tentative de login pour email:', email);
    await user.save();

    const token = user.getSignedJwtToken();
    const salon = user.role === 'admin' ? null : user.salon;
    console.log('Login réussi pour email:', salon ? `${email} (Salon: ${salon.name})` : email);
    res.status(200).json({
      success: true,
      ...buildSessionResponse(user, salon, token),
    });
  } catch (err) {
    console.error('Erreur lors du login:', err);
    next(err);
  }
};

// @desc    Login admin uniquement — rejette les non-admins avant d'émettre un token
// @route   POST /api/auth/admin-login
// @access  Public
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email }).select('+password');
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

    // Refus explicite des non-admins côté backend
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès administrateur requis' });
    }

    user.derniereConnexion = new Date();
    await user.save();

    const token = user.getSignedJwtToken();
    console.log('Admin login réussi pour:', email);

    res.status(200).json({
      success: true,
      ...buildSessionResponse(user, null, token),
    });
  } catch (err) {
    console.error('Erreur lors du admin-login:', err);
    next(err);
  }
};


// @desc    Récupérer l'utilisateur connecté
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    let user = await User.findById(req.user._id).populate('salon');
    if (!user) {
      user = await Affiliate.findById(req.user._id);
    }
    const salon = (user.role === 'admin' || user.role === 'affiliate') ? null : user.salon;
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

    let user = await User.findById(req.user._id).select('+password');
    if (!user) {
      user = await Affiliate.findById(req.user._id).select('+password');
    }
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
}
// @desc    Initiate Google OAuth Flow
// @route   GET /api/auth/google
// @access  Public
exports.initiateGoogleAuth = (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectParam = req.query.redirect || '';

    // Si pas de vrai CLIENT_ID en dev, ou s'il s'agit d'un secret, on utilise le mock direct
    const isMock = !clientId ||
      clientId === 'dummy_client_id_for_dev' ||
      clientId.startsWith('GOCSPX-') ||
      !clientId.includes('.apps.googleusercontent.com');

    if (isMock) {
      console.warn('⚠️ Google Client ID non configuré ou invalide (détecté comme clé secrète). Utilisation du mock en dev.');
      return res.redirect(`/api/auth/google/callback?code=mock_dev_code&state=${encodeURIComponent(redirectParam)}`);
    }

    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      state: redirectParam
    });

    res.redirect(url);
  } catch (err) {
    next(err);
  }
};


// @desc    Google OAuth Callback
// @route   GET /api/auth/google/callback
// @access  Public
exports.googleAuthCallback = async (req, res, next) => {
  const sassUrl = process.env.FRONTEND_URL || 'http://localhost:8080'; //'https://app.westdigitalhub.com';
  const marketplaceUrl = process.env.FRONTEND_URL_MARKETPLACE || 'https://beautyflowafrica.com';
  const { code, state } = req.query;
  const targetRedirectUrl = state || `${sassUrl}/`;

  try {
    if (!code) {
      const defaultUrl = `${sassUrl}/`;
      const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;
      const separator = safeRedirectUrl.includes('?') ? '&' : '?';
      return res.redirect(`${safeRedirectUrl}${separator}error=no_code`);
    }

    let payload;

    if (code === 'mock_dev_code') {
      // MOCK DEV FLOW
      payload = {
        email: 'test-pro@example.com',
        name: 'Pro Testeur',
        sub: 'mock_google_id_12345',
        picture: 'https://ui-avatars.com/api/?name=Pro+Testeur'
      };
    } else {
      // REAL GOOGLE FLOW
      const { tokens } = await client.getToken(code);
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    }

    const { email, name, sub: googleId, picture } = payload;

    // Detect if this is a marketplace user request
    const isMarketplace = targetRedirectUrl.includes('/explorer') || targetRedirectUrl.includes('/booking');

    if (isMarketplace) {
      const AppUser = require('../models/AppUser');
      let appUser = await AppUser.findOne({ email });

      if (!appUser) {
        const crypto = require('crypto');
        const randomPassword = crypto.randomBytes(16).toString('hex');

        appUser = await AppUser.create({
          nom: name,
          email: email,
          password: randomPassword,
          avatarUrl: picture,
          actif: true
        });
      } else {
        appUser.derniereConnexion = new Date();
        if (!appUser.avatarUrl && picture) {
          appUser.avatarUrl = picture;
        }
        await appUser.save();
      }

      const jwtToken = appUser.getSignedJwtToken();
      const defaultUrl = `${marketplaceUrl}/explorer/login`;
      const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;
      const separator = safeRedirectUrl.includes('?') ? '&' : '?';
      return res.redirect(`${safeRedirectUrl}${separator}token=${jwtToken}`);
    }

    let user = await User.findOne({ email }).populate('salon');

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId,
        avatarUrl: picture,
        role: 'owner',
        actif: true,
      });
    } else {
      let updated = false;
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      if (!user.avatarUrl && picture) {
        user.avatarUrl = picture;
        updated = true;
      }
      if (updated) await user.save();
    }

    user.derniereConnexion = new Date();
    await user.save();

    const jwtToken = user.getSignedJwtToken();
    const salonExists = user.salon ? 'true' : 'false';

    // Redirect to frontend with token
    const defaultUrl = `${sassUrl}/`;
    const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;
    const separator = safeRedirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${safeRedirectUrl}${separator}token=${jwtToken}&salonExists=${salonExists}`);

  } catch (err) {
    console.error('Erreur google callback:', err);
    const defaultUrl = `${sassUrl}/`;
    const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;
    const separator = safeRedirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${safeRedirectUrl}${separator}error=auth_failed`);
  }
};

// @desc    Google Token Login (POST /api/auth/google)
// @route   POST /api/auth/google
// @access  Public
exports.googleTokenLogin = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Google token required' });
    }

    let payload;

    if (token.startsWith('mock-') || token === 'mock_dev_code') {
      // MOCK DEV FLOW
      payload = {
        email: 'test-pro@example.com',
        name: 'Pro Testeur',
        sub: 'mock_google_id_12345',
        picture: 'https://ui-avatars.com/api/?name=Pro+Testeur'
      };
    } else {
      // REAL GOOGLE FLOW
      try {
        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID || 'dummy_client_id_for_dev',
        });
        payload = ticket.getPayload();
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Token Google invalide' });
      }
    }

    const { email, name, sub: googleId, picture } = payload;
    const targetRole = req.body.role === 'affiliate' ? 'affiliate' : 'owner';

    let user;
    if (targetRole === 'affiliate') {
      user = await Affiliate.findOne({ email });
    } else {
      user = await User.findOne({ email }).populate('salon');
    }

    if (!user) {
      if (targetRole === 'affiliate') {
        let affiliateCode = undefined;
        let codeExists = true;
        while (codeExists) {
          affiliateCode = 'BF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
          const existing = await Affiliate.findOne({ affiliateCode });
          if (!existing) codeExists = false;
        }

        user = await Affiliate.create({
          name,
          email,
          googleId,
          avatarUrl: picture,
          role: 'affiliate',
          affiliateCode,
          isEmailVerified: true,
          actif: true,
        });
      } else {
        user = await User.create({
          name,
          email,
          googleId,
          avatarUrl: picture,
          role: 'owner',
          actif: true,
        });
      }
    } else {
      let updated = false;
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      if (user.role === 'affiliate' && !user.isEmailVerified) {
        user.isEmailVerified = true;
        updated = true;
      }
      if (!user.avatarUrl && picture) {
        user.avatarUrl = picture;
        updated = true;
      }
      if (updated) await user.save();
    }

    user.derniereConnexion = new Date();
    await user.save();

    const jwtToken = user.getSignedJwtToken();
    const salon = user.role === 'admin' ? null : user.salon;

    res.status(200).json({
      success: true,
      ...buildSessionResponse(user, salon, jwtToken),
    });

  } catch (err) {
    console.error('Erreur googleTokenLogin:', err);
    next(err);
  }
};

// @desc    Register a new affiliate
// @route   POST /api/auth/affiliate/register
// @access  Public
exports.affiliateRegister = async (req, res, next) => {
  try {
    const { name, email, password, telephone, ville, pays } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Le nom, l\'email et le mot de passe sont requis' });
    }

    const userExists = await Affiliate.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });
    }

    // Generate unique affiliate code
    let affiliateCode;
    let codeExists = true;
    while (codeExists) {
      affiliateCode = 'BF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const existing = await Affiliate.findOne({ affiliateCode });
      if (!existing) codeExists = false;
    }

    // Generate 6-digit email verification code
    const emailVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await Affiliate.create({
      name,
      email,
      password,
      telephone,
      ville,
      pays: pays || 'CM',
      role: 'affiliate',
      affiliateCode,
      isEmailVerified: false,
      emailVerificationCode,
      actif: true
    });

    const token = user.getSignedJwtToken();

    // Trigger real transactional email sending via Nodemailer / SMTP
    sendAffiliateVerificationEmail({
      to: user.email,
      name: user.name,
      code: emailVerificationCode
    }).catch(err => {
      console.error('⚠️ [EMAIL SERVICE] Erreur lors de l\'envoi de l\'email de vérification:', err.message);
    });

    res.status(201).json({
      success: true,
      ...buildSessionResponse(user, null, token),
      emailVerificationCode
    });
  } catch (err) {
    console.error('Erreur lors de l\'inscription de l\'affilié:', err);
    next(err);
  }
};

// @desc    Verify affiliate email code
// @route   POST /api/auth/affiliate/verify-email
// @access  Private
exports.verifyAffiliateEmail = async (req, res, next) => {
  try {
    const { code } = req.body;
    const user = await Affiliate.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Affilié introuvable' });
    }

    if (user.isEmailVerified) {
      return res.status(200).json({ success: true, message: 'Email déjà vérifié avec succès' });
    }

    if (code && code.trim() === user.emailVerificationCode) {
      user.isEmailVerified = true;
      await user.save();
      return res.status(200).json({ success: true, message: 'Email vérifié avec succès !' });
    }

    return res.status(400).json({ success: false, message: 'Code de vérification invalide. Veuillez vérifier le code envoyé par email.' });
  } catch (err) {
    console.error('Erreur lors de la vérification de l\'email:', err);
    next(err);
  }
};

// @desc    Resend email verification code
// @route   POST /api/auth/affiliate/resend-email
// @access  Private
exports.resendAffiliateEmailCode = async (req, res, next) => {
  try {
    const user = await Affiliate.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Affilié introuvable' });
    }
    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Votre email est déjà vérifié' });
    }

    // Générer un NOUVEAU code à 6 chiffres à chaque renvoi
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = newCode;
    await user.save();

    // Déclencher l'envoi d'email avec capture d'erreur pour ne pas bloquer si le serveur SMTP est en cours de configuration
    sendAffiliateVerificationEmail({
      to: user.email,
      name: user.name,
      code: newCode
    }).catch(err => {
      console.error('⚠️ [EMAIL SERVICE] Erreur lors du renvoi du mail de vérification:', err.message);
      console.log(`💡 [FALLBACK OTP CODE] Code de vérification pour ${user.email} : ${newCode}`);
    });

    return res.status(200).json({
      success: true,
      message: `Un nouveau code de vérification à 6 chiffres a été envoyé à ${user.email}.`,
      emailVerificationCode: newCode
    });
  } catch (err) {
    console.error('Erreur lors du renvoi du code d\'email:', err);
    next(err);
  }
};

// @desc    Update payout configuration for affiliate
// @route   PUT /api/auth/affiliate/payout-config
// @access  Private
exports.updatePayoutConfig = async (req, res, next) => {
  try {
    const { payoutMomoNumber, payoutOperator, payoutMomoName } = req.body;

    if (req.user.role !== 'affiliate') {
      return res.status(403).json({ success: false, message: 'Réservé aux affiliés' });
    }

    const user = await Affiliate.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    user.payoutConfig = {
      payoutMomoNumber: payoutMomoNumber || '',
      payoutOperator: payoutOperator || '',
      payoutMomoName: payoutMomoName || ''
    };

    if (payoutMomoNumber && !user.telephone) {
      user.telephone = payoutMomoNumber;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Configuration de reversement mise à jour avec succès',
      data: user.payoutConfig
    });
  } catch (err) {
    console.error('Erreur updatePayoutConfig:', err);
    next(err);
  }
};

// @desc    Get affiliate referrals and earnings statistics
// @route   GET /api/auth/affiliate/stats
// @access  Private
exports.getAffiliateStats = async (req, res, next) => {
  try {
    if (req.user.role !== 'affiliate') {
      return res.status(403).json({ success: false, message: 'Réservé aux affiliés' });
    }

    const code = req.user.affiliateCode || null;

    // Get all salons with this affiliate code
    const salons = code ? await Salon.find({ affiliateCode: code }).populate('owner', 'name email telephone') : [];

    // Get all payout transactions for this user
    const PayoutTransaction = require('../models/PayoutTransaction');
    const payouts = await PayoutTransaction.find({ userId: req.user.id });

    // Compute stats
    let totalEarned = 0;
    let totalPending = 0;

    payouts.forEach(p => {
      if (p.statut === 'SUCCESSFUL') {
        totalEarned += p.montant;
      } else if (p.statut === 'PENDING' || p.statut === 'SUBMITTED') {
        totalPending += p.montant;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        code,
        partner: {
          name: req.user.name,
          email: req.user.email,
          isEmailVerified: Boolean(req.user.isEmailVerified),
          telephone: req.user.telephone || '',
          ville: req.user.ville || '',
          pays: req.user.pays || 'CM'
        },
        stats: {
          totalReferred: salons.length,
          activeReferred: salons.filter(s => s.isActive).length,
          totalEarned,
          totalPending
        },
        payouts: payouts.map(p => ({
          _id: p._id,
          montant: p.montant,
          statut: p.statut,
          failureReason: p.failureReason,
          createdAt: p.createdAt
        })),
        referrals: salons.map(s => ({
          _id: s._id,
          name: s.name,
          plan: s.plan,
          isActive: s.isActive,
          affiliatePaid: s.affiliatePaid,
          createdAt: s.createdAt,
          abonnement: s.abonnement
        }))
      }
    });
  } catch (err) {
    console.error('Erreur getAffiliateStats:', err);
    next(err);
  }
};

// @desc    Create custom or auto affiliate code
// @route   POST /api/auth/affiliate/create-code
// @access  Private
exports.createAffiliateCode = async (req, res, next) => {
  try {
    if (req.user.role !== 'affiliate') {
      return res.status(403).json({ success: false, message: 'Réservé aux affiliés' });
    }

    let { code } = req.body;

    if (code) {
      code = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (code.length < 3) {
        return res.status(400).json({ success: false, message: 'Le code doit contenir au moins 3 caractères (lettres ou chiffres)' });
      }

      const existing = await Affiliate.findOne({ affiliateCode: code });
      if (existing) {
        return res.status(400).json({ success: false, message: "Ce code d'affiliation est déjà utilisé par un autre partenaire." });
      }
    } else {
      let codeExists = true;
      while (codeExists) {
        code = 'BF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const existing = await Affiliate.findOne({ affiliateCode: code });
        if (!existing) codeExists = false;
      }
    }

    const user = await Affiliate.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Affilié non trouvé' });
    }

    user.affiliateCode = code;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Code d'affiliation créé avec succès",
      code
    });
  } catch (err) {
    console.error('Erreur createAffiliateCode:', err);
    next(err);
  }
};

// @desc    Update affiliate profile info
// @route   PUT /api/auth/affiliate/profile
// @access  Private
exports.updateAffiliateProfile = async (req, res, next) => {
  try {
    if (req.user.role !== 'affiliate') {
      return res.status(403).json({ success: false, message: 'Réservé aux affiliés' });
    }

    const { telephone, ville, pays } = req.body;

    const user = await Affiliate.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Affilié non trouvé' });
    }

    if (telephone) user.telephone = telephone;
    if (ville) user.ville = ville;
    if (pays) user.pays = pays;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: {
        telephone: user.telephone,
        ville: user.ville,
        pays: user.pays
      }
    });
  } catch (err) {
    console.error('Erreur updateAffiliateProfile:', err);
    next(err);
  }
};
