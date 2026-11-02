# Quality Passport · World Quality Week 2026

Web app statique qui remplace le passeport papier : un QR code par pilier, une question ouverte, une étoile par réponse, et un Quality Passport en PDF après les 4 étoiles. Programme : **Quality Powering Performance**. Trois séries de QR codes, une par lieu (série 1 en français, séries 2 et 3 en anglais).

- App en ligne : https://quality-passport.github.io/quality-passport/
- Questions et réponses : Google Sheet « Quality Report » (onglets `Questions`, `Responses S1` à `S3`, `Stars`)

## Les trois séries

Le passeport est installé dans **trois lieux**. Chaque lieu a sa **série** de 5 QR codes (4 piliers et 1 passeport) et ses propres questions :

| Série | Langue de l'app et des questions | Adresses |
| --- | --- | --- |
| 1 | français | `?s=1&p=1` à `?s=1&p=4`, passeport `?s=1` |
| 2 | anglais | `?s=2&p=1` à `?s=2&p=4`, passeport `?s=2` |
| 3 | anglais | `?s=3&p=1` à `?s=3&p=4`, passeport `?s=3` |

Le passeport est le même pour tous : une étoile par pilier, quelle que soit la série. Le participant ne voit jamais le numéro de série.

## Écrire les questions

Dans le Google Sheet, onglet **Questions** : une ligne par série et par pilier (12 lignes). Seule la colonne **Question** est à remplir.

- Une modification est visible sur les téléphones en 3 minutes au plus, sans rien publier.
- Les lignes peuvent être triées ou déplacées : chaque question est retrouvée par ses colonnes Série et Pilier.
- Une case vide affiche la question par défaut de la langue (« Dites-nous ce que vous en retenez. » / « Tell us what you took away from it. »).
- Conseil : 140 caractères au plus, pour que l'écran tienne sans défilement sur un petit iPhone. Au-delà, l'écran défile ; 500 caractères au maximum.
- Si Google ne répond pas ou si l'onglet est renommé, les téléphones gardent la dernière version reçue.

## Lire les réponses

