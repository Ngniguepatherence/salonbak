/**
 * createTenantController
 *
 * Factory qui génère les 5 opérations CRUD standard pour
 * n'importe quelle ressource scoped par salon.
 *
 * Usage :
 *   const clientController = createTenantController(Client);
 *   router.get('/', clientController.getAll);
 */

const createTenantController = (Model, populateFields = []) => {
  const applyPopulate = (query) => {
    populateFields.forEach((p) => query.populate(p));
    return query;
  };

  return {
    // GET /api/salons/:salonId/{resource}
    getAll: async (req, res, next) => {
      try {
        let query = Model.find({ salon: req.params.salonId }).sort({ createdAt: -1 });
        query = applyPopulate(query);
        const data = await query;
        res.status(200).json({ success: true, count: data.length, data });
      } catch (err) {
        next(err);
      }
    },

    // GET /api/salons/:salonId/{resource}/:id
    getOne: async (req, res, next) => {
      try {
        let query = Model.findOne({ _id: req.params.id, salon: req.params.salonId });
        query = applyPopulate(query);
        const data = await query;

        if (!data) {
          return res.status(404).json({ success: false, message: 'Ressource introuvable' });
        }
        res.status(200).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },

    // POST /api/salons/:salonId/{resource}
    create: async (req, res, next) => {
      try {
        console.log(req.body);
        const data = await Model.create({ ...req.body, salon: req.params.salonId });
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },

    // PUT /api/salons/:salonId/{resource}/:id
    update: async (req, res, next) => {
      try {
        // Empêcher de changer le salon de la ressource
        delete req.body.salon;
        console.log(req.body);
        const data = await Model.findOneAndUpdate(
          { _id: req.params.id, salon: req.params.salonId },
          req.body,
          { new: true, runValidators: true }
        );
        // console.log(data);

        if (!data) {
          return res.status(404).json({ success: false, message: 'Ressource introuvable' });
        }
        res.status(200).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },

    // DELETE /api/salons/:salonId/{resource}/:id
    delete: async (req, res, next) => {
      try {
        const data = await Model.findOneAndDelete({
          _id: req.params.id,
          salon: req.params.salonId,
        });

        if (!data) {
          return res.status(404).json({ success: false, message: 'Ressource introuvable' });
        }
        res.status(200).json({ success: true, data: {} });
      } catch (err) {
        next(err);
      }
    },
  };
};

module.exports = createTenantController;