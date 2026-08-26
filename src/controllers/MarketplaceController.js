const AppUser = require('../models/AppUser');
const Salon = require('../models/Salon');
const Client = require('../models/Client');
const Rendezvous = require('../models/Rendezvous');
const TypePrestation = require('../models/TypePrestation');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SalonAnalyticsEvent = require('../models/SalonAnalyticsEvent');

const { OAuth2Client } = require('google-auth-library');
let redirectUriMarketplace = process.env.GOOGLE_REDIRECT_URI_MARKETPLACE || '';
if (!redirectUriMarketplace || redirectUriMarketplace.endsWith('/api/auth/google/callback')) {
  const base = process.env.BACKEND_URL;
  redirectUriMarketplace = `${base}/api/marketplace/auth/google/callback`;
}

const googleMarketplaceClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || 'dummy_client_id_for_dev',
  process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret_for_dev',
  redirectUriMarketplace
);
const { isSafeRedirect } = require('../utils/security');

const sendErrorResponse = (res, error) => {
  console.error(error);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Erreur interne du serveur' : error.message
  });
};
// 1. Auth: Register
exports.register = async (req, res) => {
  try {
    const { nom, email, password, telephone } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const userExists = await AppUser.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé.' });
    }

    const user = await AppUser.create({ nom, email, password, telephone });
    const token = user.getSignedJwtToken();

    // Populate empty favorites for correct format
    const populatedUser = await AppUser.findById(user._id).populate('favoris', 'name slug address logoUrl bannerUrl galleryUrls typeEtablissement');
    populatedUser.password = undefined;

    res.status(201).json({ success: true, token, user: populatedUser });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 2. Auth: Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Veuillez fournir un email et un mot de passe' });
    }

    const user = await AppUser.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }

    user.derniereConnexion = new Date();
    await user.save();

    // Populate favoris after saving to return the updated user with populated fields
    const populatedUser = await AppUser.findById(user._id).populate('favoris', 'name slug address logoUrl bannerUrl galleryUrls typeEtablissement');
    populatedUser.password = undefined; // hide password in response

    const token = user.getSignedJwtToken();

    res.status(200).json({ success: true, token, user: populatedUser });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 3. Auth: Get Me
exports.getMe = async (req, res) => {
  try {
    const user = await AppUser.findById(req.appUser.id).populate('favoris', 'name slug address logoUrl bannerUrl galleryUrls typeEtablissement');
    res.status(200).json({ success: true, user });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 3.1 Auth: Google Login
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy');

exports.googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    let payload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      if (token.startsWith('mock-')) {
        payload = {
          email: 'demo-google@gmail.com',
          name: 'Utilisateur Google',
          picture: 'https://ui-avatars.com/api/?name=Google+User&background=0D8ABC&color=fff',
          sub: 'mock-12345'
        };
      } else {
        return res.status(401).json({ success: false, message: 'Token Google invalide' });
      }
    }

    const { email, name, picture } = payload;
    let user = await AppUser.findOne({ email }).select('+password');

    if (!user) {
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(16).toString('hex');

      user = await AppUser.create({
        nom: name,
        email: email,
        password: randomPassword,
        avatarUrl: picture,
      });
    } else {
      user.derniereConnexion = new Date();
      await user.save();
    }

    const jwtToken = user.getSignedJwtToken();

    // Populate favoris to return the updated user with populated fields
    const populatedUser = await AppUser.findById(user._id).populate('favoris', 'name slug address logoUrl bannerUrl galleryUrls typeEtablissement');
    populatedUser.password = undefined;

    res.status(200).json({ success: true, token: jwtToken, user: populatedUser });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 3.1.2 Auth: Initiate Google OAuth Redirection for Marketplace AppUser
exports.initiateGoogleAuth = (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectParam = req.query.redirect || '';

    // Check if mock flow is needed (like in development or if client ID isn't configured)
    const isMock = !clientId ||
      clientId === 'dummy_client_id_for_dev' ||
      clientId.startsWith('GOCSPX-') ||
      !clientId.includes('.apps.googleusercontent.com');

    if (isMock) {
      console.warn('⚠️ Google Client ID non configuré ou invalide. Utilisation du mock en dev pour le marketplace.');
      return res.redirect(`/api/marketplace/auth/google/callback?code=mock_dev_code&state=${encodeURIComponent(redirectParam)}`);
    }

    const url = googleMarketplaceClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      state: redirectParam
    });

    res.redirect(url);
  } catch (err) {
    sendErrorResponse(res, err);
  }
};

