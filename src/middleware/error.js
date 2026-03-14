/**
 * Middleware de gestion centralisée des erreurs
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log pour le développement
  if (process.env.NODE_ENV === 'development') {
    console.error('❌', err);
  }

  // Mongoose — ID invalide (CastError)
  if (err.name === 'CastError') {
    error.message = `Ressource introuvable avec l'identifiant : ${err.value}`;
    return res.status(404).json({ success: false, message: error.message });
  }

  // Mongoose — Champ unique dupliqué (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error.message = `La valeur '${err.keyValue[field]}' est déjà utilisée pour le champ '${field}'`;
    return res.status(400).json({ success: false, message: error.message });
  }

  // Mongoose — Erreur de validation
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join('. ') });
  }

  // JWT — Token invalide
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }

  // JWT — Token expiré
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expiré' });
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Erreur serveur interne',
  });
};

module.exports = errorHandler;