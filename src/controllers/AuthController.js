const User = require('../models/User');
const Salon = require('../models/Salon');
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
  const sassUrl = process.env.FRONTEND_URL || 'https://app.westdigitalhub.com';
  const marketplaceUrl = process.env.FRONTEND_URL_MARKETPLACE || 'https://beautyflowafrica.com';
  const { code, state } = req.query;
  const targetRedirectUrl = state || `${sassUrl}/pro/onboarding`;

  try {
    if (!code) {
      const defaultUrl = `${sassUrl}/pro/onboarding`;
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
    const defaultUrl = `${sassUrl}/pro/onboarding`;
    const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;
    const separator = safeRedirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${safeRedirectUrl}${separator}token=${jwtToken}&salonExists=${salonExists}`);

  } catch (err) {
    console.error('Erreur google callback:', err);
    const defaultUrl = `${sassUrl}/pro/onboarding`;
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