// 3.1.3 Auth: Google OAuth Callback for Marketplace AppUser
exports.googleAuthCallback = async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL_MARKETPLACE || 'https://beautyflowafrica.com';
  const { code, state } = req.query;
  const targetRedirectUrl = state || `${frontendUrl}/explorer/login`;

  try {
    const defaultUrl = `${frontendUrl}/explorer/login`;
    const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;

    if (!code) {
      const separator = safeRedirectUrl.includes('?') ? '&' : '?';
      return res.redirect(`${safeRedirectUrl}${separator}error=no_code`);
    }

    let payload;

    if (code === 'mock_dev_code') {
      payload = {
        email: 'test-client-google@example.com',
        name: 'Utilisateur Google',
        picture: 'https://ui-avatars.com/api/?name=Google+User&background=0D8ABC&color=fff',
        sub: 'mock_google_marketplace_12345'
      };
    } else {
      const { tokens } = await googleMarketplaceClient.getToken(code);
      const ticket = await googleMarketplaceClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    }

    const { email, name, picture } = payload;
    let user = await AppUser.findOne({ email });

    if (!user) {
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(16).toString('hex');

      user = await AppUser.create({
        nom: name,
        email: email,
        password: randomPassword,
        avatarUrl: picture,
      });
    } else {
      user.derniereConnexion = new Date();
      if (!user.avatarUrl && picture) {
        user.avatarUrl = picture;
      }
      await user.save();
    }

    const jwtToken = user.getSignedJwtToken();

    // Redirect to frontend with token parameter
    const separator = safeRedirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${safeRedirectUrl}${separator}token=${jwtToken}`);

  } catch (err) {
    console.error('Erreur google marketplace callback:', err);
    const defaultUrl = `${frontendUrl}/explorer/login`;
    const safeRedirectUrl = isSafeRedirect(targetRedirectUrl) ? targetRedirectUrl : defaultUrl;
    const separator = safeRedirectUrl.includes('?') ? '&' : '?';
    res.redirect(`${safeRedirectUrl}${separator}error=auth_failed`);
  }
};


// 3.2 Auth: Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { nom, telephone, avatarUrl } = req.body;
    const user = await AppUser.findById(req.appUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    if (nom) user.nom = nom;
    if (telephone !== undefined) user.telephone = telephone;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    await user.save();

    // Populate favoris to return the updated user with populated fields
    const populatedUser = await AppUser.findById(req.appUser.id).populate('favoris', 'name slug address logoUrl bannerUrl galleryUrls typeEtablissement');

    res.status(200).json({ success: true, user: populatedUser });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 3.3 Auth: Toggle Favorite
exports.toggleFavorite = async (req, res) => {
  try {
    const { salonId } = req.body;
    if (!salonId) {
      return res.status(400).json({ success: false, message: 'ID du salon requis' });
    }

    const user = await AppUser.findById(req.appUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    user.favoris = user.favoris || [];
    const exists = user.favoris.some(id => id && id.toString() === salonId.toString());
    if (exists) {
      user.favoris = user.favoris.filter(id => id && id.toString() !== salonId.toString());
    } else {
      user.favoris.push(salonId);
    }

    await user.save();

    // Populate favoris with bannerUrl and galleryUrls as well
    const updatedUser = await AppUser.findById(req.appUser.id).populate('favoris', 'name slug address logoUrl bannerUrl galleryUrls typeEtablissement');
    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};


// 4. Salons: List
exports.getSalons = async (req, res) => {
  try {
    const { country, pays } = req.query;
    const query = { isActive: { $ne: false }, isHidden: { $ne: true }, hidden: { $ne: true } };

    const countryFilter = country || pays;
    if (countryFilter && countryFilter !== 'all') {
      query.pays = { $regex: new RegExp(`^${countryFilter}$`, 'i') };
    }

    // Return active and non-hidden salons matching query
    const salons = await Salon.find(query)
      .select('name slug address ville pays devise typeEtablissement logoUrl bannerUrl galleryUrls description phone email availability horaires location isHidden hidden branding businessType freelanceSettings bookingSettings rating reviewCount isSponsored');

    const data = salons.map(s => {
      const obj = s.toObject();
      if (!obj.slug) obj.slug = String(obj._id);
      return obj;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 5. Salons: Get by slug
exports.getSalonBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const isObjectId = slug && slug.match(/^[0-9a-fA-F]{24}$/);

    const orConditions = [
      { slug: slug },
      { oldSlugs: slug }
    ];
    if (isObjectId) {
      orConditions.unshift({ _id: slug });
    } else if (slug) {
      const cleanName = slug.replace(/-/g, ' ');
      orConditions.push({ name: { $regex: new RegExp(`^${cleanName}$`, 'i') } });
    }

    const query = {
      $or: orConditions,
      isActive: { $ne: false }
    };

    let salon = await Salon.findOne(query);

    // Fallback: search without isActive restriction or by direct ID
    if (!salon && isObjectId) {
      salon = await Salon.findById(slug);
    }
    if (!salon) {
      salon = await Salon.findOne({ $or: orConditions });
    }

    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    const effectiveSlug = salon.slug || String(salon._id);
    const isCanonical = effectiveSlug === slug;
    const redirectUrl = isCanonical ? null : `/booking/${effectiveSlug}`;

    if (salon.isHidden || salon.hidden) {
      return res.status(200).json({
        success: true,
        data: {
          ...salon.toObject(),
          slug: effectiveSlug,
          isHidden: true,
          hidden: true,
          prestations: [],
          staff: [],
          isCanonical,
          redirectUrl
        }
      });
    }

    await salon.checkSubscriptionTransition();

    // Fetch prestations for this salon
    const prestations = await TypePrestation.find({ salon: salon._id, actif: { $ne: false } });

    // Fetch team (staff/owner/co_owner) for this salon
    const team = await User.find({ salon: salon._id, actif: { $ne: false }, role: { $in: ['staff', 'owner', 'co_owner'] } });
    const staff = team.map(member => ({
      id: member._id,
      nom: member.name,
      role: member.role === 'owner' ? 'Propriétaire' : member.role === 'co_owner' ? 'Co-propriétaire' : 'Staff',
      photoUrl: member.avatarUrl || null,
      specialties: [],
      availability: member.availability || null
    }));

    res.status(200).json({ 
      success: true, 
      data: { 
        ...salon.toObject(), 
        slug: effectiveSlug,
        prestations, 
        staff,
        isCanonical,
        redirectUrl
      } 
    });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 6. Bookings: Create a new booking
exports.createBooking = async (req, res) => {
  try {
    const { salonId, typePrestationId, typePrestationIds, date, heure, notes, telephoneClient, nomClient, employe, paymentMode } = req.body;

    const salon = await Salon.findById(salonId);
    if (!salon) return res.status(404).json({ success: false, message: 'Salon introuvable' });

    await salon.checkSubscriptionTransition();

    let normalizedIds = typePrestationIds;
    if (!Array.isArray(normalizedIds) && typePrestationId) {
      normalizedIds = [typePrestationId];
    }
    if (!normalizedIds || normalizedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Veuillez sélectionner au moins une prestation' });
    }

    const prestations = await TypePrestation.find({ _id: { $in: normalizedIds } });
    if (!prestations || prestations.length === 0) {
      return res.status(404).json({ success: false, message: 'Prestation(s) introuvable(s)' });
    }

    const totalDuration = prestations.reduce((sum, p) => sum + (p.duree || 30), 0);
    const basePrice = prestations.reduce((sum, p) => {
      const priceNum = parseInt(p.prix.replace(/\D/g, ''), 10) || 0;
      return sum + priceNum;    // Ensure Client exists for this salon
    }, 0);
    let clientPhone = telephoneClient || (req.appUser ? req.appUser.telephone : null);
    if (!clientPhone) {
      return res.status(400).json({ success: false, message: 'Un numéro de téléphone est requis pour réserver.' });
    }

    const cleanPhoneDigits = clientPhone.replace(/\D/g, '').slice(-9);

    // Sync appUser telephone if missing
    if (req.appUser && (!req.appUser.telephone || req.appUser.telephone.trim() === '')) {
      req.appUser.telephone = clientPhone;
      await req.appUser.save();
    }

    // Cherche le client dans ce salon via son numéro de téléphone ou appUser
    const clientQuery = [{ salon: salon._id, telephone: clientPhone }];
    if (cleanPhoneDigits.length >= 8) {
      clientQuery.push({ salon: salon._id, telephone: { $regex: cleanPhoneDigits + '$' } });
    }
    if (req.appUser) {
      clientQuery.push({ salon: salon._id, appUser: req.appUser._id });
    }

    let client = await Client.findOne({ $or: clientQuery });

    const parrainPhone = req.body.parrainPhone;
    let parrain = null;
    if (parrainPhone && parrainPhone !== clientPhone) {
      const parrainDigits = parrainPhone.replace(/\D/g, '').slice(-9);
      parrain = await Client.findOne({
        salon: salon._id,
        $or: [
          { telephone: parrainPhone },
          { telephone: { $regex: parrainDigits + '$' } }
        ]
      });
    }

    if (!client) {
      // Check customer limit (maxCustomers) for salon
      const { limits } = salon;
      const currentLimit = limits?.maxCustomers ?? -1;
      let canCreateClient = true;
      if (currentLimit !== -1) {
        const currentCount = await Client.countDocuments({ salon: salon._id });
        if (currentCount >= currentLimit) {
          canCreateClient = false;
        }
      }

      if (canCreateClient) {
        // Create Client only if limit is not reached
        client = await Client.create({
          nom: req.body.nomClient || (req.appUser ? req.appUser.nom : null) || 'Client App',
          telephone: clientPhone,
          salon: salon._id,
          appUser: req.appUser ? req.appUser._id : null,
          parrainId: parrain ? parrain._id : null
        });

        if (parrain) {
          parrain.pointsFidelite = (parrain.pointsFidelite || 0) + 3;
          parrain.nombreFilleuls = (parrain.nombreFilleuls || 0) + 1;
          await parrain.save();
        }
      }
    } else {
      let clientModified = false;
      if (req.appUser && !client.appUser) {
        client.appUser = req.appUser._id;
        clientModified = true;
      }
      if (parrain && !client.parrainId) {
        client.parrainId = parrain._id;
        parrain.pointsFidelite = (parrain.pointsFidelite || 0) + 3;
        parrain.nombreFilleuls = (parrain.nombreFilleuls || 0) + 1;
        await parrain.save();
        clientModified = true;
      }
      if (clientModified) {
        await client.save();
      }
    }

    // Check appointments limit
    if (salon.limits && salon.limits.maxRendezvous !== undefined && salon.limits.maxRendezvous !== -1) {
      const currentCount = await Rendezvous.countDocuments({ salon: salon._id });
      if (currentCount >= salon.limits.maxRendezvous) {
        return res.status(403).json({
          success: false,
          message: 'Désolé, ce salon a atteint sa limite de rendez-vous pour son plan actuel.'
        });
      }
    }

    // Validation des disponibilités et attribution de l'employé
    const timeToMinutes = (t) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const dateObj = new Date(date);
    const dayOfWeek = String(dateObj.getDay()); // "0" = Dimanche, "1" = Lundi, etc.

    const slotDuration = totalDuration;
    const bookingStartMin = timeToMinutes(heure);
    const bookingEndMin = bookingStartMin + slotDuration;

    // Récupérer les collaborateurs actifs du salon (staff + owner + co_owner)
    const team = await User.find({ salon: salon._id, actif: true, role: { $in: ['staff', 'owner', 'co_owner'] } });

    // Récupérer les rendez-vous existants de la journée pour vérifier les chevauchements
    const dayBookings = await Rendezvous.find({
      salon: salon._id,
      date,
      statut: { $ne: 'annule' }
    });

    let assignedEmployeId = null;

    if (employe) {
      // Vérifier que le collaborateur sélectionné existe et appartient au salon
      const chosenStaff = team.find(member => member._id.toString() === employe.toString());
      if (!chosenStaff) {
        return res.status(400).json({ success: false, message: 'Collaborateur sélectionné introuvable.' });
      }

      // Vérifier si le collaborateur travaille ce jour-là
      const memberAvailability = chosenStaff.availability || salon.availability || null;
      if (memberAvailability && memberAvailability[dayOfWeek]) {
        const daySched = memberAvailability[dayOfWeek];
        if (!daySched.open) {
          return res.status(400).json({ success: false, message: 'Le collaborateur sélectionné ne travaille pas ce jour.' });
        }
        const startMin = timeToMinutes(daySched.start || '08:00');
        const endMin = timeToMinutes(daySched.end || '19:00');
        if (bookingStartMin < startMin || bookingEndMin > endMin) {
          return res.status(400).json({ success: false, message: 'Créneau en dehors des horaires de travail du collaborateur.' });
        }
      }

      // Vérifier si le collaborateur a déjà un rendez-vous sur cette plage
      const hasOverlap = dayBookings.some(appt => {
        if (!appt.employe || appt.employe.toString() !== chosenStaff._id.toString()) return false;
        const apptStartMin = timeToMinutes(appt.heure);
        const apptEndMin = apptStartMin + (appt.duree || 30);
        return bookingStartMin < apptEndMin && bookingEndMin > apptStartMin;
      });

      if (hasOverlap) {
        return res.status(400).json({ success: false, message: 'Le collaborateur sélectionné est déjà occupé à ce créneau.' });
      }

      assignedEmployeId = chosenStaff._id;
    } else {
      // "Sans préférence" -> Trouver le premier disponible
      const availableStaff = team.filter(member => {
        // 1. Vérifier si le collaborateur travaille ce jour-là
        const memberAvailability = member.availability || salon.availability || null;
        if (memberAvailability && memberAvailability[dayOfWeek]) {
          const daySched = memberAvailability[dayOfWeek];
          if (!daySched.open) return false;
          const startMin = timeToMinutes(daySched.start || '08:00');
          const endMin = timeToMinutes(daySched.end || '19:00');
          if (bookingStartMin < startMin || bookingEndMin > endMin) return false;
        }

        // 2. Vérifier les chevauchements
        const hasOverlap = dayBookings.some(appt => {
          if (!appt.employe || appt.employe.toString() !== member._id.toString()) return false;
          const apptStartMin = timeToMinutes(appt.heure);
          const apptEndMin = apptStartMin + (appt.duree || 30);
          return bookingStartMin < apptEndMin && bookingEndMin > apptStartMin;
        });

        return !hasOverlap;
      });

      if (availableStaff.length === 0) {
        return res.status(400).json({ success: false, message: 'Aucun collaborateur n\'est disponible à ce créneau.' });
      }

      // Assigner automatiquement le premier disponible
      assignedEmployeId = availableStaff[0]._id;
    }

    // Calculate commission if payment mode is onsite
    const isOnsite = paymentMode === 'onsite';
    const commissionRate = 0.10; // 10% commission on onsite bookings
    const commissionAmount = isOnsite ? Math.floor(basePrice * commissionRate) : 0;

    // Create Rendezvous
    const clientName = req.body.nomClient || (req.appUser ? req.appUser.nom : null) || 'Client App';
    const rendezVous = await Rendezvous.create({
      salon: salon._id,
      client: client ? client._id : undefined,
      customerName: clientName,
      customerPhone: clientPhone,
      customerEmail: req.body.emailClient || (req.appUser ? req.appUser.email : null) || '',
      typePrestation: normalizedIds[0],
      prestations: normalizedIds,
      employe: assignedEmployeId,
      date,
      heure,
      duree: totalDuration,
      statut: isOnsite ? 'confirme' : 'en_attente',
      source: 'en_ligne',
      paymentMode: isOnsite ? 'onsite' : 'online',
      commissionAmount,
      commissionPaid: false,
      notes,
    });

    // Enregistrer la visite dans l'historique de l'AppUser
    if (req.appUser) {
      req.appUser.visits = req.appUser.visits || [];
      req.appUser.visits.push({
        salonSlug: salon.slug,
        salonNom: salon.nom || salon.name,
        visitedAt: new Date()
      });
      await req.appUser.save();
    }

    // Créer des notifications pour le propriétaire et l'employé assigné
    try {
      const prestationNames = prestations.map(p => p.nom || p.name).join(', ');
      const notifData = {
        salon: salon._id,
        type: 'booking',
        title: 'Nouveau rendez-vous en ligne',
        description: `Le client ${client.nom || 'Client App'} a réservé pour la/les prestation(s) "${prestationNames}" le ${date} à ${heure}.`
      };

      // 1. Notifier le Owner
      if (salon.owner) {
        await Notification.create({
          ...notifData,
          user: salon.owner
        });
      }

      // 2. Notifier l'employé (si différent de l'owner)
      if (assignedEmployeId && (!salon.owner || assignedEmployeId.toString() !== salon.owner.toString())) {
        await Notification.create({
          ...notifData,
          user: assignedEmployeId
        });
      }
    } catch (notifErr) {
      console.error('Erreur création notification booking:', notifErr.message);
    }

    const populatedRendezVous = await Rendezvous.findById(rendezVous._id)
      .populate('salon', 'name nom slug logoUrl address ville branding')
      .populate('prestations', 'nom prix description duree')
      .populate('typePrestation', 'nom prix description duree')
      .populate('employe', 'nom telephone avatarUrl');

    res.status(201).json({
      success: true,
      message: 'Rendez-vous créé avec succès',
      data: populatedRendezVous
    });
  } catch (err) {
    next(err);
  }
};

// 7. Bookings: Get appointments/busy slots for a day
exports.getSalonAppointments = async (req, res) => {
  try {
    const { slug } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ success: false, message: 'La date est requise (YYYY-MM-DD)' });
    }

    const isObjectId = slug.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: slug } : { slug: slug };
    query.isActive = true;

    const salon = await Salon.findOne(query);
    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    // Récupérer tous les rendez-vous du salon à cette date qui ne sont pas annulés
    const appointments = await Rendezvous.find({
      salon: salon._id,
      date,
      statut: { $ne: 'annule' }
    }).select('heure duree employe');

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 5.1 Salons: Get Share Preview & Full SSR HTML for Bots & Search Engines
exports.getSalonSharePreview = async (req, res) => {
  try {
    const slug = req.params.slug;
    const isObjectId = slug.match(/^[0-9a-fA-F]{24}$/);

    const query = isObjectId 
      ? { $or: [{ _id: slug }, { slug: slug }, { oldSlugs: slug }] } 
      : { $or: [{ slug: slug }, { oldSlugs: slug }] };

    const salon = await Salon.findOne(query);
    if (!salon) {
      return res.status(404).send('Salon introuvable');
    }

    const salonName = salon.name || salon.nom || 'Salon';
    const city = salon.ville || '';
    const address = salon.address || '';
    const country = salon.pays || 'CM';

    // Fetch prestations for full SEO rendering
    const prestations = await TypePrestation.find({ salon: salon._id, actif: true });

    // Resolve language
    const acceptLang = req.headers['accept-language'] || '';
    const queryLang = req.query.lang || '';
    let isEnglish = queryLang.startsWith('en') ||
      (!queryLang.startsWith('fr') && acceptLang.toLowerCase().startsWith('en'));

    const titleCity = city ? ` à ${city}` : '';
    const title = `${salonName}${titleCity} | Coiffure, Beauté, Tarifs & Rendez-vous | BeautyFlow Africa`;
    const defaultDesc = isEnglish
      ? `Book an appointment at ${salonName}${titleCity}. View opening hours, prices, verified customer reviews and book 24/7 on BeautyFlow Africa.`
      : `Réservez votre rendez-vous chez ${salonName}${titleCity}. Consultez les prestations, tarifs, horaires, avis clients vérifiés et réservez en ligne 24h/24 sur BeautyFlow Africa.`;

    const description = salon.description || defaultDesc;

    // Extract best salon image
    let rawImage = salon.branding?.bannerUrl || 
      salon.bannerUrl || 
      (salon.galleryUrls && salon.galleryUrls[0]) || 
      (salon.branding?.gallery && salon.branding.gallery[0]) || 
      (salon.photos && salon.photos[0]) || 
      salon.branding?.logoUrl || 
      salon.logoUrl || 
      salon.logo || 
      '';

    const baseUrl = (process.env.BACKEND_URL || 'https://beautyflowafrica.com').replace(/\/+$/, '');
    const frontendUrl = (process.env.FRONTEND_URL_MARKETPLACE || process.env.FRONTEND_URL || 'https://beautyflowafrica.com').replace(/\/+$/, '');

    let previewImage = rawImage;
    if (previewImage && previewImage.startsWith('data:')) {
      previewImage = '';
    }
    if (previewImage && !previewImage.startsWith('http://') && !previewImage.startsWith('https://')) {
      const cleanPath = previewImage.startsWith('/') ? previewImage : `/${previewImage}`;
      previewImage = `${baseUrl}${cleanPath}`;
    }
    if (!previewImage) {
      previewImage = `${frontendUrl}/beautyflow-banner.png`;
    }

    const canonicalUrl = `${frontendUrl}/salon/${salon.slug || slug}`;
    const citySlug = city.toLowerCase().trim().replace(/\s+/g, '-');
    const cityUrl = city ? `${frontendUrl}/salons/${citySlug}` : `${frontendUrl}/explorer`;

    // Determine Schema.org type
    const typeLower = (salon.typeEtablissement || '').toLowerCase();
    let schemaType = 'BeautySalon';
    let humanCategory = 'Salon de Beauté';
    if (typeLower.includes('coiffure') || typeLower.includes('hair')) {
      schemaType = 'HairSalon';
      humanCategory = 'Salon de Coiffure';
    } else if (typeLower.includes('barber') || typeLower.includes('barbier')) {
      schemaType = 'Barbershop';
      humanCategory = 'Barber Shop';
    } else if (typeLower.includes('spa')) {
      schemaType = 'DaySpa';
      humanCategory = 'Spa & Bien-être';
    } else if (typeLower.includes('ongle') || typeLower.includes('nail')) {
      schemaType = 'NailSalon';
      humanCategory = 'Bar à Ongles / Onglerie';
    }

    // Calculate price range
    let priceRange = '$$';
    if (prestations && prestations.length > 0) {
      const numericPrices = prestations
        .map(p => typeof p.prix === 'number' ? p.prix : parseInt((p.prix || '').toString().replace(/\D/g, ''), 10))
        .filter(n => !isNaN(n) && n > 0);
      if (numericPrices.length > 0) {
        const minPrice = Math.min(...numericPrices);
        const maxPrice = Math.max(...numericPrices);
        const currency = salon.devise || 'FCFA';
        priceRange = `${minPrice.toLocaleString()} ${currency} - ${maxPrice.toLocaleString()} ${currency}`;
      }
    }

    // Build Schema.org JSON-LD LocalBusiness data
    const businessSchema = {
      "@context": "https://schema.org",
      "@type": schemaType,
      "@id": canonicalUrl,
      "name": salonName,
      "description": description,
      "url": canonicalUrl,
      "image": previewImage,
      "telephone": salon.phone || undefined,
      "email": salon.email || undefined,
      "priceRange": priceRange,
      "currenciesAccepted": salon.devise === 'FCFA' ? 'XAF, XOF, EUR, USD' : (salon.devise || 'XAF'),
      "paymentAccepted": "Cash, Orange Money, MTN Mobile Money, Moov Money, Wave, Carte Bancaire",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": address || undefined,
        "addressLocality": city || undefined,
        "addressCountry": country
      },
      "potentialAction": {
        "@type": "ReserveAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${canonicalUrl}/book`,
          "inLanguage": isEnglish ? "en" : "fr",
          "actionPlatform": [
            "http://schema.org/DesktopWebPlatform",
            "http://schema.org/MobileWebPlatform",
            "http://schema.org/IOSPlatform",
            "http://schema.org/AndroidPlatform"
          ]
        },
        "result": {
          "@type": "Reservation",
          "name": `Réservation en ligne chez ${salonName}`
        }
      }
    };

    if (salon.location && salon.location.lat && salon.location.lng) {
      businessSchema.geo = {
        "@type": "GeoCoordinates",
        "latitude": salon.location.lat,
        "longitude": salon.location.lng
      };
      businessSchema.hasMap = `https://www.google.com/maps/search/?api=1&query=${salon.location.lat},${salon.location.lng}`;
    }

    if (salon.horaires) {
      businessSchema.openingHours = salon.horaires;
    }

    if (prestations && prestations.length > 0) {
      businessSchema.hasOfferCatalog = {
        "@type": "OfferCatalog",
        "name": `Prestations & Tarifs ${salonName}`,
        "itemListElement": prestations.map(p => ({
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": p.nom || p.name,
            "description": p.description || undefined,
            "offers": {
              "@type": "Offer",
              "price": (p.prix || '').toString().replace(/\D/g, '') || undefined,
              "priceCurrency": salon.devise === 'FCFA' ? 'XAF' : (salon.devise || 'XAF')
            }
          }
        }))
      };
    }

    if (salon.rating && salon.reviewCount && salon.reviewCount > 0) {
      businessSchema.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": salon.rating,
        "reviewCount": salon.reviewCount,
        "bestRating": "5",
        "worstRating": "1"
      };
    }

    // BreadcrumbList Schema
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Accueil",
          "item": frontendUrl
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": city ? `Salons à ${city}` : "Explorer",
          "item": cityUrl
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": salonName,
          "item": canonicalUrl
        }
      ]
    };

    // FAQPage Schema for rich snippet indexing
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `Comment réserver un rendez-vous chez ${salonName} ?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Vous pouvez réserver directement et gratuitement votre rendez-vous chez ${salonName} en ligne sur BeautyFlow Africa 24h/24 et 7j/7 en choisissant vos prestations et votre créneau horaire.`
          }
        },
        {
          "@type": "Question",
          "name": `Où se trouve ${salonName}${titleCity} ?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `${salonName} est situé à l'adresse suivante : ${address ? address + (city ? ', ' + city : '') : (city || 'en Afrique')}.`
          }
        },
        {
          "@type": "Question",
          "name": `Quels sont les tarifs et moyens de paiement chez ${salonName} ?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Les tarifs des prestations chez ${salonName} s'échelonnent dans la fourchette ${priceRange}. Les paiements sont acceptés en espèces, Orange Money, MTN Mobile Money, Wave ou carte bancaire selon les modalités du salon.`
          }
        }
      ]
    };

    // Prestations HTML list
    const prestationsHtml = prestations.map(p => 
      `<li style="margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.05rem;">
          <span>${p.nom || p.name}</span>
          <span style="color: #e11d48;">${p.prix || ''}</span>
        </div>
        ${p.duree ? `<div style="font-size: 0.85rem; color: #64748b;">Durée: ${p.duree} minutes</div>` : ''}
        ${p.description ? `<div style="font-size: 0.9rem; color: #475569; margin-top: 4px;">${p.description}</div>` : ''}
      </li>`
    ).join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="BeautyFlow Africa">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${previewImage}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="business.business">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${previewImage}">

  <!-- Schema.org JSON-LD Structured Data -->
  <script type="application/ld+json">
