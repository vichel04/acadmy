const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors()); // autorise votre site HTML à appeler ce serveur

const MAKETOU_SECRET_KEY = process.env.MAKETOU_SECRET_KEY;
const MAKETOU_API_URL    = 'https://api.maketou.com/v1'; // à ajuster si nécessaire
const WHATSAPP_LINK      = process.env.WHATSAPP_LINK || 'https://chat.whatsapp.com/VOTRE_LIEN_ICI';

// ─── Santé du serveur ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Serveur paiement Makétou opérationnel' });
});

// ─── Créer une session de paiement ──────────────────────────────────────────
// Appelé par votre site quand le client soumet le formulaire
app.post('/create-payment', async (req, res) => {
  const { prenom, nom, email, telephone, ville, formation, montant } = req.body;

  // Validation basique
  if (!prenom || !nom || !email || !telephone || !formation || !montant) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    const response = await fetch(`${MAKETOU_API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAKETOU_SECRET_KEY}`,
        'X-API-Key': MAKETOU_SECRET_KEY, // certaines APIs utilisent ce header
      },
      body: JSON.stringify({
        amount: montant,
        currency: 'XAF',
        customer: {
          first_name: prenom,
          last_name: nom,
          email: email,
          phone: telephone,
          city: ville,
        },
        metadata: {
          formation: formation,
        },
        description: `Inscription — ${formation}`,
        success_url: `${process.env.SITE_URL || 'https://votre-site.netlify.app'}/success.html?formation=${encodeURIComponent(formation)}&prenom=${encodeURIComponent(prenom)}`,
        cancel_url:  `${process.env.SITE_URL || 'https://votre-site.netlify.app'}`,
        webhook_url: `${process.env.SERVER_URL || 'https://votre-backend.onrender.com'}/webhook`,
      }),
    });

    const data = await response.json();
    console.log('Réponse Makétou:', data);

    if (data.payment_url || data.checkout_url || data.redirect_url || data.url) {
      // Récupère le lien quel que soit le nom du champ
      const paymentUrl = data.payment_url || data.checkout_url || data.redirect_url || data.url;
      return res.json({ success: true, payment_url: paymentUrl });
    }

    // Si l'API retourne une erreur
    return res.status(400).json({ error: data.message || 'Erreur Makétou', details: data });

  } catch (err) {
    console.error('Erreur serveur:', err);
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
});

// ─── Webhook — confirmation paiement ────────────────────────────────────────
// Makétou appelle cette route après un paiement réussi
app.post('/webhook', (req, res) => {
  const event = req.body;
  console.log('Webhook Makétou reçu:', JSON.stringify(event, null, 2));

  // Ici vous pouvez : envoyer un email, enregistrer en base, etc.
  // Pour l'instant on log juste et on confirme à Makétou
  if (event.status === 'paid' || event.status === 'success' || event.status === 'completed') {
    const { email, formation } = event.metadata || event.customer || {};
    console.log(`✅ Paiement confirmé pour ${email} — ${formation}`);
    // TODO: envoyer email automatique avec lien WhatsApp
  }

  res.json({ received: true });
});

// ─── Démarrage ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`   Clé Makétou: ${MAKETOU_SECRET_KEY ? '✓ chargée' : '✗ MANQUANTE'}`);
});
