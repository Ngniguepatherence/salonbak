const AppUser = require('../models/AppUser');
const Salon = require('../models/Salon');
const Client = require('../models/Client');
const Rendezvous = require('../models/Rendezvous');
const TypePrestation = require('../models/TypePrestation');
const User = require('../models/User');
const Notification = require('../models/Notification');

const { OAuth2Client } = require('google-auth-library');
const googleMarketplaceClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || 'dummy_client_id_for_dev',
  process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret_for_dev',
  process.env.GOOGLE_REDIRECT_URI_MARKETPLACE || `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/google/callback`
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
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
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
    // Return only active salons
    const salons = await Salon.find({ isActive: true })
      .select('name slug address ville pays typeEtablissement logoUrl bannerUrl galleryUrls description phone email availability horaires location');

    // We can map these so the frontend receives them in the expected format
    res.status(200).json({ success: true, data: salons });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 5. Salons: Get by slug
exports.getSalonBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const isObjectId = slug.match(/^[0-9a-fA-F]{24}$/);

    const query = isObjectId ? { _id: slug } : { slug: slug };
    query.isActive = true;

    const salon = await Salon.findOne(query);
    if (!salon) {
      return res.status(404).json({ success: false, message: 'Salon introuvable' });
    }

    await salon.checkSubscriptionTransition();

    // Fetch prestations for this salon
    const prestations = await TypePrestation.find({ salon: salon._id, actif: true });

    // Fetch team (staff/owner) for this salon
    const team = await User.find({ salon: salon._id, actif: true, role: { $in: ['staff', 'owner'] } });
    const staff = team.map(member => ({
      id: member._id,
      nom: member.name,
      role: member.role === 'owner' ? 'Propriétaire' : 'Staff',
      photoUrl: member.avatarUrl || null,
      specialties: [],
      availability: member.availability || null
    }));

    res.status(200).json({ success: true, data: { ...salon.toObject(), prestations, staff } });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// 6. Bookings: Create a new booking
exports.createBooking = async (req, res) => {
  try {
    const { salonId, typePrestationId, date, heure, notes, telephoneClient, nomClient, employe } = req.body;

    const salon = await Salon.findById(salonId);
    if (!salon) return res.status(404).json({ success: false, message: 'Salon introuvable' });

    await salon.checkSubscriptionTransition();

    const prestation = await TypePrestation.findById(typePrestationId);
    if (!prestation) return res.status(404).json({ success: false, message: 'Prestation introuvable' });

    // Ensure Client exists for this salon
    let clientPhone = telephoneClient || req.appUser.telephone;
    if (!clientPhone) {
      return res.status(400).json({ success: false, message: 'Un numéro de téléphone est requis pour réserver.' });
    }

    // Cherche le client dans ce salon via son numéro de téléphone
    let client = await Client.findOne({ salon: salon._id, telephone: clientPhone });

    if (!client) {
      // Create Client
      client = await Client.create({
        nom: req.body.nomClient || req.appUser.nom || 'Client App',
        telephone: clientPhone,
        salon: salon._id
      });
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

    const slotDuration = prestation.duree || 30;
    const bookingStartMin = timeToMinutes(heure);
    const bookingEndMin = bookingStartMin + slotDuration;

    // Récupérer les collaborateurs actifs du salon (staff + owner)
    const team = await User.find({ salon: salon._id, actif: true, role: { $in: ['staff', 'owner'] } });

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

    // Create Rendezvous
    const rendezVous = await Rendezvous.create({
      salon: salon._id,
      client: client._id,
      typePrestation: typePrestationId,
      employe: assignedEmployeId,
      date,
      heure,
      duree: prestation.duree || 30,
      statut: 'en_attente',
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
      const notifData = {
        salon: salon._id,
        type: 'booking',
        title: 'Nouveau rendez-vous en ligne',
        description: `Le client ${client.nom || 'Client App'} a réservé pour la prestation "${prestation.name}" le ${date} à ${heure}.`
      };

      // 1. Notifier le Owner
      if (salon.owner) {
        await Notification.create({
          ...notifData,
          user: salon.owner
        });
      }

      // 2. Notifier l'employé (si différent de l'owner)
      if (assignedEmployeId && assignedEmployeId.toString() !== (salon.owner ? salon.owner.toString() : '')) {
        await Notification.create({
          ...notifData,
          user: assignedEmployeId
        });
      }
    } catch (notifErr) {
      console.error('⚠️ Impossible de créer les notifications de rendez-vous:', notifErr.message);
    }

    res.status(201).json({ success: true, data: rendezVous });
  } catch (error) {
    sendErrorResponse(res, error);
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

// 5.1 Salons: Get Share Preview (Open Graph metadata for crawlers)
exports.getSalonSharePreview = async (req, res) => {
  try {
    const slug = req.params.slug;
    const isObjectId = slug.match(/^[0-9a-fA-F]{24}$/);

    const query = isObjectId ? { _id: slug } : { slug: slug };
    query.isActive = true;

    const salon = await Salon.findOne(query);
    if (!salon) {
      return res.status(404).send('Salon introuvable');
    }

    const salonName = salon.name || 'Salon';
    const description = salon.description || `Réservez votre prochain rendez-vous chez ${salonName}`;
    const bannerUrl = salon.bannerUrl || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600&auto=format&fit=crop';
    
    // Serve HTML page populated with Open Graph meta tags for bot previews
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${salonName} — Réservation</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${salonName} — Réservation">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${bannerUrl}">
  <meta property="og:type" content="website">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${salonName} — Réservation">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${bannerUrl}">
</head>
<body>
  <h1>${salonName}</h1>
  <p>${description}</p>
  <script>
    // Redirect standard browsers back to the frontend SPA route
    const frontendUrl = "${process.env.FRONTEND_URL || 'http://localhost:8080'}";
    window.location.href = frontendUrl + "/booking/${slug}";
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Error generating share preview:', error);
    res.status(500).send('Server Error');
  }
};

// GET /api/marketplace/bookings/count
exports.getBookingsCount = async (req, res, next) => {
  try {
    const count = await Rendezvous.countDocuments({});
    res.status(200).json({ success: true, count });
  } catch (err) {
    next(err);
  }
};