${JSON.stringify(businessSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumbSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.6;">
  <nav style="font-size: 0.875rem; color: #64748b; margin-bottom: 20px;">
    <a href="${frontendUrl}" style="color: #e11d48; text-decoration: none;">Accueil</a> &gt; 
    <a href="${cityUrl}" style="color: #e11d48; text-decoration: none;">${city || 'Salons'}</a> &gt; 
    <span>${salonName}</span>
  </nav>

  <header style="margin-bottom: 28px; border-bottom: 2px solid #fecdd3; padding-bottom: 20px;">
    <h1 style="font-size: 2.2rem; margin: 0 0 10px 0; color: #0f172a;">${salonName}</h1>
    <p style="font-size: 1.1rem; color: #64748b; margin: 0 0 12px 0;">${humanCategory}${titleCity}</p>
    <div style="background: #fff1f2; border-left: 4px solid #e11d48; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;">
      <p style="margin: 0; font-size: 0.95rem;"><strong>📍 Adresse:</strong> ${address || 'Adresse disponible sur réservation'} ${city ? ' — ' + city : ''}</p>
      ${salon.phone ? `<p style="margin: 4px 0 0 0; font-size: 0.95rem;"><strong>📞 Téléphone:</strong> ${salon.phone}</p>` : ''}
      ${salon.rating && salon.rating > 0 ? `<p style="margin: 4px 0 0 0; font-size: 0.95rem;"><strong>⭐ Note clients:</strong> ${salon.rating} / 5 (${salon.reviewCount || 1} avis)</p>` : ''}
      <p style="margin: 4px 0 0 0; font-size: 0.95rem;"><strong>💳 Tarifs:</strong> ${priceRange}</p>
    </div>
    <p style="font-size: 1rem; color: #334155;">${description}</p>
    <p style="margin-top: 16px;">
      <a href="${canonicalUrl}/book" style="background: linear-gradient(135deg, #e11d48, #be123c); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.3);">
        📅 Réserver un rendez-vous chez ${salonName}
      </a>
    </p>
  </header>

  <main>
    <section style="margin-bottom: 32px;">
      <h2 style="font-size: 1.5rem; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Prestations et Tarifs</h2>
      <ul style="list-style: none; padding: 0;">
        ${prestationsHtml || '<li>Prestations et tarifs complets disponibles sur réservation en ligne.</li>'}
      </ul>
    </section>

    ${salon.horaires ? `
    <section style="margin-bottom: 32px;">
      <h2 style="font-size: 1.5rem; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Horaires d'ouverture</h2>
      <p style="background: #f8fafc; padding: 14px; border-radius: 6px;">${salon.horaires}</p>
    </section>` : ''}

    <section style="margin-bottom: 32px;">
      <h2 style="font-size: 1.5rem; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Questions Fréquentes (FAQ)</h2>
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 1.1rem; color: #1e293b; margin-bottom: 4px;">Comment réserver chez ${salonName} ?</h3>
        <p style="color: #475569; font-size: 0.95rem; margin: 0;">Sélectionnez vos soins et réservez gratuitement votre créneau en ligne 24h/7j sur BeautyFlow Africa sans attente téléphonique.</p>
      </div>
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 1.1rem; color: #1e293b; margin-bottom: 4px;">Quels sont les moyens de paiement acceptés ?</h3>
        <p style="color: #475569; font-size: 0.95rem; margin: 0;">Vous pouvez régler sur place ou via Mobile Money (Orange Money, MTN MoMo, Wave) ou carte bancaire.</p>
      </div>
    </section>
  </main>

  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; color: #94a3b8; text-align: center;">
    <p>© ${new Date().getFullYear()} BeautyFlow Africa — La plateforme numéro 1 de prise de rendez-vous beauté en Afrique.</p>
  </footer>

  <script>
    if (!navigator.userAgent.match(/(bot|googlebot|crawler|spider|slurp|bingbot|facebookexternalhit|whatsapp|twitterbot)/i)) {
      window.location.href = "${canonicalUrl}";
    }
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Error generating salon share preview:', error);
    res.status(500).send('Server Error');
  }
};

