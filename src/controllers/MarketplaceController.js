const AppUser = require('../models/AppUser');
const Salon = require('../models/Salon');
const Client = require('../models/Client');
const Rendezvous = require('../models/Rendezvous');
const TypePrestation = require('../models/TypePrestation');
const User = require('../models/User');

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

    res.status(201).json({ success: true, token, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    const token = user.getSignedJwtToken();
    user.password = undefined; // hide password in response

    res.status(200).json({ success: true, token, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Auth: Get Me
exports.getMe = async (req, res) => {
  try {
    const user = await AppUser.findById(req.appUser.id).populate('favoris', 'name slug address logoUrl typeEtablissement');
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3.1 Auth: Google Login
const { OAuth2Client } = require('google-auth-library');
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
    user.password = undefined;

    res.status(200).json({ success: true, token: jwtToken, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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

    // Fetch prestations for this salon
    const prestations = await TypePrestation.find({ salon: salon._id, actif: true });

    // Fetch team (staff/owner) for this salon
    const team = await User.find({ salon: salon._id, actif: true, role: { $in: ['staff', 'owner'] } });
    const staff = team.map(member => ({
      id: member._id,
      nom: member.name,
      role: member.role === 'owner' ? 'Propriétaire' : 'Staff',
      photoUrl: member.avatarUrl || null,
      specialties: []
    }));

    res.status(200).json({ success: true, data: { ...salon.toObject(), prestations, staff } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Bookings: Create a new booking
exports.createBooking = async (req, res) => {
  try {
    const { salonId, typePrestationId, date, heure, notes, telephoneClient, nomClient } = req.body;

    const salon = await Salon.findById(salonId);
    if (!salon) return res.status(404).json({ success: false, message: 'Salon introuvable' });

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

    // Create Rendezvous
    const rendezVous = await Rendezvous.create({
      salon: salon._id,
      client: client._id,
      typePrestation: typePrestationId,
      employe: null,
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

    res.status(201).json({ success: true, data: rendezVous });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
