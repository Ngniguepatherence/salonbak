const Client = require('../models/Client');
const createTenantController = require('./TenantController');

const baseCtrl = createTenantController(Client);

const clientController = {
  ...baseCtrl,
  
  search: async (req, res, next) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(200).json({ success: true, data: [] });
      }
      
      // Recherche par nom (partielle, insensible à la casse)
      const clients = await Client.find({
        salon: req.params.salonId,
        nom: { $regex: q, $options: 'i' }
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
  }
};

module.exports = clientController;