// GET /api/marketplace/salons/city-preview/:city or /:category/:city
exports.getCitySharePreview = async (req, res) => {
  try {
    const rawCity = req.params.city || '';
    const rawCategory = req.params.category || '';
    const city = rawCity.replace(/-/g, ' ').trim();
    const formattedCity = city ? city.charAt(0).toUpperCase() + city.slice(1).toLowerCase() : 'Afrique';

    const categoryLower = rawCategory.toLowerCase();
    let categoryTitle = 'Salons de Beauté et Coiffure';
    let humanCategory = 'salons de beauté et coiffure';
    let typeQueryFilter = {};

    if (categoryLower.includes('coiff') || categoryLower.includes('hair')) {
      categoryTitle = 'Coiffeurs et Salons de Coiffure';
      humanCategory = 'coiffeurs et salons de coiffure';
      typeQueryFilter = { typeEtablissement: { $in: ['salon_coiffure', 'mixte', 'autre'] } };
    } else if (categoryLower.includes('barber') || categoryLower.includes('barbier')) {
      categoryTitle = 'Barber Shops et Barbiers';
      humanCategory = 'barber shops et barbiers pour hommes';
      typeQueryFilter = { typeEtablissement: 'barbershop' };
    } else if (categoryLower.includes('soin') || categoryLower.includes('institut') || categoryLower.includes('spa')) {
      categoryTitle = 'Instituts de Beauté et Spas';
      humanCategory = 'instituts de beauté, soins et spas';
      typeQueryFilter = { typeEtablissement: { $in: ['institut_beaute', 'spa', 'onglerie'] } };
    }

    const cityRegex = new RegExp(city, 'i');
    const query = {
      isActive: true,
      isHidden: { $ne: true },
      hidden: { $ne: true },
      ...(city ? { ville: cityRegex } : {}),
      ...typeQueryFilter
    };

    const salons = await Salon.find(query)
      .select('name nom slug address ville pays rating reviewCount logoUrl bannerUrl galleryUrls typeEtablissement description horaires devise')
      .limit(50)
      .lean();

    const frontendUrl = (process.env.FRONTEND_URL_MARKETPLACE || process.env.FRONTEND_URL || 'https://beautyflowafrica.com').replace(/\/+$/, '');
    const canonicalPath = rawCategory ? `/${rawCategory}/${rawCity}` : `/salons/${rawCity || 'tous'}`;
    const canonicalUrl = `${frontendUrl}${canonicalPath}`;

    const title = `${categoryTitle} à ${formattedCity} (2026) : Avis, Tarifs & Réservation 24/7 | BeautyFlow Africa`;
    const description = `Trouvez les meilleurs ${humanCategory} à ${formattedCity}. Comparez les avis vérifiés, tarifs, photos, horaires et réservez instantanément votre rendez-vous en ligne sur BeautyFlow Africa.`;
    const previewImage = `${frontendUrl}/beautyflow-banner.png`;

    // Schema.org ItemList
    const itemListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": `${categoryTitle} à ${formattedCity}`,
      "description": description,
      "url": canonicalUrl,
      "numberOfItems": salons.length,
      "itemListElement": salons.map((s, idx) => {
        const sName = s.name || s.nom || 'Salon';
        const sUrl = `${frontendUrl}/salon/${s.slug}`;
        const sType = s.typeEtablissement === 'barbershop' ? 'Barbershop' : (s.typeEtablissement === 'institut_beaute' ? 'BeautySalon' : 'HairSalon');
        return {
          "@type": "ListItem",
          "position": idx + 1,
          "item": {
            "@type": sType,
            "@id": sUrl,
            "name": sName,
            "url": sUrl,
            "description": s.description || `${sName}, votre salon de beauté à ${s.ville || formattedCity}.`,
            "telephone": s.phone || undefined,
            "address": {
              "@type": "PostalAddress",
              "streetAddress": s.address || undefined,
              "addressLocality": s.ville || formattedCity,
              "addressCountry": s.pays || "CM"
            },
            ...(s.rating && s.rating > 0 ? {
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": s.rating,
                "reviewCount": s.reviewCount || 1,
                "bestRating": "5",
                "worstRating": "1"
              }
            } : {})
          }
        };
      })
    };

    // Breadcrumbs
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Accueil",
          "item": frontendUrl
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": `Salons ${formattedCity}`,
          "item": canonicalUrl
        }
      ]
    };

    // FAQ Schema
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `Quels sont les meilleurs salons de coiffure et beauté à ${formattedCity} ?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Parmi les établissements les plus réputés à ${formattedCity} sur BeautyFlow Africa : ${salons.slice(0, 5).map(s => s.name || s.nom).join(', ') || 'découvrez notre sélection vérifiée'}. Tous offrent la prise de rendez-vous en ligne avec avis clients certifiés.`
          }
        },
        {
          "@type": "Question",
          "name": `Comment réserver un coiffeur ou un institut de beauté à ${formattedCity} ?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Sur BeautyFlow Africa, choisissez votre salon à ${formattedCity}, sélectionnez vos prestations (coupe, tresses, coloration, soin du visage, manucure) et réservez votre créneau 24h/24 sans avoir besoin d'appeler.`
          }
        },
        {
          "@type": "Question",
          "name": `Combien coûte une coupe de cheveux ou un soin à ${formattedCity} ?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Les prix varient selon le type d'établissement et de prestation, généralement entre 2 000 FCFA et 40 000 FCFA. Les tarifs de chaque salon sont transparents et affichés sur leur fiche BeautyFlow.`
          }
        }
      ]
    };

    const salonsCardsHtml = salons.map(s => {
      const sName = s.name || s.nom || 'Salon';
      const sUrl = `${frontendUrl}/salon/${s.slug}`;
      const sImg = s.bannerUrl || (s.galleryUrls && s.galleryUrls[0]) || s.logoUrl || `${frontendUrl}/beautyflow-banner.png`;
      return `
      <article style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
        <h2 style="font-size: 1.35rem; margin: 0 0 6px 0;">
          <a href="${sUrl}" style="color: #0f172a; text-decoration: none;">${sName}</a>
        </h2>
        <p style="color: #e11d48; font-weight: 600; font-size: 0.9rem; margin: 0 0 8px 0;">
          ${s.typeEtablissement ? s.typeEtablissement.replace('_', ' ').toUpperCase() : 'SALON DE BEAUTÉ'}
        </p>
        <p style="color: #475569; font-size: 0.95rem; margin: 0 0 8px 0;">
          📍 <strong>Adresse:</strong> ${s.address || 'Adresse communiquée à la réservation'} (${s.ville || formattedCity})
        </p>
        ${s.rating && s.rating > 0 ? `<p style="color: #b45309; font-size: 0.95rem; margin: 0 0 8px 0;">⭐ <strong>${s.rating} / 5</strong> (${s.reviewCount || 1} avis clients)</p>` : ''}
        ${s.description ? `<p style="color: #64748b; font-size: 0.9rem; margin: 0 0 14px 0;">${s.description.slice(0, 160)}...</p>` : ''}
        <div>
          <a href="${sUrl}" style="background: #e11d48; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: bold; display: inline-block;">
            Voir les prestations & Réserver
          </a>
        </div>
      </article>
      `;
    }).join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="BeautyFlow Africa">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${previewImage}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${previewImage}">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
