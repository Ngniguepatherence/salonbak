const nodemailer = require('nodemailer');

/**
 * Service de Messagerie Global (SMTP / Email Transactionnel)
 * Gère l'envoi des emails de vérification, de confirmation de rendez-vous, de paiement/recharge et des alertes Admin.
 */

// Création du transporteur Nodemailer dynamique
const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  if (!host || !user || !pass) {
    console.warn('⚠️ [EMAIL SERVICE] SMTP non configuré dans .env (SMTP_HOST, SMTP_USER, SMTP_PASS manquants). Mode fallback console activé.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });
};

/**
 * Envoie un email générique
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.SMTP_FROM || `"BeautyFlow" <${process.env.SMTP_USER || 'no-reply@beautyflow.app'}>`;
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n================= 📧 [DEMO EMAIL OUTPUT] =================`);
    console.log(`DE : ${from}`);
    console.log(`À : ${to}`);
    console.log(`SUJET : ${subject}`);
    console.log(`CONTENU : \n${text || html}`);
    console.log(`===========================================================\n`);
    return { success: true, mode: 'console' };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`✅ [EMAIL SERVICE] Email envoyé à ${to} | MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [EMAIL SERVICE] Échec de l'envoi d'email à ${to}:`, error.message);
    throw error;
  }
};

/**
 * Alerte l'Administrateur BeautyFlow par Email lors des évènements système importants
 */
const sendAdminNotificationEmail = async ({ subject, detailsHtml, text }) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'admin@beautyflow.app';
  if (!adminEmail) return;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 24px; }
        .badge { background-color: #ec4899; color: #ffffff; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .details { background-color: #0f172a; border-radius: 12px; padding: 16px; margin-top: 16px; border: 1px solid #334155; color: #cbd5e1; }
      </style>
    </head>
    <body>
      <div class="container">
        <span class="badge">Alerte Système Admin BeautyFlow</span>
        <h2 style="margin-top: 12px; color: #38bdf8;">${subject}</h2>
        <div class="details">${detailsHtml}</div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: adminEmail,
    subject: `[ADMIN ALERT] ${subject}`,
    html,
    text: text || subject
  }).catch(err => console.error('Error sending admin alert email:', err.message));
};

/**
 * Envoie l'email avec le code de vérification OTP pour l'inscription d'un affilié
 */
const sendAffiliateVerificationEmail = async ({ to, name, code }) => {
  const subject = `${code} est votre code de vérification - BeautyFlow Partners`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; tracking-tight; }
        .content { padding: 32px 24px; text-align: center; }
        .code-box { background-color: #f1f5f9; border: 2px dashed #ec4899; border-radius: 12px; padding: 16px 24px; margin: 24px 0; font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #db2777; display: inline-block; }
        .footer { background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>BeautyFlow Partners 🚀</h1>
        </div>
        <div class="content">
          <h2>Bonjour ${name || 'Partenaire'},</h2>
          <p>Bienvenue dans le programme d'affiliation BeautyFlow ! Veuillez saisir le code ci-dessous pour vérifier votre adresse email :</p>
          <div class="code-box">${code}</div>
          <p style="font-size: 13px; color: #64748b;">Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} BeautyFlow - Solution N°1 pour Salons de Beauté.
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `Bonjour ${name || 'Partenaire'},\n\nVoici votre code de vérification d'email BeautyFlow Partners : ${code}\n\nL'équipe BeautyFlow.`;

  // Alerte à l'admin d'une nouvelle inscription d'affilié
  sendAdminNotificationEmail({
    subject: `Nouvel Affilié Inscrit : ${name || 'Partenaire'}`,
    detailsHtml: `<p><strong>Nom :</strong> ${name}</p><p><strong>Email :</strong> ${to}</p><p><strong>Statut :</strong> Code OTP envoyé (${code})</p>`
  });

  return sendEmail({ to, subject, html, text });
};

/**
 * Envoie l'email de confirmation de rendez-vous
 */
