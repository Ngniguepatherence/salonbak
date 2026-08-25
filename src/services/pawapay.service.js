const axios = require('axios');

class PawapayService {
  constructor() {
    this.apiToken = process.env.PAWAPAY_API_TOKEN;
    const baseUrl = process.env.PAWAPAY_API_BASE_URL || 'https://api.sandbox.pawapay.io';
    this.apiBaseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Obtient les en-têtes d'autorisation pour pawaPay
   */
  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Nettoie et formate le customerMessage selon les exigences pawaPay:
   * Seuls les caractères alphanumériques et les espaces sont autorisés, entre 4 et 22 caractères.
   */
  sanitizeCustomerMessage(msg, fallback = 'BeautyFlow Payment') {
    let source = msg || fallback;
    // Supprimer les accents (é -> e, è -> e, etc.)
    let clean = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Ne garder que les caractères alphanumériques et les espaces
    clean = clean.replace(/[^a-zA-Z0-9 ]/g, '');
    // Nettoyer les espaces multiples
    clean = clean.replace(/\s+/g, ' ').trim();

    if (clean.length < 4) {
      clean = (clean || fallback).padEnd(4, 'X');
    }
    return clean.slice(0, 22);
  }

  /**
   * Initie un paiement USSD Push (Deposit V2)
   * Doc V2: POST /v2/deposits
   */
  async initiateDeposit({ depositId, amount, phone, clientReferenceId, description, provider, currency }) {
    let cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.slice(2);
    }

    // Determine target currency based on provider or explicit param
    let depositCurrency = currency;
    if (!depositCurrency) {
      if (provider) {
        if (provider.endsWith('_CIV') || provider.endsWith('_SEN') || provider.endsWith('_BEN')) depositCurrency = 'XOF';
        else if (provider.endsWith('_GHA')) depositCurrency = 'GHS';
        else if (provider.endsWith('_KEN')) depositCurrency = 'KES';
        else if (provider.endsWith('_NGA')) depositCurrency = 'NGN';
        else depositCurrency = 'XAF';
      } else {
        depositCurrency = 'XAF';
      }
    }

    if (!this.apiToken) {
      // Si pas de token, on retourne un objet mocké pour le mode dev
      console.log(`[PAWAPAY MOCK] Dépôt initié : ${amount} ${depositCurrency} au ${cleanPhone} (Ref: ${clientReferenceId}, Provider: ${provider})`);
      return {
        depositId,
        status: 'SUBMITTED',
        clientReferenceId,
      };
    }

    try {
      // Le message client doit faire entre 4 et 22 caractères (uniquement alphanumérique + espace)
      const customerMessage = this.sanitizeCustomerMessage(description, 'BeautyFlow Payment');

      const payload = {
        depositId,
        amount: amount.toString(),
        currency: depositCurrency,
        payer: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: cleanPhone,
            provider: provider || 'MTN_MOMO_CMR'
          }
        },
        clientReferenceId,
        customerMessage
      };

      console.log('[PAWAPAY API V2] Envoi de la requête de dépôt :', JSON.stringify(payload, null, 2));

