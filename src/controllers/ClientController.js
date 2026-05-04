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
      
      // Recherche par téléphone exacte ou partielle
      const clients = await Client.find({
        salon: req.params.salonId,
        telephone: { $regex: q, $options: 'i' }
      }).limit(10);
      
      res.status(200).json({ success: true, data: clients });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = clientController;