${JSON.stringify(itemListSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumbSchema, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqSchema, null, 2)}
  </script>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.6; background-color: #f8fafc;">
  <nav style="font-size: 0.875rem; color: #64748b; margin-bottom: 20px;">
    <a href="${frontendUrl}" style="color: #e11d48; text-decoration: none;">Accueil</a> &gt; 
    <span>${categoryTitle} à ${formattedCity}</span>
  </nav>

  <header style="margin-bottom: 30px; background: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
    <h1 style="font-size: 2.1rem; margin: 0 0 12px 0; color: #0f172a;">
      ${categoryTitle} à <span style="color: #e11d48;">${formattedCity}</span>
    </h1>
    <p style="font-size: 1.05rem; color: #475569; margin: 0 0 16px 0;">
      Découvrez le guide complet des meilleurs ${humanCategory} à ${formattedCity}. Réservez votre coiffure, coupe homme, soins esthétiques, manucure ou massage 24h/24 et 7j/7 avec confirmation instantanée.
    </p>
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <a href="${frontendUrl}/salons/${rawCity || 'tous'}" style="background: #f1f5f9; color: #334155; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">Tous les salons</a>
      <a href="${frontendUrl}/coiffeurs/${rawCity || 'tous'}" style="background: #f1f5f9; color: #334155; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">Coiffeurs</a>
      <a href="${frontendUrl}/barbiers/${rawCity || 'tous'}" style="background: #f1f5f9; color: #334155; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">Barbers</a>
      <a href="${frontendUrl}/instituts-de-beaute/${rawCity || 'tous'}" style="background: #f1f5f9; color: #334155; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">Instituts & Spas</a>
    </div>
  </header>

  <main>
    <section style="margin-bottom: 40px;">
      <h2 style="font-size: 1.5rem; color: #0f172a; margin-bottom: 20px;">
        ${salons.length} établissements recommandés à ${formattedCity}
      </h2>
      ${salonsCardsHtml || `<p style="background: white; padding: 20px; border-radius: 8px;">Aucun salon listé actuellement dans cette zone. Vous êtes professionnel de la beauté à ${formattedCity} ? <a href="${frontendUrl}/pro" style="color: #e11d48; font-weight: bold;">Inscrivez votre salon sur BeautyFlow</a>.</p>`}
    </section>

    <section style="margin-bottom: 40px; background: white; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
      <h2 style="font-size: 1.5rem; color: #0f172a; margin-bottom: 16px;">Questions Fréquentes sur la beauté à ${formattedCity}</h2>
      <div style="margin-bottom: 18px;">
        <h3 style="font-size: 1.1rem; color: #1e293b; margin-bottom: 4px;">Comment trouver le meilleur coiffeur ou salon à ${formattedCity} ?</h3>
        <p style="color: #475569; font-size: 0.95rem; margin: 0;">Consultez les notes et avis certifiés de clients réels sur BeautyFlow Africa. Filtrez par spécialité (tresses, locks, coloration, lissage, barbe, soins) et réservez directement le professionnel le mieux noté.</p>
      </div>
      <div style="margin-bottom: 18px;">
        <h3 style="font-size: 1.1rem; color: #1e293b; margin-bottom: 4px;">Pourquoi réserver son salon en ligne sur BeautyFlow Africa ?</h3>
        <p style="color: #475569; font-size: 0.95rem; margin: 0;">BeautyFlow vous évite les longues files d'attente au salon, vous garantit votre créneau avec un rappel automatique par SMS/WhatsApp, et vous permet de comparer les prix en toute transparence.</p>
      </div>
    </section>

    <section style="margin-bottom: 30px; background: #fff1f2; padding: 20px; border-radius: 12px; border: 1px solid #fecdd3;">
      <h3 style="font-size: 1.2rem; color: #9f1239; margin: 0 0 8px 0;">Vous êtes propriétaire d'un salon de coiffure ou institut à ${formattedCity} ?</h3>
      <p style="color: #4c0519; font-size: 0.95rem; margin: 0 0 14px 0;">Attirez de nouveaux clients chaque jour et simplifiez la gestion de vos rendez-vous, paiements et fidélité.</p>
      <a href="${frontendUrl}/pro" style="background: #e11d48; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Rejoindre BeautyFlow Pro</a>
    </section>
  </main>

  <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; color: #94a3b8; text-align: center;">
    <p>© ${new Date().getFullYear()} BeautyFlow Africa — Le réseau beauté n°1 en Afrique (Cameroun, Côte d'Ivoire, Sénégal, Gabon, RDC...).</p>
  </footer>

  <script>
    if (!navigator.userAgent.match(/(bot|googlebot|crawler|spider|slurp|bingbot|facebookexternalhit|whatsapp|twitterbot)/i)) {
      window.location.href = "${canonicalUrl}";
    }
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Error generating city share preview:', error);
    res.status(500).send('Server Error');
  }
};