const sendBookingConfirmationEmail = async ({ to, name, salonName, serviceName, date, time, reference }) => {
  const subject = `Confirmation de RDV chez ${salonName} - Ref #${reference}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #10b981 0%, #0d9488 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
        .content { padding: 32px 24px; }
        .details-card { background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #cbd5e1; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
        .footer { background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Réservation Confirmée ! ✨</h1>
        </div>
        <div class="content">
          <h2>Bonjour ${name || 'Client(e)'},</h2>
          <p>Votre rendez-vous chez <strong>${salonName}</strong> a été confirmé avec succès.</p>
          
          <div class="details-card">
            <div class="detail-row"><strong>Référence :</strong> <span>#${reference}</span></div>
            <div class="detail-row"><strong>Prestation :</strong> <span>${serviceName}</span></div>
            <div class="detail-row"><strong>Date :</strong> <span>${date}</span></div>
            <div class="detail-row"><strong>Heure :</strong> <span>${time}</span></div>
          </div>
          
          <p style="font-size: 13px; color: #64748b;">Merci de votre confiance et à très bientôt en salon !</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} BeautyFlow.
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `Bonjour ${name},\n\nVotre rendez-vous chez ${salonName} pour ${serviceName} le ${date} à ${time} est confirmé ! (Ref #${reference})`;

  if (to) {
    sendEmail({ to, subject, html, text }).catch(e => console.warn(e.message));
  }

  // Copie d'alerte pour l'Admin
  sendAdminNotificationEmail({
    subject: `Nouveau Rendez-vous : ${salonName} - ${serviceName}`,
    detailsHtml: `<p><strong>Salon :</strong> ${salonName}</p>
                  <p><strong>Client :</strong> ${name} (${to || 'Tel uniquement'})</p>
                  <p><strong>Date & Heure :</strong> ${date} à ${time}</p>
                  <p><strong>Réf :</strong> #${reference}</p>`
  });

  return { success: true };
};

/**
 * Envoie un email de notification de paiement / recharge réussi (Client + Copie Admin)
 */
const sendPaymentNotificationEmail = async ({ to, name, amount, reference, type, salonName }) => {
  const subject = `Confirmation de paiement (${amount?.toLocaleString('fr-FR')} FCFA) - Ref #${reference}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0; }
        .header { text-align: center; color: #059669; }
        .amount { font-size: 32px; font-weight: 900; color: #059669; text-align: center; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Paiement Reçu avec Succès ! 💳</h2>
        </div>
        <p>Bonjour ${name || 'Client(e)'},</p>
        <p>Votre paiement / recharge pour <strong>${type || 'Paiement BeautyFlow'}</strong> ${salonName ? `chez ${salonName}` : ''} a été validé.</p>
        <div class="amount">${amount?.toLocaleString('fr-FR')} FCFA</div>
        <p><strong>Référence de transaction :</strong> #${reference}</p>
        <p>Merci pour votre confiance !</p>
      </div>
    </body>
    </html>
  `;

  if (to) {
    sendEmail({ to, subject, html, text: `Paiement confirmé de ${amount} FCFA (Ref #${reference})` }).catch(e => console.warn(e.message));
  }

  // Alerte systématique à l'Admin
  sendAdminNotificationEmail({
    subject: `Nouveau Paiement / Recharge : ${amount?.toLocaleString('fr-FR')} FCFA`,
    detailsHtml: `<p><strong>Client / Salon :</strong> ${name || 'Client'} (${to || 'N/A'})</p>
                  <p><strong>Montant :</strong> ${amount?.toLocaleString('fr-FR')} FCFA</p>
                  <p><strong>Référence :</strong> #${reference}</p>
                  <p><strong>Type :</strong> ${type || 'Paiement'}</p>`
  });
};

/**
 * Envoie un email de confirmation d'abonnement salon (Salon + Copie Admin)
 */
const sendSubscriptionNotificationEmail = async ({ to, salonName, plan, amount, reference }) => {
  const subject = `Abonnement ${plan?.toUpperCase()} Activé pour ${salonName}`;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0; }
        .header { text-align: center; color: #6366f1; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Abonnement Activé ! 🎉</h2>
        </div>
        <p>Félicitations pour le salon <strong>${salonName}</strong> !</p>
        <p>Votre abonnement au plan <strong>${plan?.toUpperCase()}</strong> a été activé avec succès.</p>
        <p><strong>Montant réglé :</strong> ${amount?.toLocaleString('fr-FR')} FCFA</p>
        <p><strong>Référence :</strong> #${reference}</p>
        <p>Accédez dès maintenant à votre tableau de bord pour profiter de toutes les fonctionnalités Pro !</p>
      </div>
    </body>
    </html>
  `;

  if (to) {
    sendEmail({ to, subject, html, text: `Abonnement ${plan} activé pour ${salonName}. Ref #${reference}` }).catch(e => console.warn(e.message));
  }

  // Copie Admin
  sendAdminNotificationEmail({
    subject: `Nouvel Abonnement Salon : ${salonName} (${plan?.toUpperCase()})`,
    detailsHtml: `<p><strong>Salon :</strong> ${salonName}</p>
                  <p><strong>Plan :</strong> ${plan?.toUpperCase()}</p>
                  <p><strong>Montant :</strong> ${amount?.toLocaleString('fr-FR')} FCFA</p>
                  <p><strong>Référence :</strong> #${reference}</p>`
  });
};

module.exports = {
  sendEmail,
  sendAdminNotificationEmail,
  sendAffiliateVerificationEmail,
  sendBookingConfirmationEmail,
  sendPaymentNotificationEmail,
  sendSubscriptionNotificationEmail,
};