| Onglet | Contenu |
| --- | --- |
| `Responses S1`, `S2`, `S3` | les réponses de chaque série, avec la question affichée à côté de chaque réponse |
| `Responses` | les réponses sans série (tests, anciennes versions de l'app) |
| `Stars` | une ligne par personne, toutes séries : séries, étoile par pilier, total |

Les colonnes peuvent être déplacées : le script les retrouve par leur nom. Ne pas renommer les onglets (un onglet de réponses manquant est recréé vide). Supprimer une ligne du Sheet ne la supprime pas de Cloudflare : l'étoile reste sur le passeport de la personne.

## Mettre à jour (dans cet ordre)

1. **Script Google** : Extensions > Apps Script, coller [`apps-script/Code.gs`](apps-script/Code.gs) en entier, enregistrer, exécuter **setup** une fois (crée les onglets manquants sans toucher aux données ; Google demande une autorisation : ton compte, puis **Paramètres avancés > Accéder au projet**). Puis **Déployer > Nouveau déploiement** (Application Web, Exécuter en tant que : Moi, Accès : Tout le monde) et copier l'URL `/exec`.
2. **Cloudflare** : mettre cette URL dans `SHEET_URL` de `worker/wrangler.jsonc`, puis `cd worker && npx wrangler d1 migrations apply quality-passport --remote && npx wrangler deploy`. Le premier déploiement crée l'espace KV des questions.
3. **App** : publier le dépôt (GitHub Pages, branche `main`).

Chaque étape reste compatible avec la précédente. Éviter de publier l'app pendant l'événement : un téléphone peut garder l'ancienne version en cache une dizaine de minutes. Les questions, elles, se changent dans le Sheet sans rien publier.

## Tester sur ton téléphone

Scanne `qr/serie-1-pilier-1.png` (ou affiche-le à l'écran) : l'app doit être en français. Entre ton email, réponds. La réponse apparaît dans l'onglet `Responses S1` en 1 à 3 minutes, avec la question affichée ; l'onglet `Stars` montre ta ligne. Fais de même avec `qr/serie-2-pilier-2.png` : l'app passe en anglais et ton passeport compte 2 étoiles.

## Les QR codes

Dans [`qr/`](qr/) : 15 codes, `serie-S-pilier-1` à `serie-S-pilier-4` (une question chacun) et `serie-S-passeport` (le passeport, pour l'accueil), pour S = 1, 2, 3. Chaque code porte son étiquette imprimée dessous (« Série 2 · Pilier 3 »… « Série 2 · Passeport »). Pour l'impression, chacun existe en **SVG** (vectoriel, net à toute taille : à donner à l'imprimeur) et en **PNG 4096 px de large** (environ 35 cm à 300 dpi). Garder la marge blanche autour du code et au moins 3 cm de côté.

Ils pointent vers https://quality-passport.github.io/quality-passport/ avec la série et le pilier : ces adresses ne changent plus, même si les questions changent. Les anciens codes sans série n'ouvrent plus de question.

## Comment ça marche

```
Téléphone (GitHub Pages)  --réponse / étoiles-->  Cloudflare Worker + base D1   (≈0,1 s, tient 500 envois simultanés)
          ▲                                             │ toutes les minutes : les nouvelles réponses en un lot,
          └──── questions (copie KV, servie au plus     │ et relecture de l'onglet Questions
                près du participant, dans chaque pays)   ▼
                                                  Apps Script  <-->  Google Sheet « Questions », « Responses S1-S3 », « Stars »
```

- La série du QR code fixe la langue de l'app et les questions. Au premier scan, le participant saisit son email pro une seule fois ; les questions arrivent pendant qu'il le tape, puis restent sur le téléphone.
- L'étoile s'allume tout de suite ; la réponse part vers Cloudflare en arrière-plan. Si le réseau manque, elle attend dans le téléphone et repart toute seule (et part quand même si la page est fermée).
- Cloudflare est la source de vérité ; le Google Sheet est la vue de l'équipe Qualité, mise à jour en 1 à 3 minutes. Une réponse renvoyée deux fois n'est enregistrée qu'une fois (identifiant unique). Chaque réponse garde le texte exact de la question affichée.
- Changement de navigateur (scanner intégré, autre téléphone) : les étoiles sont retrouvées grâce à l'email.
- Les piliers se découvrent au fur et à mesure : un pilier non scanné reste « To discover ».
- Une question ne s'ouvre qu'en scannant son QR code : l'app ne propose jamais de passer d'un pilier à l'autre.
- Après la 4ᵉ étoile : célébration, puis le Quality Passport en PDF (nom modifiable, accents gérés), à télécharger ou partager.

### Où sont les choses

| Élément | Où |
| --- | --- |
| API | https://quality-passport-api.videoclubz.workers.dev (Worker `quality-passport-api`, compte Cloudflare de Florian) |
| Base | D1 `quality-passport` (Europe de l'Ouest) |
| Copie des questions | espace KV `QUESTIONS` (créé au premier déploiement), relu chaque minute depuis l'onglet `Questions` |
| Copie vers le Sheet | `SHEET_URL` dans `worker/wrangler.jsonc` = déploiement Apps Script (actions `batch` et `questions`) |
| Sheet | « Quality Report » (Google Drive de Florian) |

Mettre à jour le Worker : `cd worker && npx wrangler deploy`. Voir les réponses en base : `npx wrangler d1 execute quality-passport --remote --command "SELECT * FROM responses ORDER BY ts DESC LIMIT 20"`.

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `config.js` | **Seul fichier à modifier** : adresse de l'API, langue de chaque série, piliers, textes anglais et français, question par défaut, couleurs |
| `index.html` | Structure des écrans |
| `css/` | `tokens.css` (charte Ipsen, police Rethink Sans), `base`, `components`, `screens`, `celebration` |
| `js/main.js` | Démarrage |
| `js/router.js` | Choix de l'écran selon l'URL (`?s=1..3&p=1..4`) et l'état |
| `js/lang.js` | Langue de la page (série du QR, sinon dernière série, sinon langue du téléphone) et dates |
| `js/questions.js` | Questions venues du Sheet, gardées sur le téléphone |
| `js/state.js` | État local du participant |
| `js/queue.js` | File d'attente d'envoi et restauration des étoiles |
| `js/backend/` | API Cloudflare réelle, ou faux backend (mode simulé) |
| `js/screens/` | Un fichier par écran |
| `js/passport/` | Dessin du passeport et export PDF (jsPDF, cdnjs) |
| `worker/` | API Cloudflare (Worker + D1 + KV), copie vers le Sheet et copie des questions |
| `apps-script/Code.gs` | Script Google à coller dans le Sheet (range les réponses par série, lit les questions, tient l'onglet Stars) |
| `qr/generate.mjs` | Génère et vérifie les QR codes |
| `tests/` | Tests automatiques |

Pas de framework, pas de compilation : les fichiers publiés sont ceux du dépôt.

## Pour un développeur

```bash
npm install
npx playwright install webkit chromium
npm run serve          # http://localhost:4173  (toujours en mode simulé ; ?live=1 pour la vraie API)
npm test               # tests du script Google et du Worker, puis Playwright (iPhone 13, Pixel 7, iPhone SE)
npm run qr -- https://quality-passport.github.io/quality-passport/
```

Mode simulé : quand `API_URL` est vide, et toujours en local sauf `?live=1`, les réponses sont stockées dans le navigateur (clé `wqw_mock_sheet`) et les questions viennent de la clé `wqw_mock_questions`. `?mockfail=1` fait échouer chaque envoi pour tester la file d'attente. L'app doit être servie en http (pas ouverte en double-cliquant `index.html`), car elle utilise des modules JavaScript.

Police : Rethink Sans, licence SIL Open Font License (`fonts/OFL.txt`).
