const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

// ─── CORS : autorise votre site Netlify à appeler ce serveur ─────────────────
// Remplacez par l'URL exacte de votre site Netlify
const ALLOWED_ORIGINS = [
  process.env.SITE_URL,                          // ex: https://votre-site.netlify.app
  'http://localhost:3000',                        // pour tests locaux
  'http://127.0.0.1:5500',                        // Live Server VS Code
  'http://localhost:5500',
];

app.use(cors({
  origin: function (origin, callback) {
    // Autorise les requêtes sans origin (Postman, curl) et les origines connues
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS bloqué pour:', origin);
      callback(new Error('Non autorisé par CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Répond aux preflight OPTIONS automatiquement
app.options('*', cors());

const MAKETOU_KEY  = process.env.MAKETOU_SECRET_KEY;
const SITE_URL     = process.env.SITE_URL     || 'https://academysmart.netlify.app';
const SERVER_URL   = process.env.SERVER_URL   || 'https://formations-academy.onrender.com';
const WA_LINK      = process.env.WHATSAPP_LINK || 'https://chat.whatsapp.com/EuyIBy1YB7z9dHT68cSoRR';

// ─── Route santé (GET /) ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status : 'ok',
    message: 'Serveur paiement Makétou opérationnel ✅',
    cle    : MAKETOU_KEY ? 'chargée ✓' : 'MANQUANTE ✗',
    site   : SITE_URL,
  });
});

// ─── Route keep-alive (évite la mise en veille Render) ───────────────────────
// Render endort les serveurs gratuits après 15 min d'inactivité.
// Ce ping automatique toutes les 14 min maintient le serveur éveillé.
const RENDER_URL = SERVER_URL;
setInterval(async () => {
  try {
    const r = await fetch(RENDER_URL + '/ping');
    console.log(`[keep-alive] ping → ${r.status}`);
  } catch (e) {
    console.warn('[keep-alive] ping échoué:', e.message);
  }
}, 14 * 60 * 1000); // toutes les 14 minutes

app.get('/ping', (req, res) => res.json({ alive: true, ts: new Date().toISOString() }));

// ─── Route principale : créer un paiement Makétou ────────────────────────────
app.post('/create-payment', async (req, res) => {
  const { prenom, nom, email, telephone, ville, formation, montant } = req.body;

  // 1. Validation
  const missing = [];
  if (!prenom)    missing.push('prenom');
  if (!nom)       missing.push('nom');
  if (!email)     missing.push('email');
  if (!telephone) missing.push('telephone');
  if (!formation) missing.push('formation');
  if (!montant)   missing.push('montant');

  if (missing.length > 0) {
    return res.status(400).json({ error: 'Champs manquants : ' + missing.join(', ') });
  }

  // 2. Clé API présente ?
  if (!MAKETOU_KEY) {
    console.error('❌ MAKETOU_SECRET_KEY non définie dans les variables d\'environnement Render');
    return res.status(500).json({ error: 'Configuration serveur manquante. Contactez l\'administrateur.' });
  }

  // 3. Appel API Makétou
  try {
    console.log(`📤 Création paiement — ${formation} — ${montant} XAF — ${email}`);

    const maketouResponse = await fetch('https://api.maketou.com/v1/orders', {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${MAKETOU_KEY}`,
        'X-Secret-Key' : MAKETOU_KEY,
        'X-API-Key'    : MAKETOU_KEY,
      },
      body: JSON.stringify({
        amount     : Number(montant),
        currency   : 'XAF',
        description: `Inscription — ${formation}`,
        customer: {
          first_name: prenom,
          last_name : nom,
          email     : email,
          phone     : telephone,
          city      : ville || '',
        },
        metadata: { formation, prenom, nom, email },
        success_url: `${SITE_URL}/success.html?formation=${encodeURIComponent(formation)}&prenom=${encodeURIComponent(prenom)}`,
        cancel_url : SITE_URL,
        webhook_url: `${SERVER_URL}/webhook`,
      }),
    });

    // Vérifier le statut HTTP d'abord
    if (!maketouResponse.ok) {
      const errText = await maketouResponse.text();
      console.error(`❌ Makétou HTTP ${maketouResponse.status}:`, errText);
      return res.status(400).json({
        error  : `Erreur Makétou (${maketouResponse.status})`,
        details: errText,
      });
    }

    const data = await maketouResponse.json();
    console.log('📥 Réponse Makétou:', JSON.stringify(data, null, 2));

    // Chercher le lien de paiement quel que soit le nom du champ
    const paymentUrl =
      data.payment_url   ||
      data.checkout_url  ||
      data.redirect_url  ||
      data.url           ||
      data.data?.payment_url ||
      data.data?.url;

    if (paymentUrl) {
      console.log('✅ Lien paiement généré:', paymentUrl);
      return res.json({ success: true, payment_url: paymentUrl });
    }

    // Makétou a répondu mais sans lien de paiement
    console.error('❌ Pas de payment_url dans la réponse:', data);
    return res.status(400).json({
      error  : data.message || 'Réponse Makétou inattendue — pas de lien de paiement',
      details: data,
    });

  } catch (err) {
    // Erreur réseau (Makétou inaccessible, timeout, etc.)
    console.error('❌ Erreur réseau vers Makétou:', err.message);
    return res.status(503).json({
      error  : 'Impossible de joindre le service de paiement Makétou',
      details: err.message,
    });
  }
});

// ─── Webhook Makétou (confirmation paiement) ─────────────────────────────────
app.post('/webhook', (req, res) => {
  const event = req.body;
  console.log('🔔 Webhook reçu:', JSON.stringify(event, null, 2));

  const status = event.status || event.payment_status;
  if (['paid', 'success', 'completed'].includes(status)) {
    const formation = event.metadata?.formation || '';
    const email     = event.customer?.email || event.metadata?.email || '';
    console.log(`✅ Paiement confirmé — ${email} — ${formation}`);
    // TODO: envoyer email avec lien WhatsApp via Resend, Mailgun, etc.
  }

  res.json({ received: true });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Serveur démarré — port ${PORT}`);
  console.log(`   Clé Makétou : ${MAKETOU_KEY ? '✓ présente' : '✗ MANQUANTE'}`);
  console.log(`   Site URL    : ${SITE_URL}`);
  console.log(`   Serveur URL : ${SERVER_URL}\n`);
});
