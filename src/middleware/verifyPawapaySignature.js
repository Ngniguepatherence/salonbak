const crypto = require('crypto');

/**
 * Middleware pour valider la signature ou le jeton d'autorisation des webhooks pawaPay
 */
module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const webhookSecret = process.env.PAWAPAY_WEBHOOK_SECRET;

    // 1. Validation via Bearer Token (la méthode la plus simple et configurable sur pawaPay)
    if (webhookSecret) {
      if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
        console.warn('⚠️ [SECURITY WARNING] Webhook rejeté : Jeton Authorization incorrect ou absent.');
        return res.status(401).json({ success: false, message: 'Webhook non autorisé' });
      }
    }

    // 2. Validation par signature cryptographique x-signature (optionnel)
    const signature = req.headers['x-signature'];
    const pawaPayPublicKey = process.env.PAWAPAY_PUBLIC_KEY;

    if (signature && pawaPayPublicKey) {
      const verifier = crypto.createVerify('sha256');
      // On s'assure d'utiliser le corps brut ou chaîne JSON exacte
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      verifier.update(rawBody);

      const isValid = verifier.verify(pawaPayPublicKey, signature, 'base64');
      if (!isValid) {
        console.warn('⚠️ [SECURITY WARNING] Webhook rejeté : La signature cryptographique est invalide.');
        return res.status(401).json({ success: false, message: 'Signature de webhook invalide' });
      }
    }

    // Si aucun secret ou signature n'est configuré en dev local, on laisse passer mais avec un avertissement
    if (!webhookSecret && !signature) {
      console.warn('⚠️ [SECURITY WARNING] Webhook pawaPay accepté sans authentification (aucune clé configurée en local).');
    }

    next();
  } catch (error) {
    console.error('Erreur dans le middleware de signature webhook:', error);
    return res.status(500).json({ success: false, message: 'Erreur interne de validation de webhook' });
  }
};
