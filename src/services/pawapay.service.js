const axios = require('axios');

class PawapayService {
  constructor() {
    this.apiToken = process.env.PAWAPAY_API_TOKEN;
    this.apiBaseUrl = process.env.PAWAPAY_API_BASE_URL;
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
      // S'assurer que le numéro de téléphone commence par le code pays sans "+"
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('237')) {
        // Déjà formaté avec le code pays
      } else if (cleanPhone.length === 9) {
        cleanPhone = '237' + cleanPhone; // code pays Cameroun par défaut
      }

      // Le message client doit faire entre 4 et 22 caractères
      let customerMessage = 'BeautyFlow Payment';
      if (description) {
        customerMessage = description.slice(0, 22);
        if (customerMessage.length < 4) {
          customerMessage = customerMessage.padEnd(4, ' ');
        }
      }

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

      const response = await axios.post(
        `${this.apiBaseUrl}/v2/deposits`,
        payload,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Erreur initiateDeposit pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de l\'initiation du dépôt chez pawaPay');
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
      const response = await axios.get(
        `${this.apiBaseUrl}/v2/deposits/${depositId}`,
        { headers: this.getHeaders() }
      );

      // La réponse de pawaPay peut être un tableau ou un objet simple
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      return data;
    } catch (error) {
      console.error('Erreur getDepositStatus pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de la vérification du dépôt chez pawaPay');
    }
  }

  /**
   * Initie un transfert d'argent (Payout V2) - Utile pour payer les salons (Marketplace)
   * Doc V2: POST /v2/payouts
   */
  async initiatePayout({ payoutId, amount, phone, description, provider }) {
    if (!this.apiToken) {
      console.log(`[PAWAPAY MOCK] Payout initié : ${amount} XAF vers ${phone} (Provider: ${provider})`);
      return {
        payoutId,
        status: 'SUBMITTED'
      };
    }

    try {
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 9 && !cleanPhone.startsWith('237')) {
        cleanPhone = '237' + cleanPhone;
      }

      let customerMessage = 'BeautyFlow Payout';
      if (description) {
        customerMessage = description.slice(0, 22).padEnd(4, ' ');
      }

      const payload = {
        payoutId,
        amount: amount.toString(),
        currency: 'XAF',
        recipient: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: cleanPhone,
            provider: provider || 'MTN_MOMO_CMR'
          }
        }
      };

      console.log('[PAWAPAY API V2] Envoi de la requête de Payout :', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.apiBaseUrl}/v2/payouts`,
        payload,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Erreur initiatePayout pawaPay:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || 'Erreur lors de l\'initiation du Payout chez pawaPay');
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
