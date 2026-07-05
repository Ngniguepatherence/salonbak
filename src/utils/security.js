const ALLOWED_REDIRECT_DOMAINS = [
  'app.westdigitalhub.com', 
  'beautyflow.westdigitalhub.com', 
  'beautyflowafrica.com',
  'localhost', 
  '127.0.0.1'
];

if (process.env.FRONTEND_URL) {
  try {
    const url = new URL(process.env.FRONTEND_URL);
    if (!ALLOWED_REDIRECT_DOMAINS.includes(url.hostname)) {
      ALLOWED_REDIRECT_DOMAINS.push(url.hostname);
    }
  } catch (e) {
    // Ignore invalid URL
  }
}

if (process.env.FRONTEND_URL_MARKETPLACE) {
  try {
    const url = new URL(process.env.FRONTEND_URL_MARKETPLACE);
    if (!ALLOWED_REDIRECT_DOMAINS.includes(url.hostname)) {
      ALLOWED_REDIRECT_DOMAINS.push(url.hostname);
    }
  } catch (e) {
    // Ignore invalid URL
  }
}

if (process.env.ALLOWED_REDIRECT_DOMAINS) {
  const customDomains = process.env.ALLOWED_REDIRECT_DOMAINS.split(',')
    .map(d => d.trim())
    .filter(Boolean);
  customDomains.forEach(domain => {
    if (!ALLOWED_REDIRECT_DOMAINS.includes(domain)) {
      ALLOWED_REDIRECT_DOMAINS.push(domain);
    }
  });
}

/**
 * Vérifie si une URL de redirection est sûre pour éviter les redirections ouvertes.
 * Autorise les URL relatives et les domaines approuvés.
 * @param {string} url URL cible
 * @returns {boolean} true si l'URL est sûre, false sinon
 */
const isSafeRedirect = (url) => {
  if (!url) return false;
  try {
    const trimmed = url.trim();
    // Autoriser les chemins relatifs commençant par / mais pas // (qui peut définir un autre domaine)
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return true;
    }
    const parsed = new URL(trimmed);
    return ALLOWED_REDIRECT_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
};

/**
 * Échappe les caractères spéciaux d'une regex pour éviter les attaques ReDoS ou injection NoSQL.
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = {
  isSafeRedirect,
  escapeRegex,
};
