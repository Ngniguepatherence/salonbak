const Client = require('../models/Client');
const createTenantController = require('./TenantController');
const { escapeRegex } = require('../utils/security');

const baseCtrl = createTenantController(Client);

const clientController = {
  ...baseCtrl,
  
  search: async (req, res, next) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(200).json({ success: true, data: [] });
      }
      
      // Recherche par nom (partielle, insensible à la casse, protégée contre injection regex)
      const safeQ = escapeRegex(q).slice(0, 100);
      const clients = await Client.find({
        salon: req.params.salonId,
        nom: { $regex: safeQ, $options: 'i' }
      }).limit(10);
      
      res.status(200).json({ success: true, data: clients });
    } catch (err) {
      next(err);
    }
  },

  bulkCreate: async (req, res, next) => {
    try {
      const { clients } = req.body;
      if (!clients || !Array.isArray(clients)) {
        return res.status(400).json({ success: false, message: 'Données invalides : tableau de clients attendu' });
      }

      if (clients.length > 500) {
        return res.status(400).json({ success: false, message: 'Trop de clients en une fois (max 500)' });
      }

      const salonId = req.params.salonId;
      const clientsWithSalon = clients.map(client => ({
        ...client,
        salon: salonId
      }));

      const createdClients = await Client.insertMany(clientsWithSalon);
      res.status(201).json({ success: true, data: createdClients });
    } catch (err) {
      next(err);
    }
  },

  checkDuplicates: async (req, res, next) => {
    try {
      const { phones } = req.body;
      if (!phones || !Array.isArray(phones)) {
        return res.status(400).json({ success: false, message: 'Données invalides : tableau de numéros attendu' });
      }

      const salonId = req.params.salonId;
      const existingClients = await Client.find({ salon: salonId }).select('telephone');

      const cleanPhone = (num) => num.replace(/\D/g, '');
      const existingLast9 = new Set(
        existingClients
          .map(c => cleanPhone(c.telephone || ''))
          .filter(p => p.length >= 8)
          .map(p => p.slice(-9))
      );

      const results = phones.map(phone => {
        const phoneClean = cleanPhone(phone);
        const last9 = phoneClean.slice(-9);
        const exists = phoneClean.length >= 8 && existingLast9.has(last9);
        return {
          original: phone,
          normalise: phoneClean,
          exists
        };
      });

      res.status(200).json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  },

  bulkImport: async (req, res, next) => {
    try {
      const { contacts, groupe } = req.body;
      if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ success: false, message: 'Données invalides : tableau de contacts attendu' });
      }

      if (contacts.length > 500) {
        return res.status(400).json({ success: false, message: 'Trop de contacts en une fois (max 500)' });
      }

      const salonId = req.params.salonId;
      const cleanPhone = (num) => num.replace(/\D/g, '');

      // 1. Get existing clients
      const existingClients = await Client.find({ salon: salonId });
      const existingMap = new Map();
      existingClients.forEach(c => {
        const phoneClean = cleanPhone(c.telephone || '');
        if (phoneClean.length >= 8) {
          existingMap.set(phoneClean.slice(-9), c);
        }
      });

      // 2. Filter contacts to insert and matched existing ones
      const toInsert = [];
      const matchedClients = [];
      const seenLast9 = new Set();

      for (const contact of contacts) {
        if (!contact.telephone) continue;
        
        const phoneClean = cleanPhone(contact.telephone);
        if (phoneClean.length < 8) continue;
        
        const last9 = phoneClean.slice(-9);
        if (seenLast9.has(last9)) continue;
        seenLast9.add(last9);

        if (existingMap.has(last9)) {
          matchedClients.push(existingMap.get(last9));
        } else {
          toInsert.push({
            nom: contact.nom || `Contact ${contact.telephone}`,
            telephone: contact.telephone,
            salon: salonId,
            statut: 'nouvelle',
            notes: contact.source ? `Importé via ${contact.source}` : 'Importé du répertoire'
          });
        }
      }

      // 3. Plan limits check
      if (req.user.salon && req.user.salon.limits) {
        const currentCount = existingClients.length;
        const maxCustomers = req.user.salon.limits.maxCustomers ?? -1;

        if (maxCustomers !== -1 && (currentCount + toInsert.length > maxCustomers)) {
          return res.status(403).json({
            success: false,
            message: `Limite de clients atteinte. Vous essayez d'importer ${toInsert.length} nouveaux clients mais il ne reste que ${maxCustomers - currentCount} places dans votre plan.`
          });
        }
      }

      // 4. Insert new clients
      let insertedClients = [];
      if (toInsert.length > 0) {
        insertedClients = await Client.insertMany(toInsert);
      }

      // 5. Build group client list (newly inserted + matching existing ones)
      const allClientIds = [
        ...insertedClients.map(c => c._id),
        ...matchedClients.map(c => c._id)
      ];

      // 6. Create Contact Group if requested
      let createdGroup = null;
      if (groupe && groupe.nom && groupe.nom.trim()) {
        const { ContactGroup } = require('../models/Campaign');
        
        createdGroup = await ContactGroup.create({
          salon: salonId,
          nom: groupe.nom.trim(),
          description: groupe.description ? groupe.description.trim() : `Import du ${new Date().toLocaleDateString('fr-FR')}`,
          couleur: groupe.couleur || '#8b5cf6',
          clients: allClientIds,
          type: 'manuel'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          inserted: insertedClients.length,
          skipped: matchedClients.length,
          groupe: createdGroup ? { id: createdGroup._id, nom: createdGroup.nom } : null
        }
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = clientController;