      const response = await fetch(`${this.apiBaseUrl}/v2/deposits`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log(data);

      if (!response.ok) {
        console.error('Erreur HTTP initiateDeposit pawaPay:', data);
        throw new Error(data?.message || `Erreur HTTP ${response.status} lors de l'initiation du dépôt chez pawaPay`);
      }

      return data;
    } catch (error) {
      console.error('Erreur initiateDeposit pawaPay:', error.message);
      throw error;
    }
  }

  /**
   * Vérifie le statut d'un dépôt (V2)
   * Doc V2: GET /v2/deposits/{depositId}
   */
  async getDepositStatus(depositId) {
    if (!this.apiToken) {
      // Mock en mode développement
      console.log(`[PAWAPAY MOCK] Vérification dépôt : ${depositId}`);
      return {
        depositId,
        status: 'COMPLETED',
      };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/v2/deposits/${depositId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Erreur HTTP getDepositStatus pawaPay:', responseData);
        throw new Error(responseData?.message || `Erreur HTTP ${response.status} lors de la vérification du dépôt chez pawaPay`);
      }

      return responseData;
    } catch (error) {
      console.error('Erreur getDepositStatus pawaPay:', error.cause?.message || error.message);
      throw error;
    }
  }

  /**
   * Initie un paiement de remboursement (Payout V2)
   * Doc V2: POST /v2/payouts
   */
  async initiatePayout({ payoutId, amount, phone, clientReferenceId, description, provider, currency = 'XAF' }) {
    if (!this.apiToken) {
      console.log(`[PAWAPAY MOCK] Payout initié : ${amount} ${currency} au ${phone} (Ref: ${clientReferenceId}, Provider: ${provider})`);
      return {
        payoutId,
        status: 'ACCEPTED',
        clientReferenceId,
      };
    }

    try {
      let cleanPhone = phone ? phone.replace(/\D/g, '') : '';
      if (cleanPhone.startsWith('00')) {
        cleanPhone = cleanPhone.slice(2);
      }

      const customerMessage = this.sanitizeCustomerMessage(description, 'BeautyFlow Payout');

      const payload = {
        payoutId,
        amount: amount.toString(),
        currency,
        recipient: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: cleanPhone,
            provider: provider || 'MTN_MOMO_CMR'
          }
        },
        clientReferenceId,
        customerMessage
      };

      console.log('[PAWAPAY API V2] Envoi de la requête de Payout :', JSON.stringify(payload, null, 2));

      const response = await fetch(`${this.apiBaseUrl}/v2/payouts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Erreur HTTP initiatePayout pawaPay:', data);
        throw new Error(data?.message || `Erreur HTTP ${response.status} lors de l'initiation du Payout chez pawaPay`);
      }

      return data;
    } catch (error) {
      console.error('Erreur initiatePayout pawaPay:', error.message);
      throw error;
    }
  }

  /**
   * Vérifie le statut d'un Payout (V2)
   * Doc V2: GET /v2/payouts/{payoutId}
   */
  async getPayoutStatus(payoutId) {
    if (!this.apiToken) {
      console.log(`[PAWAPAY MOCK] Vérification Payout : ${payoutId}`);
      return {
        payoutId,
        status: 'COMPLETED',
      };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/v2/payouts/${payoutId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Erreur HTTP getPayoutStatus pawaPay:', responseData);
        throw new Error(responseData?.message || `Erreur HTTP ${response.status} lors de la vérification du Payout chez pawaPay`);
      }

      return responseData;
    } catch (error) {
      console.error('Erreur getPayoutStatus pawaPay:', error.message);
      throw error;
    }
  }


  /**
   * Effectue un remboursement (Refund V2)
   * Doc V2: POST /v2/refunds
   */
  async initiateRefund({ refundId, depositId, amount }) {
    if (!this.apiToken) {
      console.log(`[PAWAPAY MOCK] Remboursement initié pour ${depositId} : ${amount} XAF (RefundId: ${refundId})`);
      return {
        refundId,
        status: 'ACCEPTED',
        depositId
      };
    }

    try {
      const payload = {
        refundId,
        depositId,
        amount: amount.toString()
      };

      const response = await axios.post(
        `${this.apiBaseUrl}/v2/refunds`,
        payload,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erreur initiateRefund pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de l\'initiation du remboursement chez pawaPay');
    }
  }

  /**
   * Obtient la configuration active (Active Config V2)
   * Doc V2: GET /v2/active-conf
   */
  async getActiveConfig(country = 'CMR', operationType = 'DEPOSIT') {
    const cUpper = (country || 'CMR').toUpperCase();

    if (!this.apiToken) {
      const MOCK_CONFIGS = {
        CIV: {
          country: "CIV",
          prefix: "225",
          flag: "https://static-content.pawapay.io/country_flags/ci.svg",
          displayName: { en: "Ivory Coast", fr: "Côte d'Ivoire" },
          providers: [
            { provider: "WAVE_CIV", displayName: "Wave", nameDisplayedToCustomer: "Wave Côte d’Ivoire", logo: "https://static-content.pawapay.io/company_logos/wave.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "ORANGE_CIV", displayName: "Orange", nameDisplayedToCustomer: "Orange Money CI", logo: "https://static-content.pawapay.io/company_logos/orange.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: true } } }] },
            { provider: "MTN_MOMO_CIV", displayName: "MTN", nameDisplayedToCustomer: "MTN Mobile Money CI", logo: "https://static-content.pawapay.io/company_logos/mtn.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "MOOV_CIV", displayName: "Moov", nameDisplayedToCustomer: "Moov Money CI", logo: "https://static-content.pawapay.io/company_logos/moov.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        CMR: {
          country: "CMR",
          prefix: "237",
          flag: "https://static-content.pawapay.io/country_flags/cmr.svg",
          displayName: { en: "Cameroon", fr: "Cameroun" },
          providers: [
            { provider: "ORANGE_CMR", displayName: "Orange", nameDisplayedToCustomer: "Orange Money", logo: "https://static-content.pawapay.io/company_logos/orange.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: true } } }] },
            { provider: "MTN_MOMO_CMR", displayName: "MTN", nameDisplayedToCustomer: "MTN Mobile Money", logo: "https://static-content.pawapay.io/company_logos/mtn.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        SEN: {
          country: "SEN",
          prefix: "221",
          flag: "https://static-content.pawapay.io/country_flags/sn.svg",
          displayName: { en: "Senegal", fr: "Sénégal" },
          providers: [
            { provider: "WAVE_SEN", displayName: "Wave", nameDisplayedToCustomer: "Wave Sénégal", logo: "https://static-content.pawapay.io/company_logos/wave.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "ORANGE_SEN", displayName: "Orange", nameDisplayedToCustomer: "Orange Money Sénégal", logo: "https://static-content.pawapay.io/company_logos/orange.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "FREE_SEN", displayName: "Free", nameDisplayedToCustomer: "Free Money", logo: "https://static-content.pawapay.io/company_logos/free.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        GHA: {
          country: "GHA",
          prefix: "233",
          flag: "https://static-content.pawapay.io/country_flags/gh.svg",
          displayName: { en: "Ghana", fr: "Ghana" },
          providers: [
            { provider: "MTN_MOMO_GHA", displayName: "MTN", nameDisplayedToCustomer: "MTN Mobile Money Ghana", logo: "https://static-content.pawapay.io/company_logos/mtn.png", currencies: [{ currency: "GHS", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "VODAFONE_GHA", displayName: "Telecel", nameDisplayedToCustomer: "Telecel Cash", logo: "https://static-content.pawapay.io/company_logos/vodafone.png", currencies: [{ currency: "GHS", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        KEN: {
          country: "KEN",
          prefix: "254",
          flag: "https://static-content.pawapay.io/country_flags/ke.svg",
          displayName: { en: "Kenya", fr: "Kenya" },
          providers: [
            { provider: "MPESA_KEN", displayName: "M-Pesa", nameDisplayedToCustomer: "M-Pesa Safaricom", logo: "https://static-content.pawapay.io/company_logos/mpesa.png", currencies: [{ currency: "KES", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        GAB: {
          country: "GAB",
          prefix: "241",
          flag: "https://static-content.pawapay.io/country_flags/ga.svg",
          displayName: { en: "Gabon", fr: "Gabon" },
          providers: [
            { provider: "AIRTEL_GAB", displayName: "Airtel", nameDisplayedToCustomer: "Airtel Money Gabon", logo: "https://static-content.pawapay.io/company_logos/airtel.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "MOOV_GAB", displayName: "Moov", nameDisplayedToCustomer: "Moov Money Gabon", logo: "https://static-content.pawapay.io/company_logos/moov.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        COG: {
          country: "COG",
          prefix: "242",
          flag: "https://static-content.pawapay.io/country_flags/cg.svg",
          displayName: { en: "Congo", fr: "Congo" },
          providers: [
            { provider: "MTN_MOMO_COG", displayName: "MTN", nameDisplayedToCustomer: "MTN Mobile Money Congo", logo: "https://static-content.pawapay.io/company_logos/mtn.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "AIRTEL_COG", displayName: "Airtel", nameDisplayedToCustomer: "Airtel Money Congo", logo: "https://static-content.pawapay.io/company_logos/airtel.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        TCD: {
          country: "TCD",
          prefix: "235",
          flag: "https://static-content.pawapay.io/country_flags/td.svg",
          displayName: { en: "Chad", fr: "Tchad" },
          providers: [
            { provider: "AIRTEL_TCD", displayName: "Airtel", nameDisplayedToCustomer: "Airtel Money Tchad", logo: "https://static-content.pawapay.io/company_logos/airtel.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "MOOV_TCD", displayName: "Moov", nameDisplayedToCustomer: "Moov Money Tchad", logo: "https://static-content.pawapay.io/company_logos/moov.png", currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        },
        BEN: {
          country: "BEN",
          prefix: "229",
          flag: "https://static-content.pawapay.io/country_flags/bj.svg",
          displayName: { en: "Benin", fr: "Bénin" },
          providers: [
            { provider: "MTN_MOMO_BEN", displayName: "MTN", nameDisplayedToCustomer: "MTN Mobile Money Bénin", logo: "https://static-content.pawapay.io/company_logos/mtn.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] },
            { provider: "MOOV_BEN", displayName: "Moov", nameDisplayedToCustomer: "Moov Money Bénin", logo: "https://static-content.pawapay.io/company_logos/moov.png", currencies: [{ currency: "XOF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }] }
          ]
        }
      };

      const selectedConf = MOCK_CONFIGS[cUpper] || MOCK_CONFIGS.CIV;
      return {
        countries: [selectedConf]
      };
    }
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/v2/active-conf?country=${cUpper}&operationType=${operationType}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erreur getActiveConfig pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de la récupération de la configuration active pawaPay');
    }
  }

  /**
   * Prédit le provider en fonction du numéro de téléphone
   * Doc V2: POST /v2/predict-provider
   */
  async predictProvider(phoneNumber) {
    if (!this.apiToken) {
      let cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
      let provider = 'ORANGE_CIV';
      let country = 'CIV';

      if (cleanPhone.startsWith('225') || cleanPhone.length === 10) {
        country = 'CIV';
        const local = cleanPhone.startsWith('225') ? cleanPhone.slice(3) : cleanPhone;
        if (/^(07|08|09|77|78|79)/.test(local)) provider = 'ORANGE_CIV';
        else if (/^(05|06|54|55|56)/.test(local)) provider = 'MTN_MOMO_CIV';
        else if (/^(01|02|03)/.test(local)) provider = 'MOOV_CIV';
        else provider = 'WAVE_CIV';
      } else if (cleanPhone.startsWith('237')) {
        country = 'CMR';
        const local = cleanPhone.slice(3);
        if (local.startsWith('69') || /^65[5-9]/.test(local)) provider = 'ORANGE_CMR';
        else provider = 'MTN_MOMO_CMR';
      } else if (cleanPhone.startsWith('221')) {
        country = 'SEN';
        provider = 'WAVE_SEN';
      } else if (cleanPhone.startsWith('241')) {
        country = 'GAB';
        provider = 'AIRTEL_GAB';
      } else if (cleanPhone.startsWith('242')) {
        country = 'COG';
        provider = 'MTN_MOMO_COG';
      } else if (cleanPhone.startsWith('235')) {
        country = 'TCD';
        provider = 'AIRTEL_TCD';
      }

      return {
        country,
        provider,
        phoneNumber: cleanPhone
      };
    }
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/v2/predict-provider`,
        { phoneNumber },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Erreur predictProvider pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de la prédiction du provider pawaPay');
    }
  }
}

module.exports = new PawapayService();