// GET /sitemap.xml
exports.generateSitemapXml = async (req, res) => {
  try {
    const frontendUrl = (process.env.FRONTEND_URL_MARKETPLACE || process.env.FRONTEND_URL || 'https://beautyflowafrica.com').replace(/\/+$/, '');
    const baseUrl = (process.env.BACKEND_URL || 'https://beautyflowafrica.com').replace(/\/+$/, '');

    const salons = await Salon.find({ isActive: true, isHidden: { $ne: true }, hidden: { $ne: true } })
      .select('name nom slug ville typeEtablissement bannerUrl galleryUrls logoUrl updatedAt')
      .lean();

    const citiesSet = new Set();
    salons.forEach(s => {
      if (s.ville) {
        const cleanCity = s.ville.toLowerCase().trim().replace(/\s+/g, '-');
        if (cleanCity) citiesSet.add(cleanCity);
      }
    });

    const nowIso = new Date().toISOString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/explorer', priority: '0.9', changefreq: 'daily' },
      { url: '/privacy', priority: '0.3', changefreq: 'monthly' },
      { url: '/pro', priority: '0.8', changefreq: 'weekly' },
    ];

    staticPages.forEach(p => {
      xml += `  <url>\n`;
      xml += `    <loc>${frontendUrl}${p.url}</loc>\n`;
      xml += `    <lastmod>${nowIso}</lastmod>\n`;
      xml += `    <changefreq>${p.changefreq}</changefreq>\n`;
      xml += `    <priority>${p.priority}</priority>\n`;
      xml += `  </url>\n`;
    });

    Array.from(citiesSet).forEach(citySlug => {
      xml += `  <url>\n`;
      xml += `    <loc>${frontendUrl}/salons/${citySlug}</loc>\n`;
      xml += `    <lastmod>${nowIso}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.85</priority>\n`;
      xml += `  </url>\n`;

      xml += `  <url>\n`;
      xml += `    <loc>${frontendUrl}/coiffeurs/${citySlug}</loc>\n`;
      xml += `    <lastmod>${nowIso}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.80</priority>\n`;
      xml += `  </url>\n`;

      xml += `  <url>\n`;
      xml += `    <loc>${frontendUrl}/barbiers/${citySlug}</loc>\n`;
      xml += `    <lastmod>${nowIso}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.80</priority>\n`;
      xml += `  </url>\n`;

      xml += `  <url>\n`;
      xml += `    <loc>${frontendUrl}/instituts-de-beaute/${citySlug}</loc>\n`;
      xml += `    <lastmod>${nowIso}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.80</priority>\n`;
      xml += `  </url>\n`;
    });

    salons.forEach(s => {
      if (s.slug) {
        const sName = s.name || s.nom || 'Salon de beauté';
        let imageUrl = s.bannerUrl || (s.galleryUrls && s.galleryUrls[0]) || s.logoUrl || '';
        if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          const cleanPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
          imageUrl = `${baseUrl}${cleanPath}`;
        }

        xml += `  <url>\n`;
        xml += `    <loc>${frontendUrl}/salon/${s.slug}</loc>\n`;
        xml += `    <lastmod>${s.updatedAt ? new Date(s.updatedAt).toISOString() : nowIso}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.9</priority>\n`;
        if (imageUrl) {
          xml += `    <image:image>\n`;
          xml += `      <image:loc>${imageUrl}</image:loc>\n`;
          xml += `      <image:title><![CDATA[${sName} - ${s.ville || 'BeautyFlow Africa'}]]></image:title>\n`;
          xml += `      <image:caption><![CDATA[Réservation en ligne chez ${sName} à ${s.ville || 'Afrique'} sur BeautyFlow]]></image:caption>\n`;
          xml += `    </image:image>\n`;
        }
        xml += `  </url>\n`;
      }
    });

    xml += `</urlset>`;

    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Error generating sitemap XML:', error);
    res.status(500).send('Server Error');
  }

