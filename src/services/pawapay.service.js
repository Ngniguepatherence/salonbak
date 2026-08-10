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
  async initiateDeposit({ depositId, amount, phone, clientReferenceId, description, provider }) {
    if (!this.apiToken) {
      // Si pas de token, on retourne un objet mocké pour le mode dev
      console.log(`[PAWAPAY MOCK] Dépôt initié : ${amount} XAF au ${phone} (Ref: ${clientReferenceId}, Provider: ${provider})`);
      return {
        depositId,
        status: 'SUBMITTED',
        clientReferenceId,
      };
    }

    try {
      let cleanPhone = phone ? phone.replace(/\D/g, '') : '';
      if (cleanPhone.startsWith('00237')) {
        cleanPhone = cleanPhone.slice(2);
      } else if (!cleanPhone.startsWith('237') && cleanPhone.length === 9) {
        cleanPhone = '237' + cleanPhone;
      }

      // Le message client doit faire entre 4 et 22 caractères (uniquement alphanumérique + espace)
      const customerMessage = this.sanitizeCustomerMessage(description, 'BeautyFlow Payment');

      const payload = {
        depositId,
        amount: amount.toString(),
        currency: 'XAF',
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

      const data = Array.isArray(responseData) ? responseData[0] : responseData;
      return data;
    } catch (error) {
      console.error('Erreur getDepositStatus pawaPay:', error.cause?.message || error.message);
      throw error;
    }
  }

  /**
   * Initie un transfert d'argent (Payout V2) - Utile pour payer les salons (Marketplace)
   * Doc V2: POST /v2/payouts
   */
  async initiatePayout({
    payoutId,
    amount,
    phone,
    provider,
    description,
    clientReferenceId,
    currency = 'XAF',
    customerMessage: customMessage,
    metadata,
    recipientType = 'MMO'
  }) {
    let cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    if (cleanPhone.startsWith('00237')) {
      cleanPhone = cleanPhone.slice(2);
    } else if (!cleanPhone.startsWith('237') && cleanPhone.length === 9) {
      cleanPhone = '237' + cleanPhone;
    }

    const customerMessage = this.sanitizeCustomerMessage(customMessage || description, 'BeautyFlow Payout');
    const refId = clientReferenceId || payoutId;

    if (!this.apiToken) {
      console.log(`[PAWAPAY MOCK] Payout initié : ${amount} ${currency} au ${cleanPhone} (Ref: ${refId}, Provider: ${provider})`);
      return {
        payoutId,
        status: 'SUBMITTED',
        clientReferenceId: refId
      };
    }

    try {
      const payload = {
        payoutId,
        recipient: {
          type: recipientType,
          accountDetails: {
            phoneNumber: cleanPhone,
            provider: provider
          }
        },
        amount: amount.toString(),
        currency: currency,
        clientReferenceId: refId,
        customerMessage
      };

      if (metadata) {
        payload.metadata = metadata;
      }

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
      console.log(data);
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

      const data = Array.isArray(responseData) ? responseData[0] : responseData;
      console.log('[PAWAPAY API V2] Statut du Payout :', data);
      return data;
    } catch (error) {
      console.error('Erreur getPayoutStatus pawaPay:', error.message);
      throw error;
    }
  }


  /**
   * Initie une demande de remboursement (Refund V2)
   * Doc V2: POST /v2/refunds
   */
  async initiateRefund({ refundId, depositId, amount, description }) {
    if (!this.apiToken) {
      console.log(`[PAWAPAY MOCK] Remboursement initié pour le dépôt : ${depositId} (Montant: ${amount})`);
      return {
        refundId,
        status: 'ACCEPTED',
      };
    }

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/v2/refunds`,
        {
          refundId,
          depositId,
          amount: amount.toString(),
          currency: 'XAF',
          description: description || 'BeautyFlow Refund',
        },
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Erreur initiateRefund pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de l\'initiation du remboursement chez pawaPay');
    }
  }

  /**
   * Obtient la configuration active (pays, providers)
   * Doc V2: GET /v2/active-conf
   */
  async getActiveConfig(country = 'CMR', operationType = 'DEPOSIT') {
    if (!this.apiToken) {
      // Mock for development
      return {
        companyName: "Dev Mode",
        countries: [
          {
            country: country,
            prefix: "237",
            flag: "https://static-content.pawapay.io/country_flags/cmr.svg",
            displayName: { en: "Cameroon", fr: "Cameroun" },
            providers: [
              {
                provider: "MTN_MOMO_CMR",
                displayName: "MTN",
                nameDisplayedToCustomer: "MTN Mobile Money",
                logo: "https://static-content.pawapay.io/company_logos/mtn.png",
                currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: true } } }]
              },
              {
                provider: "ORANGE_CMR",
                displayName: "Orange",
                nameDisplayedToCustomer: "Orange Money",
                logo: "https://static-content.pawapay.io/company_logos/orange.png",
                currencies: [{ currency: "XAF", operationTypes: { DEPOSIT: { authType: "PROVIDER_AUTH", pinPrompt: "AUTOMATIC", pinPromptRevivable: false } } }]
              }
            ]
          }
        ]
      };
    }
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/v2/active-conf?country=${country}&operationType=${operationType}`,
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
      // Mock for development
      let provider = 'MTN_MOMO_CMR';
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      const localPhone = cleanPhone.startsWith('237') ? cleanPhone.slice(3) : cleanPhone;
      if (localPhone.startsWith('69') || localPhone.startsWith('655') || localPhone.startsWith('656') || localPhone.startsWith('657') || localPhone.startsWith('658') || localPhone.startsWith('659')) {
        provider = 'ORANGE_CMR';
      }
      return {
        country: 'CMR',
        provider,
        phoneNumber: cleanPhone.startsWith('237') ? cleanPhone : '237' + cleanPhone
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
