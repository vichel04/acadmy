const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

// ─── CORS ouvert ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());

const MAKETOU_KEY = process.env.MAKETOU_SECRET_KEY;
const SITE_URL    = process.env.SITE_URL    || 'https://matcademy.netlify.app';
const SERVER_URL  = process.env.SERVER_URL  || 'https://formations-academy.onrender.com';
const WA_LINK     = process.env.WHATSAPP_LINK || 'https://chat.whatsapp.com/EuyIBy1YB7z9dHT68cSoRR';

// ─── IDs des produits Makétou (un par formation) ─────────────────────────────
// Récupérez ces IDs dans votre dashboard Makétou → Boutique → Produit → Partager
const PRODUCT_IDS = {
  'Gestion de Projet'                              : '619a92a3-f061-4eb2-a35a-d165eb114721',
  'Gestion Axée sur les Résultats (GAR)'           : '619a92a3-f061-4eb2-a35a-d165eb114721',
  'Planification et Suivi Opérationnel des Projets': '619a92a3-f061-4eb2-a35a-d165eb114721',
  'Suivi & Évaluation des Projets (S&E)'           : '619a92a3-f061-4eb2-a35a-d165eb114721',
};

// ─── Santé ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status  : 'ok',
    message : 'Serveur paiement Makétou opérationnel ✅',
    cle     : MAKETOU_KEY ? 'chargée ✓' : 'MANQUANTE ✗',
    produits: PRODUCT_IDS,
  });
});

// ─── Ping keep-alive ──────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.json({ alive: true, ts: new Date().toISOString() }));

setInterval(async () => {
  try { await fetch(`${SERVER_URL}/ping`); console.log('[keep-alive] ok'); }
  catch (e) { console.warn('[keep-alive] échoué:', e.message); }
}, 14 * 60 * 1000);

// ─── Créer un paiement ────────────────────────────────────────────────────────
app.post('/create-payment', async (req, res) => {
  const { prenom, nom, email, telephone, ville, formation, montant } = req.body;

  // Validation
  const missing = ['prenom','nom','email','telephone','formation'].filter(k => !req.body[k]);
  if (missing.length) return res.status(400).json({ error: 'Champs manquants : ' + missing.join(', ') });

  if (!MAKETOU_KEY) {
    return res.status(500).json({ error: 'Clé API manquante sur le serveur' });
  }

  // Récupérer le productDocumentId selon la formation
  const productDocumentId = PRODUCT_IDS[formation];
  if (!productDocumentId || productDocumentId.startsWith('REMPLACER')) {
    console.error('productDocumentId manquant pour:', formation);
    return res.status(400).json({ error: `Produit Makétou non configuré pour : ${formation}` });
  }

  try {
    console.log(`📤 ${formation} — ${email} — produit: ${productDocumentId}`);

    const maketouRes = await fetch('https://api.maketou.net/api/v1/stores/cart/checkout', {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${MAKETOU_KEY}`,
      },
      body: JSON.stringify({
        productDocumentId,
        email,
        firstName  : prenom,
        lastName   : nom,
        phone      : telephone,
        redirectURL: `${SITE_URL}/success.html?formation=${encodeURIComponent(formation)}&prenom=${encodeURIComponent(prenom)}`,
        meta: {
          formation,
          ville : ville || '',
          source: 'matcademy.netlify.app',
        },
      }),
    });

    const text = await maketouRes.text();
    console.log(`📥 Makétou HTTP ${maketouRes.status}:`, text);

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // Cherche l'URL de paiement dans la réponse
    const paymentUrl =
      data.url           ||
      data.payment_url   ||
      data.checkout_url  ||
      data.redirect_url  ||
      data.checkoutUrl   ||
      data.redirectUrl   ||
      data.data?.url     ||
      data.data?.payment_url ||
      data.data?.checkoutUrl;

    if (paymentUrl) {
      console.log('✅ Lien paiement:', paymentUrl);
      return res.json({ success: true, payment_url: paymentUrl });
    }

    console.error('❌ Pas de payment_url dans la réponse:', data);
    return res.status(400).json({
      error  : data.message || data.error || 'Pas de lien de paiement dans la réponse Makétou',
      details: data,
    });

  } catch (err) {
    console.error('❌ Erreur réseau:', err.message);
    return res.status(503).json({ error: 'Impossible de joindre Makétou : ' + err.message });
  }
});

// ─── Webhook ──────────────────────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  const event  = req.body;
  const status = event.status || event.payment_status;
  if (['paid','success','completed'].includes(status)) {
    console.log(`✅ Paiement confirmé — ${event.email} — ${event.meta?.formation}`);
  }
  res.json({ received: true });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Port ${PORT} | Clé: ${MAKETOU_KEY ? '✓' : '✗ MANQUANTE'} | Site: ${SITE_URL}\n`);
});
