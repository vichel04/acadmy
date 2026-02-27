# 📋 GUIDE DE DÉPLOIEMENT COMPLET
## Formations en Gestion de Projet — Intégration Makétou

---

## ⚠️ ÉTAPE 0 — Révoquer votre ancienne clé Makétou

1. Connectez-vous sur https://app.maketou.com
2. Allez dans Paramètres → API
3. Révoquez la clé exposée
4. Générez une nouvelle clé
5. Copiez-la précieusement

---

## ÉTAPE 1 — Créer un compte GitHub (gratuit)

1. Allez sur https://github.com
2. Créez un compte gratuit
3. Cliquez sur "New repository"
4. Nommez-le `formations-backend`
5. Cochez "Private" (privé — important pour la sécurité)
6. Cliquez "Create repository"

---

## ÉTAPE 2 — Uploader les fichiers backend sur GitHub

Uploadez ces 4 fichiers dans votre repo :
- `server.js`
- `package.json`
- `.gitignore`
- `.env.example`

⚠️ Ne jamais uploader le fichier `.env` (il contient votre clé secrète)

---

## ÉTAPE 3 — Déployer sur Render.com (gratuit)

1. Allez sur https://render.com
2. Créez un compte gratuit
3. Cliquez "New +" → "Web Service"
4. Connectez votre compte GitHub
5. Sélectionnez votre repo `formations-backend`
6. Configurez :
   - **Name** : `formations-paiement`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
7. Cliquez "Create Web Service"

### Ajouter les variables d'environnement sur Render :

Dans votre service Render → "Environment" → "Add Environment Variable" :

| Clé                  | Valeur                                    |
|----------------------|-------------------------------------------|
| MAKETOU_SECRET_KEY   | votre_nouvelle_cle_maketou                |
| SITE_URL             | https://votre-site.netlify.app            |
| SERVER_URL           | https://formations-paiement.onrender.com  |
| WHATSAPP_LINK        | https://chat.whatsapp.com/VOTRE_LIEN      |

8. Cliquez "Save Changes" → Render redéploie automatiquement

---

## ÉTAPE 4 — Récupérer l'URL de votre backend

Render vous donne une URL du type :
`https://formations-paiement.onrender.com`

Copiez cette URL.

---

## ÉTAPE 5 — Mettre à jour le fichier index.html

Dans le fichier `index.html`, trouvez cette ligne :

```javascript
const BACKEND_URL = 'https://votre-backend.onrender.com';
```

Remplacez par votre vraie URL Render :

```javascript
const BACKEND_URL = 'https://formations-paiement.onrender.com';
```

Également, remplacez le lien WhatsApp dans `success.html` :
```html
href="https://chat.whatsapp.com/VOTRE_LIEN_ICI"
```

---

## ÉTAPE 6 — Héberger le site sur Netlify (gratuit)

1. Allez sur https://netlify.com
2. Créez un compte gratuit
3. Glissez-déposez votre dossier contenant :
   - `index.html`
   - `success.html`
4. Netlify vous donne une URL publique instantanément

---

## ÉTAPE 7 — Vérifier que tout fonctionne

Testez en ouvrant :
`https://formations-paiement.onrender.com/`

Vous devez voir :
```json
{"status":"ok","message":"Serveur paiement Makétou opérationnel"}
```

Si oui — tout est prêt ! 🎉

---

## Architecture finale

```
Visiteur ouvre index.html (Netlify)
         ↓
Clique sur une formation → Modal s'ouvre
         ↓
Remplit le formulaire → Clique "Payer"
         ↓
index.html appelle → https://formations-paiement.onrender.com/create-payment
         ↓
Serveur appelle → API Makétou (clé secrète cachée sur le serveur)
         ↓
Makétou retourne → lien de paiement
         ↓
Visiteur est redirigé vers → Page de paiement Makétou (Mobile Money)
         ↓
Après paiement → success.html (lien WhatsApp + confirmation)
```

---

## En cas de problème

- Render logs : votre dashboard → "Logs"
- Vérifiez que MAKETOU_SECRET_KEY est bien définie dans Render
- Contactez le support Makétou pour confirmer les endpoints API exacts