// GET /api/marketplace/bookings/count
exports.getBookingsCount = async (req, res, next) => {
  try {
    const count = await Rendezvous.countDocuments({});
    res.status(200).json({ success: true, count });
  } catch (err) {
    next(err);
  }
};

// GET /api/marketplace/bookings
exports.getClientBookings = async (req, res, next) => {
  try {
    if (!req.appUser) {
      return res.status(200).json({ success: true, data: [] });
    }

    const cleanPhoneDigits = req.appUser.telephone ? req.appUser.telephone.replace(/\D/g, '').slice(-9) : '';

    const queryConditions = [{ appUser: req.appUser._id }];
    if (cleanPhoneDigits && cleanPhoneDigits.length >= 8) {
      queryConditions.push({ telephone: { $regex: cleanPhoneDigits + '$' } });
    }

    const clients = await Client.find({ $or: queryConditions });
    const clientIds = clients.map(c => c._id);

    const bookings = await Rendezvous.find({ client: { $in: clientIds } })
      .populate('salon', 'name nom slug logoUrl address ville branding')
      .populate('prestations', 'nom prix description duree')
      .populate('typePrestation', 'nom prix description duree')
      .populate('employe', 'nom telephone avatarUrl')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
};

// GET /api/marketplace/auth/loyalty
exports.getClientLoyalty = async (req, res, next) => {
  try {
    if (!req.appUser) {
      return res.status(200).json({ success: true, data: [] });
    }

    const cleanPhoneDigits = req.appUser.telephone ? req.appUser.telephone.replace(/\D/g, '').slice(-9) : '';

    const queryConditions = [{ appUser: req.appUser._id }];
    if (cleanPhoneDigits && cleanPhoneDigits.length >= 8) {
      queryConditions.push({ telephone: { $regex: cleanPhoneDigits + '$' } });
    }

    const clients = await Client.find({
      $or: queryConditions,
      $and: [
        {
          $or: [
            { pointsFidelite: { $gt: 0 } },
            { nombreVisites: { $gt: 0 } }
          ]
        }
      ]
    })
      .populate('salon', 'name nom slug logoUrl bannerUrl configFidelite branding')
      .lean();

    res.status(200).json({ success: true, data: clients });
  } catch (err) {
    next(err);
  }
};

// POST /api/marketplace/bookings/:id/confirm-completion
exports.confirmBookingCompletion = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.appUser) {
      return res.status(401).json({ success: false, message: 'Non autorisé' });
    }

    const cleanPhoneDigits = req.appUser.telephone ? req.appUser.telephone.replace(/\D/g, '').slice(-9) : '';

    const queryConditions = [{ appUser: req.appUser._id }];
    if (cleanPhoneDigits && cleanPhoneDigits.length >= 8) {
      queryConditions.push({ telephone: { $regex: cleanPhoneDigits + '$' } });
    }

    const clients = await Client.find({ $or: queryConditions });
    const clientIds = clients.map(c => c._id.toString());

    const booking = await Rendezvous.findById(id)
      .populate('salon')
      .populate('typePrestation')
      .populate('prestations');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable' });
    }

    const bookingClientId = booking.client?._id ? booking.client._id.toString() : booking.client?.toString();
    const isOwner = clientIds.includes(bookingClientId);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Cette réservation ne vous appartient pas' });
    }

    const previousStatut = booking.statut;

    // Marquer la réservation comme terminée / honorée
    booking.statut = 'completed';
    await booking.save();

    // Incrémenter les points de fidélité et le nombre de visites sur le modèle Client
    if (booking.client && previousStatut !== 'completed') {
      const clientObj = await Client.findById(booking.client._id || booking.client).populate('salon');
      if (clientObj) {
        const configFidelite = clientObj.salon?.configFidelite || { visitesRequises: 10, visitesVIP: 20 };
        const price = (booking.prestations || []).reduce((sum, p) => sum + (parseInt((p.prix || '').toString().replace(/\D/g, ''), 10) || 0), 0) || 0;
        if (typeof clientObj.enregistrerVisite === 'function') {
          clientObj.enregistrerVisite(price, configFidelite);
        } else {
          clientObj.pointsFidelite = (clientObj.pointsFidelite || 0) + 1;
          clientObj.nombreVisites = (clientObj.nombreVisites || 0) + 1;
          clientObj.totalDepense = (clientObj.totalDepense || 0) + price;
          clientObj.derniereVisite = new Date();
        }
        if (req.appUser && !clientObj.appUser) {
          clientObj.appUser = req.appUser._id;
        }
        await clientObj.save();
      }
    }

    // Déclencher le reversement Payout au salon uniquement si le paiement avait été effectué en ligne
    if (previousStatut === 'paid') {
      const paymentService = require('../services/payment.service');
      try {
        await paymentService.executeBookingPayout(booking);
      } catch (payoutErr) {
        console.error('[MARKETPLACE CONTROLLER] Erreur lors du payout:', payoutErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Prestation confirmée avec succès.',
      data: booking
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/marketplace/salons/:slug/track
exports.trackSalonEvent = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { eventType, customerName, customerPhone, customerEmail, selectedServices } = req.body;

    const isObjectId = slug.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: slug } : { slug };

    const salon = await Salon.findOne(query);
    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    const appUserId = req.appUser ? req.appUser._id : null;
    const resolvedName = customerName || (req.appUser ? req.appUser.nom : 'Visiteur Anonyme');
    const resolvedPhone = customerPhone || (req.appUser ? req.appUser.telephone : '');
    const resolvedEmail = customerEmail || (req.appUser ? req.appUser.email : '');

    const event = await SalonAnalyticsEvent.create({
      salon: salon._id,
      eventType: eventType || 'view_page',
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      customerEmail: resolvedEmail,
      selectedServices: selectedServices || [],
      appUser: appUserId,
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip || ''
    });

    res.status(201).json({ success: true, data: event });
  } catch (err) {
    next(err);
  }
};

