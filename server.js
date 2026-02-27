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

// ─── Santé ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status : 'ok',
    message: 'Serveur paiement Makétou opérationnel ✅',
    cle    : MAKETOU_KEY ? 'chargée ✓' : 'MANQUANTE ✗',
    site   : SITE_URL,
  });
});

// ─── Ping keep-alive ──────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.json({ alive: true, ts: new Date().toISOString() }));

// Auto-ping toutes les 14 min pour éviter la veille Render
setInterval(async () => {
  try {
    await fetch(`${SERVER_URL}/ping`);
    console.log('[keep-alive] ok');
  } catch (e) {
    console.warn('[keep-alive] échoué:', e.message);
  }
}, 14 * 60 * 1000);

// ─── Créer un paiement ────────────────────────────────────────────────────────
app.post('/create-payment', async (req, res) => {
  const { prenom, nom, email, telephone, ville, formation, montant } = req.body;

  const missing = ['prenom','nom','email','telephone','formation','montant'].filter(k => !req.body[k]);
  if (missing.length) return res.status(400).json({ error: 'Champs manquants : ' + missing.join(', ') });

  if (!MAKETOU_KEY) {
    console.error('MAKETOU_SECRET_KEY non définie');
    return res.status(500).json({ error: 'Clé API manquante sur le serveur' });
  }

  try {
    console.log(`📤 ${formation} — ${montant} XAF — ${email}`);

    const maketouRes = await fetch('https://api.maketou.com/v1/orders', {
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
        customer   : { first_name: prenom, last_name: nom, email, phone: telephone, city: ville || '' },
        metadata   : { formation, prenom, nom, email },
        success_url: `${SITE_URL}/success.html?formation=${encodeURIComponent(formation)}&prenom=${encodeURIComponent(prenom)}`,
        cancel_url : SITE_URL,
        webhook_url: `${SERVER_URL}/webhook`,
      }),
    });

    const text = await maketouRes.text();
    console.log(`📥 Makétou HTTP ${maketouRes.status}:`, text);

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    const paymentUrl =
      data.payment_url  || data.checkout_url || data.redirect_url || data.url ||
      data.data?.payment_url || data.data?.url;

    if (paymentUrl) {
      console.log('✅ Lien paiement:', paymentUrl);
      return res.json({ success: true, payment_url: paymentUrl });
    }

    console.error('❌ Pas de payment_url:', data);
    return res.status(400).json({ error: data.message || 'Pas de lien de paiement dans la réponse Makétou', details: data });

  } catch (err) {
    console.error('❌ Erreur:', err.message);
    return res.status(503).json({ error: 'Impossible de joindre Makétou : ' + err.message });
  }
});

// ─── Webhook ──────────────────────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  const event  = req.body;
  const status = event.status || event.payment_status;
  if (['paid','success','completed'].includes(status)) {
    console.log(`✅ Paiement confirmé — ${event.customer?.email} — ${event.metadata?.formation}`);
  }
  res.json({ received: true });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Port ${PORT} | Clé: ${MAKETOU_KEY ? '✓' : '✗ MANQUANTE'} | Site: ${SITE_URL}\n`);
});