// GET /api/marketplace/salons/:id/analytics (or /api/salons/:id/analytics)
exports.getSalonAnalytics = async (req, res, next) => {
  try {
    const userSalonId = req.user?.salon?._id?.toString() || req.user?.salon?.toString();
    const rawId = req.params.id || req.params.salonId || req.params.slug || req.query.salonId || (req.salon ? req.salon._id : null) || userSalonId;
    if (!rawId) {
      return res.status(400).json({ success: false, message: 'ID de salon requis' });
    }

    const isObjectId = String(rawId).match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: rawId } : { slug: rawId };

    const salon = await Salon.findOne(query);
    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    const rawEvents = await SalonAnalyticsEvent.find({ salon: salon._id })
      .populate('appUser', 'nom telephone email avatarUrl')
      .sort({ createdAt: -1 })
      .limit(500);

    const events = rawEvents.map(ev => {
      const obj = ev.toObject();
      if (obj.appUser) {
        if (!obj.customerName || obj.customerName === 'Visiteur Anonyme') {
          obj.customerName = obj.appUser.nom || 'Visiteur Connecté';
        }
        if (!obj.customerPhone) {
          obj.customerPhone = obj.appUser.telephone || '';
        }
        if (!obj.customerEmail) {
          obj.customerEmail = obj.appUser.email || '';
        }
      }
      return obj;
    });

    const totalViews = await SalonAnalyticsEvent.countDocuments({ salon: salon._id, eventType: 'view_page' });
    const totalBookingStarts = await SalonAnalyticsEvent.countDocuments({ salon: salon._id, eventType: 'booking_started' });
    const totalConfirmedBookings = await Rendezvous.countDocuments({ salon: salon._id, statut: { $ne: 'annule' } });

    const conversionRate = totalViews > 0 ? ((totalConfirmedBookings / totalViews) * 100).toFixed(1) : '0';

    const stats = {
      totalViews,
      totalBookingStarts,
      totalConfirmedBookings,
      conversionRate
    };

    res.status(200).json({
      success: true,
      stats,
      events,
      data: {
        stats,
        events
      }
    });
  } catch (err) {
    next(err);
  }
};

