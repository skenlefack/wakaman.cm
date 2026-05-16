# Wakaman — Journal d'implémentation

## Vue d'ensemble de l'avancement

| Module | Statut | Dernière mise à jour | Notes |
|--------|--------|----------------------|-------|
| Users | **Complet** — CRUD profil + admin | 2026-05-16 | GET/PATCH/DELETE /me, GET/list admin, PATCH status admin |
| Auth | **Complet** (3/3 features) | 2026-05-16 | Signup, login, refresh, logout, logout-all, sessions, cleanup |
| Clients | Non commencé | — | Profil client, adresses, favoris |
| Couriers | Non commencé | — | Onboarding, KYC, position temps réel |
| Merchants | Partiel — feature 1/3 (CRUD, team, hours) | 2026-05-16 | Catalog (products/categories) et géo-search restants |
| Catalog | Partiel — feature 2/3 (categories, products, options) | 2026-05-16 | Géo-search Meilisearch = feature 3 |
| Orders | Non commencé | — | Création, state machine, assignation |
| Payments | Non commencé | — | MTN MoMo, Orange Money, wallet |
| Tracking | Non commencé | — | WebSocket, position coursier |
| Notifications | Non commencé | — | Push (FCM), SMS, email, in-app |
| Support | Non commencé | — | Tickets, messages |
| Wallet | Non commencé | — | Solde, transactions, cashback |

---

## Modules

### Users

- **Rôle et responsabilité** : CRUD profil utilisateur authentifié + opérations admin (list, get, change status). Ne gère PAS l'inscription/connexion (module Auth).
- **Endpoints exposés** :

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/v1/users/me` | JWT | Profil de l'utilisateur connecté (cache Redis 5 min) |
| PATCH | `/api/v1/users/me` | JWT | Modifier son profil (firstName, lastName, email, language, avatarUrl) |
| DELETE | `/api/v1/users/me` | JWT | Soft delete de son compte (deletedAt + sessions révoquées) |
| GET | `/api/v1/users/:id` | JWT + ADMIN | Récupérer un utilisateur par ID |
| GET | `/api/v1/users` | JWT + ADMIN | Lister les utilisateurs (paginé, filtres type/status/search) |
| PATCH | `/api/v1/users/:id/status` | JWT + ADMIN | Suspendre, bannir ou réactiver un utilisateur |

- **Modèles de données utilisés** : `User`, `Session` (via AuthRepository pour revoke)
- **Décisions d'architecture** :
  1. **Cache Redis sur GET /users/me (TTL 5 min)** : le profil est lu fréquemment (chaque ouverture d'app). Cache invalidé sur PATCH /me, DELETE /me, et PATCH /:id/status. Clé : `user:{userId}`. Alternative rejetée : cache HTTP (moins contrôlable côté invalidation).
  2. **`requireAdmin` comme simple décorateur** : `fastify.requireAdmin` vérifie `request.user.type === 'ADMIN'`. Pas de RBAC complet — suffisant pour Phase 1. Le décorateur est séparé de `authenticate` pour pouvoir être composé (`preHandler: [authenticate, requireAdmin]`). RBAC à ajouter quand les rôles marchand/support auront besoin de permissions granulaires.
  3. **Admin ne peut pas se ban lui-même** : `updateUserStatus` compare `targetUserId === adminUserId` → 400 `ValidationError`. Prévient le verrouillage accidentel. Alternative rejetée : autoriser (trop risqué, un seul admin en Phase 1).
  4. **DELETE /me = soft delete + revoke all** : `deletedAt = now()`, `status = DELETED`, toutes les sessions révoquées. Le phone reste unique en base (l'utilisateur ne peut pas se réinscrire avec le même numéro). Pas de hard delete pour conformité/audit.
  5. **Admin GET /:id retourne aussi les comptes DELETED** : contrairement à GET /me qui filtre `deletedAt: null`, l'admin voit tout. Utile pour le support.
  6. **UsersService dépend de AuthRepository** : pour `revokeAllUserSessions` lors de DELETE /me et PATCH /:id/status (SUSPENDED/BANNED). Dépendance légitime — évite de dupliquer la logique de révocation.
  7. **Redis blocklist pour invalidation immédiate des access tokens** : quand un user passe SUSPENDED/BANNED/DELETED, un `blocked:{userId}` est écrit dans Redis avec TTL 15 min (= durée access token). `fastify.authenticate` consulte cette clé après vérification JWT — si présente → 403 immédiat. Quand le user est réactivé, la clé est supprimée. Alternative rejetée : check DB du statut user sur chaque requête authentifiée (latence DB sur chaque requête, coûteux en connection pool).
  8. **Fail-open explicite si Redis est indisponible** : le `try/catch` dans `fastify.authenticate` (server.ts L159-167) attrape toute erreur Redis (down, timeout, network) et laisse passer la requête avec un `request.log.warn`. Justification : (a) exposure max 15 min car l'access token expire naturellement, (b) le refresh endpoint vérifie le statut user en DB (hard gate), (c) un fail-closed (503) déconnecterait TOUS les utilisateurs si Redis tombe — inacceptable en production. Le log warn permet d'alerter via Sentry/monitoring sans impacter le trafic. Alternative rejetée : fail-closed / 503 (risque de déni de service global si Redis flap).
- **Dépendances vers d'autres modules** : Auth (AuthRepository pour révocation sessions)
- **Points de vigilance / dette technique connue** :
  - Email modifiable sans vérification — stocker l'email suffit pour Phase 1. Vérification email (envoi de lien) = feature future. Documenter dans le schema que `emailVerifiedAt` reste `null` tant que la vérification n'est pas implémentée.
  - Pas de route POST /users (création admin) — les users sont créés via le signup OTP uniquement. À ajouter si besoin admin.
  - Pas de PATCH /users/:id complet (admin edit) — seul le status est modifiable par admin pour l'instant.
  - Le search dans GET /users est un ILIKE basique — pas de full-text search Meilisearch. Suffisant pour < 10K users.
- **Comment tester manuellement** :
  ```bash
  # 1. Mon profil (authentifié)
  curl http://localhost:3000/api/v1/users/me \
    -H "Authorization: Bearer <accessToken>"

  # 2. Modifier mon profil
  curl -X PATCH http://localhost:3000/api/v1/users/me \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{"firstName": "Pierre", "lastName": "Kamga"}'

  # 3. Supprimer mon compte
  curl -X DELETE http://localhost:3000/api/v1/users/me \
    -H "Authorization: Bearer <accessToken>"

  # 4. (Admin) Lister les utilisateurs
  curl "http://localhost:3000/api/v1/users?type=CLIENT&page=1&pageSize=10" \
    -H "Authorization: Bearer <adminAccessToken>"

  # 5. (Admin) Suspendre un utilisateur
  curl -X PATCH http://localhost:3000/api/v1/users/usr_abc123/status \
    -H "Authorization: Bearer <adminAccessToken>" \
    -H "Content-Type: application/json" \
    -d '{"status": "SUSPENDED", "reason": "Abuse signalé"}'
  ```
- **Statut des tests automatisés** : 25 tests unitaires couvrant : GET /me (profil, cache, deleted), PATCH /me (update+invalidate, not found), DELETE /me (soft delete+revoke+invalidate+blocklist, already deleted), GET /:id admin (include deleted, not found), GET /users (pagination, defaults, filtre type, filtre status, filtre search, filtres combinés), PATCH status (suspend+revoke+blocklist, ban+revoke+blocklist, reactivate+remove blocklist, self-ban rejected, not found, cache invalidation), blocklist (delete adds to blocklist)

---

### Auth

- **Rôle et responsabilité** : Inscription et connexion par OTP SMS, gestion JWT (access + refresh tokens), sessions.
- **Endpoints exposés** :

| Méthode | Route | Auth | Description | Statut |
|---------|-------|------|-------------|--------|
| POST | `/api/v1/auth/signup` | Non | Envoie un OTP 6 chiffres par SMS | Implémenté |
| POST | `/api/v1/auth/verify-otp` | Non | Vérifie l'OTP, crée le compte, retourne JWT tokens (auto-login) | Implémenté |
| POST | `/api/v1/auth/login` | Non | Connexion par OTP (envoie un code). Rejette numéros non inscrits, suspendus, bannis | Implémenté |
| POST | `/api/v1/auth/verify-login-otp` | Non | Vérifie OTP login, crée Session, retourne `{ user, accessToken, refreshToken }` | Implémenté |
| POST | `/api/v1/auth/refresh` | Non (rate limited) | Échange refresh token → nouveau token pair (rotation). Vérifie session + statut compte | Implémenté |
| POST | `/api/v1/auth/logout` | JWT | Révoque la session associée au refresh token fourni. Idempotent | Implémenté |
| POST | `/api/v1/auth/logout-all` | JWT | Révoque toutes les sessions actives de l'utilisateur | Implémenté |
| GET | `/api/v1/auth/sessions` | JWT | Liste les sessions actives (device, IP, date) pour écran "appareils connectés" | Implémenté |

- **Modèles de données utilisés** : `User`, `Session`, `OTPCode`
- **Décisions d'architecture** :
  1. **SHA-256 pour hash OTP (pas bcrypt)** : bcrypt est conçu pour des passwords à forte entropie. Un OTP 6 chiffres n'a que 1M de combinaisons — bcrypt n'ajoute pas de sécurité significative car le brute-force est déjà bloqué par la limite de 3 tentatives + rate limit 5 req/min/IP + expiration 5 min. SHA-256 est instantané et suffisant ici. Alternative rejetée : bcrypt (lent sans bénéfice de sécurité pour les OTP).
  2. **`type` requis dans verify-otp body** : le type utilisateur (CLIENT/COURIER/MERCHANT) est envoyé à nouveau lors de la vérification plutôt que stocké dans la table OTPCode. Cela garde le modèle OTPCode générique et réutilisable pour login/reset. Alternative rejetée : ajouter une colonne `metadata JSON` au modèle OTPCode (complexité inutile).
  3. **SmsProvider comme interface** : permet de switcher Twilio (prod) / FakeSmsProvider (dev/test) via le container DI. Le choix se fait dans `container.ts` basé sur `NODE_ENV`. Alternative rejetée : mock/stub dans les tests uniquement (ne permet pas le dev local sans compte Twilio).
  4. **Twilio sans SDK** : utilise `fetch` natif Node.js 22 pour appeler l'API REST Twilio directement. Évite une dépendance lourde. Alternative rejetée : `twilio` npm package (150+ fichiers, overkill pour du SMS).
  5. **Auto-login après verify-otp** : le signup retourne uniquement "OTP envoyé" (pas de token), mais verify-otp crée le compte ET retourne `{ user, accessToken, refreshToken }`. L'utilisateur est immédiatement authentifié après vérification. Alternative rejetée : séparer signup et login (mauvaise UX — oblige un double flux inutile au premier contact).
  6. **TokenService extrait et réutilisable** : la génération de JWT + refresh token + création de Session est dans un `TokenService` séparé, pas dans AuthService. Login (feature 2) et refresh (feature 2) réutiliseront le même service. Alternative rejetée : générer les tokens directement dans AuthService (dupliquerait la logique pour login).
  7. **jwtSign injecté via DI (pas de couplage Fastify)** : `fastify.jwt.sign` est enregistré dans le container Awilix depuis `server.ts` après chargement du plugin `@fastify/jwt`. TokenService reçoit une fonction `JwtSign` typée, pas l'instance Fastify. Alternative rejetée : utiliser `jsonwebtoken` ou `fast-jwt` directement (ajoute une dépendance et diverge du plugin déjà configuré).
  8. **Refresh token hashé en DB (SHA-256)** : le refresh token est stocké hashé dans la table `sessions`, pas en clair. Si la DB est compromise, les tokens ne sont pas exploitables. Le token en clair n'est retourné qu'une fois au client.
  9. **Gestion du signup abandonné et des race conditions** : verify-otp gère 3 cas après OTP valide — (a) user déjà vérifié → 409 Conflict, (b) user existant mais non vérifié (signup abandonné) → `activateUser` passe le compte en ACTIVE au lieu de re-créer, (c) nouveau user → `createUser` avec catch Prisma P2002 pour les race conditions. Aucun chemin ne produit de 500 sur contrainte unique phone. Alternative rejetée : upsert Prisma (moins explicite, masque les cas métier distincts).
  10. **Message d'erreur générique pour login (anti-énumération)** : quand le numéro n'existe pas OU n'est pas vérifié, l'erreur retournée est `401 "Invalid credentials"` — identique dans les deux cas. Empêche un attaquant de deviner quels numéros sont inscrits. Alternative rejetée : message spécifique « numéro non inscrit » (fuite d'information).
  11. **Double vérification du statut SUSPENDED/BANNED** : vérifié à la fois dans `login()` (avant envoi OTP, pour ne pas gaspiller un SMS) et dans `verifyLoginOtp()` (après OTP valide, car le statut peut changer entre les deux appels). Alternative rejetée : vérifier uniquement dans login (race condition si l'admin suspend entre l'envoi OTP et la vérification).
  12. **OTP purpose séparé LOGIN vs SIGNUP** : les OTP login utilisent `purpose: 'LOGIN'`, distincts de `'SIGNUP'`. `invalidatePendingOtps` ne cible que le purpose courant — un OTP signup en cours n'est pas invalidé par une tentative login et vice-versa.
  13. **`updateLastLogin` au verify, pas au login** : `lastLoginAt` et `lastLoginIp` sont mis à jour uniquement quand le login réussit (OTP vérifié), pas quand le code est demandé. Reflète la réalité de la connexion.
  14. **Rotation du refresh token avec grace window Redis (30s)** : chaque refresh révoque l'ancien token et en émet un nouveau. La nouvelle paire de tokens est cachée dans Redis pendant 30s, clé = SHA-256 de l'ancien token, TTL = `REFRESH_GRACE_PERIOD_SECONDS`. Si un token révoqué est reçu et que Redis contient encore la paire de remplacement → retry transparent (la même paire est retournée, pas de re-rotation, pas d'all-revoke). Si Redis est vide (grace expirée) → détection de vol → toutes les sessions révoquées. Critique pour la 3G au Cameroun où la réponse HTTP peut se perdre après rotation côté serveur. Une seule constante `REFRESH_GRACE_PERIOD_SECONDS = 30` contrôle le TTL Redis et la fenêtre. Alternative rejetée A : token fixe sans rotation (pas de détection de vol). Alternative rejetée B : confirmation pending/confirmed (60-80 lignes + migration Prisma, complexité disproportionnée).
  15. **Max 5 sessions actives par utilisateur** : au-delà de 5 sessions non-révoquées non-expirées, la plus ancienne est automatiquement révoquée lors de la création d'une nouvelle (dans `generateTokenPair`). Alternative rejetée : limite stricte avec erreur (mauvaise UX — l'utilisateur ne sait pas quel appareil déconnecter).
  16. **Logout idempotent** : `POST /auth/logout` réussit silencieusement même si le token est déjà révoqué ou inexistant. Pas d'erreur 4xx — le résultat souhaité (session révoquée) est atteint dans tous les cas. Alternative rejetée : erreur 404 si token inconnu (fragilise les clients qui font du logout défensif).
  17. **POST /auth/refresh sans authenticate** : le refresh token est envoyé dans le body, pas via JWT. L'access token peut être expiré (c'est le use case principal du refresh). Rate limited à 5/min/IP comme les autres routes auth.
  18. **Purge sessions/OTP : logique prête, scheduler à brancher** : `AuthService.purgeExpired()` supprime les sessions expirées/révoquées et les OTP expirés. La fonction est appelable mais pas encore branchée sur un cron. À connecter via un scheduler (node-cron ou RabbitMQ delayed message) quand l'infra le permet.
  19. **Soft revoke (revokedAt, pas DELETE)** : les sessions révoquées gardent leur ligne en DB avec `revokedAt` renseigné. Permet l'audit et la détection de réutilisation de token. Le cleanup (purge) supprime physiquement les lignes expirées/révoquées plus tard.
- **Dépendances vers d'autres modules** : Aucune (crée les Users directement via son propre repository)
- **Points de vigilance / dette technique connue** :
  - Le rate limit auth (5/min/IP) est déclaré au niveau route via `config.rateLimit` — nécessite que `@fastify/rate-limit` supporte le override par route (vérifié OK avec Fastify 5)
  - Purge OTP/sessions : `AuthService.purgeExpired()` est prête, mais pas encore branchée sur un scheduler (node-cron, RabbitMQ delayed, ou GCP Cloud Scheduler)
  - Le `jwtSign` est enregistré dans le container depuis `server.ts` (après le plugin JWT) — les classes scoped ne sont résolues qu'au moment de la requête, donc le timing est correct
- **Comment tester manuellement** :
  ```bash
  # 1. Envoyer un OTP (en dev, le code est loggé par FakeSmsProvider)
  curl -X POST http://localhost:3000/api/v1/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"phone": "+237691234567", "type": "CLIENT"}'
  # → {"message":"Verification code sent","expiresInSeconds":300}

  # 2. Vérifier l'OTP (lire le code dans les logs Pino) — retourne user + tokens
  curl -X POST http://localhost:3000/api/v1/auth/verify-otp \
    -H "Content-Type: application/json" \
    -d '{"phone": "+237691234567", "code": "123456", "type": "CLIENT"}'
  # → {"user":{...},"accessToken":"eyJ...","refreshToken":"a1b2c3..."}

  # 3. Login (numéro déjà inscrit)
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"phone": "+237691234567"}'
  # → {"message":"Verification code sent","expiresInSeconds":300}

  # 4. Vérifier l'OTP login — retourne user + tokens
  curl -X POST http://localhost:3000/api/v1/auth/verify-login-otp \
    -H "Content-Type: application/json" \
    -d '{"phone": "+237691234567", "code": "654321"}'
  # → {"user":{...},"accessToken":"eyJ...","refreshToken":"a1b2c3..."}

  # 5. Utiliser l'access token pour les requêtes authentifiées
  curl http://localhost:3000/api/v1/users/me \
    -H "Authorization: Bearer <accessToken>"

  # 6. Rafraîchir les tokens (access expiré → utiliser le refresh token)
  curl -X POST http://localhost:3000/api/v1/auth/refresh \
    -H "Content-Type: application/json" \
    -d '{"refreshToken": "<refreshToken>"}'
  # → {"accessToken":"eyJ...","refreshToken":"b2c3d4..."}  (ancien token révoqué)

  # 7. Lister les sessions actives
  curl http://localhost:3000/api/v1/auth/sessions \
    -H "Authorization: Bearer <accessToken>"
  # → {"sessions":[{"id":"ses_...","deviceType":"android",...}]}

  # 8. Logout session courante
  curl -X POST http://localhost:3000/api/v1/auth/logout \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{"refreshToken": "<refreshToken>"}'

  # 9. Logout toutes les sessions
  curl -X POST http://localhost:3000/api/v1/auth/logout-all \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Statut des tests automatisés** : 34 tests unitaires couvrant login (5), verify-login-otp (11), refresh (9 dont grace window Redis + retry 3G), logout (4), logout-all (1), sessions (3), cleanup (1). Cas clés : retry 3G transparent dans grace window, all-revoke hors grace window, token révoqué/expiré, compte suspendu/banni, logout puis refresh échoue

---

### Clients

- **Rôle et responsabilité** : Profil client, adresses de livraison, favoris, points de fidélité.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Client`, `Address`, `User`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users, Auth
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Couriers

- **Rôle et responsabilité** : Onboarding coursiers, KYC (Smile Identity), position temps réel, statistiques de gains.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Courier`, `User`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users, Auth
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Merchants (feature 1/3 — CRUD, team, hours)

- **Rôle et responsabilité** : CRUD marchands, gestion d'équipe (OWNER/MANAGER/STAFF), horaires d'ouverture. Feature 2 = produits/catégories. Feature 3 = géo-search Meilisearch.
- **Endpoints exposés** :

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/v1/merchants` | Non | Liste publique ACTIVE, filtres city/type/search |
| GET | `/api/v1/merchants/:id` | Non | Détail public (ACTIVE uniquement, cache Redis 5min) |
| GET | `/api/v1/merchants/:id/hours` | Non | Horaires d'ouverture |
| POST | `/api/v1/merchants` | JWT | Créer un marchand (créateur = OWNER, status PENDING) |
| PATCH | `/api/v1/merchants/:id` | JWT + member | Modifier infos (tous rôles) |
| PUT | `/api/v1/merchants/:id/hours` | JWT + member | Remplacer les horaires (7 jours, transaction) |
| POST | `/api/v1/merchants/:id/pause` | JWT + member | Passer en PAUSED |
| POST | `/api/v1/merchants/:id/resume` | JWT + member | Repasser ACTIVE depuis PAUSED |
| GET | `/api/v1/merchants/:id/team` | JWT + member | Lister l'équipe |
| POST | `/api/v1/merchants/:id/team` | JWT + OWNER | Ajouter un membre (par phone) |
| DELETE | `/api/v1/merchants/:id/team/:userId` | JWT + OWNER | Retirer un membre |
| POST | `/api/v1/merchants/:id/approve` | JWT + ADMIN | Approuver (PENDING → ACTIVE) |
| POST | `/api/v1/merchants/:id/suspend` | JWT + ADMIN | Suspendre |
| GET | `/api/v1/admin/merchants` | JWT + ADMIN | Liste admin (tous statuts, tous filtres) |

- **Modèles de données utilisés** : `Merchant`, `MerchantUser`, `MerchantHours`, `User` (via AuthRepository pour findUserByPhone)
- **Décisions d'architecture** :
  1. **Rôles informatifs sauf OWNER pour team** : OWNER, MANAGER, STAFF sont tous autorisés à modifier le marchand (PATCH, hours, pause/resume). Seul OWNER peut gérer l'équipe (add/remove members). Alternative rejetée : permissions granulaires par rôle (RBAC complet overkill pour Phase 1, 1-3 personnes par marchand).
  2. **Membership via preHandler composable** : `requireMerchantMember` et `requireMerchantOwner` sont des fonctions dans le fichier routes, pas des décorateurs globaux. Ils appellent `MerchantsService.verifyMembership()`. Alternative rejetée : décorateur Fastify global (trop couplé, pas réutilisable par module).
  3. **Création atomique (transaction Prisma)** : `Merchant` + `MerchantUser(OWNER)` sont créés dans une seule `$transaction`. Pas de marchand orphelin si l'insertion du membership échoue. Le marchand naît en PENDING et n'apparaît pas dans les requêtes publiques tant qu'un admin n'a pas appelé POST /:id/approve.
  4. **Multi-marchand par user : pas de limite** : un user peut être OWNER de plusieurs marchands. Pas de contrainte — un restaurateur peut avoir 2 enseignes. À réévaluer si abus constaté en production.
  5. **addTeamMember : 409 ConflictError (pas idempotent)** : si le user est déjà membre, erreur 409 explicite. Choix : l'ajout est intentionnel, un 200 silencieux masquerait une erreur de logique côté client (ex: vouloir changer le rôle). Race condition P2002 attrapée en plus du check préalable.
  6. **PUT hours = replace all** : pas de PATCH par jour. Les 7 jours sont envoyés d'un bloc en transaction (deleteMany + createMany). Simple, évite les états incohérents. Le client mobile envoie toujours les 7 jours.
  7. **Cache Redis GET /:id public (5 min)** : invalidé sur PATCH, pause, resume, approve, suspend, updateHours. Pas de cache sur la liste (filtres trop variés, cache hit rate trop faible).
  8. **Meilisearch différé** : recherche basique ILIKE sur businessName pour Phase 1. Meilisearch (full-text + géo + typo tolerance) = feature 3 du module Catalog.
- **Dépendances vers d'autres modules** : Auth (AuthRepository.findUserByPhone pour ajout membre par phone)
- **Points de vigilance / dette technique connue** :
  - **Type user CLIENT → MERCHANT** : un CLIENT qui crée un marchand reste CLIENT. Question ouverte : un user a-t-il un type unique ou peut-il être à la fois CLIENT et MERCHANT ? À trancher. Ne bloque pas le fonctionnement actuel.
  - **Cascade suspension → orders** : quand un marchand est suspendu, les commandes en cours devraient être annulées. Module Orders pas encore implémenté. TODO marqué dans le code.
  - **Pas de DELETE public** : pas d'endpoint pour supprimer un marchand. Le suspend admin couvre 99% des cas. CLOSED = future feature si nécessaire.
  - **commissionRate, momoNumber non modifiables** : pas exposés dans PATCH (admin-only plus tard). Sécurité : un marchand ne peut pas modifier son taux de commission.
- **Comment tester manuellement** :
  ```bash
  # 1. Créer un marchand (authentifié)
  curl -X POST http://localhost:3000/api/v1/merchants \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{"businessName":"Chez Mama","type":"RESTAURANT","addressLabel":"Marché Central","city":"Douala","latitude":4.05,"longitude":9.77,"phonePrimary":"+237691234567"}'
  # → status: PENDING, créateur = OWNER

  # 2. (Admin) Approuver
  curl -X POST http://localhost:3000/api/v1/merchants/mch_xxx/approve \
    -H "Authorization: Bearer <adminToken>"

  # 3. Liste publique (pas d'auth)
  curl "http://localhost:3000/api/v1/merchants?city=Douala&type=RESTAURANT"

  # 4. Ajouter un membre à l'équipe (OWNER)
  curl -X POST http://localhost:3000/api/v1/merchants/mch_xxx/team \
    -H "Authorization: Bearer <ownerToken>" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+237699999999","role":"STAFF"}'

  # 5. Mettre à jour les horaires
  curl -X PUT http://localhost:3000/api/v1/merchants/mch_xxx/hours \
    -H "Authorization: Bearer <memberToken>" \
    -H "Content-Type: application/json" \
    -d '{"hours":[{"dayOfWeek":0,"openTime":"00:00","closeTime":"00:00","isClosed":true},{"dayOfWeek":1,"openTime":"08:00","closeTime":"22:00"},{"dayOfWeek":2,"openTime":"08:00","closeTime":"22:00"},{"dayOfWeek":3,"openTime":"08:00","closeTime":"22:00"},{"dayOfWeek":4,"openTime":"08:00","closeTime":"22:00"},{"dayOfWeek":5,"openTime":"08:00","closeTime":"22:00"},{"dayOfWeek":6,"openTime":"08:00","closeTime":"20:00"}]}'
  ```
- **Statut des tests automatisés** : 29 tests unitaires couvrant : create (OWNER auto), update (cache invalidation), membership verify (member OK, non-member 403), add team (by phone, not registered, already member), remove team (STAFF OK, OWNER rejected, self rejected), approve (PENDING→ACTIVE, not PENDING rejected), suspend (cache), list public (ACTIVE only, filtres city/type/search/combinés), GET /:id (ACTIVE, PENDING→404, cache hit), hours (replace 7 days + cache), pause/resume (state guards)

---

### Catalog (feature 2/3 — categories, products, options, choices)

- **Rôle et responsabilité** : CRUD catégories, produits, options et choix pour chaque marchand. Feature 3 = géo-search Meilisearch.
- **Endpoints exposés** :

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/v1/merchants/:merchantId/categories` | Non | Liste catégories actives |
| GET | `/api/v1/merchants/:merchantId/products` | Non | Produits disponibles (cached 2min), filtre categoryId |
| GET | `/api/v1/products/:id` | Non | Détail produit + options + choices |
| POST | `/api/v1/merchants/:merchantId/categories` | JWT + member | Créer catégorie (max 10) |
| PATCH | `/api/v1/categories/:id` | JWT + member | Modifier catégorie |
| DELETE | `/api/v1/categories/:id` | JWT + member | Supprimer (409 si produits attachés) |
| POST | `/api/v1/merchants/:merchantId/categories/reorder` | JWT + member | Réordonner (array d'IDs) |
| POST | `/api/v1/merchants/:merchantId/products` | JWT + member | Créer produit (max 200) |
| PATCH | `/api/v1/products/:id` | JWT + member | Modifier produit |
| DELETE | `/api/v1/products/:id` | JWT + member | Soft delete (deletedAt + isAvailable=false) |
| POST | `/api/v1/products/:id/availability` | JWT + member | Toggle dispo rapide |
| POST | `/api/v1/products/:id/options` | JWT + member | Ajouter option (max 5) |
| PATCH | `/api/v1/options/:id` | JWT + member | Modifier option |
| DELETE | `/api/v1/options/:id` | JWT + member | Supprimer option + choices (cascade) |
| POST | `/api/v1/options/:id/choices` | JWT + member | Ajouter choix (max 10) |
| PATCH | `/api/v1/choices/:id` | JWT + member | Modifier choix |
| DELETE | `/api/v1/choices/:id` | JWT + member | Supprimer choix |

- **Modèles de données utilisés** : `Category`, `Product`, `ProductOption`, `ProductOptionChoice`
- **Décisions d'architecture** :
  1. **Delete catégorie = refus si produits attachés (409)** : pas de détachement auto. Le marchand doit déplacer ou supprimer les produits d'abord. Plus sûr — pas de produits orphelins par accident. Alternative rejetée : détacher (categoryId=null) silencieusement.
  2. **Soft delete produits** : `deletedAt + isAvailable=false`. Le produit reste en DB (référencé par OrderItem pour l'historique). Public ne le voit plus, admin/marchand le voit toujours.
  3. **Membership vérifiée dans le service (pas preHandler)** : les routes PATCH/DELETE /categories/:id, /products/:id, etc. n'ont pas merchantId dans l'URL. Le service fetch la resource, extrait merchantId, puis appelle `verifyMembership`. Alternative rejetée : preHandler (pas assez de contexte dans les params URL).
  4. **Options SINGLE/MULTIPLE validation** : SINGLE ��� maxSelection=1 obligatoire. MULTIPLE → maxSelection >= minSelection. Validé au create et update.
  5. **Cache Redis pattern `catalog:{merchantId}:*`** : TTL 2min. Invalidation par `KEYS` + `DEL` sur pattern. OK pour MVP (< 200 marchands actifs, < 10 clés par marchand). À remplacer par Redis pub/sub ou tags si scale.
  6. **Limites MVP** : 200 produits, 10 catégories, 5 options, 10 choices. Constantes dans `catalog.types.ts`, ajustables.
  7. **Reorder categories = transaction** : array d'IDs → validation que tous appartiennent au même marchand → updateMany sortOrder en transaction. Rejet complet si un ID est alien.
  8. **Ownership assertions factorisées** : 3 helpers privés (`assertOwnedProduct`, `assertOwnedOption`, `assertOwnedChoice`) fetch la resource, vérifient qu'elle existe/pas deleted, puis appellent `verifyMembership` avec le merchantId extrait. Pas de duplication.
  9. **Suppressions et cascade** : DELETE /options/:id = hard delete Prisma → choices supprimées automatiquement (Prisma `onDelete: Cascade` sur `ProductOptionChoice`). DELETE /products/:id = **soft** delete (deletedAt + isAvailable=false) → options et choices préservées (nécessaires pour l'historique OrderItem). Pas d'orphelins.
- **Dépendances vers d'autres modules** : Merchants (MerchantsService.verifyMembership)
- **Points de vigilance / dette technique connue** :
  - **Photos** : URLs acceptées en string. Upload fichiers vers GCS = module Storage futur.
  - **Stock décrémentation** : non géré ici, relèvera du module Orders.
  - **Recherche** : ILIKE basique dans le repo. Meilisearch = feature 3.
  - **discountPriceFcfa** : validé < priceFcfa au create/update, mais pas de job qui vérifie la cohérence historique.
  - **KEYS Redis** : pattern scan OK pour < 100 clés. À remplacer par SCAN si volume augmente.
- **Statut des tests automatisés** : 23 tests unitaires couvrant : catégories (create, non-member 403, max limit, delete with products 409, reorder alien reject, reorder OK), produits (create, max limit, discount validation ×2, soft delete, non-member 403, public list, public detail deleted 404, unavailable 404, cache invalidation), options (create, SINGLE maxSel>1 error, MULTIPLE maxSel<minSel error, max limit, delete cascade choices), choices (create, max limit)

---

### Orders

- **Rôle et responsabilité** : Création de commandes, state machine (18 statuts), assignation coursier, historique.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Order`, `OrderItem`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users, Clients, Merchants, Catalog, Couriers, Payments
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Payments

- **Rôle et responsabilité** : Initiation et suivi des paiements (MTN MoMo, Orange Money, Flutterwave, CinetPay, cash).
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Payment`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Orders, Wallet
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Tracking

- **Rôle et responsabilité** : Suivi temps réel de la position du coursier via WebSocket.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Courier` (lat/lng), `Order`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Couriers, Orders
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Notifications

- **Rôle et responsabilité** : Envoi de notifications push (FCM), SMS (Twilio), email, in-app.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Notification`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Support

- **Rôle et responsabilité** : Tickets de support avec messages et notes internes.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `SupportTicket`, `SupportMessage`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users, Orders
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Wallet

- **Rôle et responsabilité** : Porte-monnaie utilisateur, transactions, cashback, bonus.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Wallet`, `WalletTransaction`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users, Payments
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

## Glossaire des choix techniques transverses

| Choix | Décision | Alternative rejetée | Raison |
|-------|----------|---------------------|--------|
| Framework HTTP | Fastify 5.x pur | NestJS, Express | Léger, performances natives, JSON Schema intégré, contrôle explicite |
| DI Container | Awilix 10+ | DI manuelle, InversifyJS | Injection par constructeur, scoped per-request, pas de décorateurs |
| Validation | TypeBox (JSON Schema) | class-validator, Zod, Joi | Natif Fastify, inférence TS automatique via `Static<>`, zero-cost à runtime |
| ORM | Prisma 5+ | TypeORM, Knex, Drizzle | Type-safe, migrations intégrées, introspection PostgreSQL |
| Tests | Vitest + Supertest | Jest + Supertest | Plus rapide, compatible ESM natif, API compatible Jest |
| Logger | Pino (structured JSON) | Winston, Bunyan | Natif Fastify, performant, structured logging en prod |
| IDs | Préfixés nanoid (usr_, ord_, etc.) | UUID v4, auto-increment | Lisibles en debug, non-séquentiels, courts |
| Monnaie | Decimal (Prisma) | Float, Int (centimes) | FCFA sans centimes mais Decimal évite les erreurs d'arrondi |
| Géolocalisation | PostGIS 3.4 | Calcul applicatif | Requêtes de proximité performantes (ST_DWithin pour trouver coursiers proches) |
| Soft delete | `deletedAt` nullable | Hard delete | Conformité, audit trail, récupération possible |
| Queue | RabbitMQ | BullMQ (Redis), Kafka | Fiabilité messages (delivery guarantee), routing flexible, adapté au volume Phase 1 |
| Recherche | Meilisearch | Elasticsearch, Algolia | Léger, rapide à configurer, suffisant pour catalogue marchands |
| SMS Provider | Interface SmsProvider + Twilio (prod) / FakeSmsProvider (dev) | SDK Twilio npm | fetch natif Node 22, pas de dép lourde; FakeSmsProvider log les OTP en dev |
| Hash OTP | SHA-256 (crypto natif) | bcrypt | OTP 6 chiffres à faible entropie, protégé par rate limit + max attempts; bcrypt lent sans bénéfice |
| Token generation | TokenService (DI) + fastify.jwt.sign bridgé | jsonwebtoken, fast-jwt | Réutilise le plugin @fastify/jwt déjà configuré; fonction injectée via container pour découplage |
| Refresh token storage | SHA-256 hash en DB | Stockage en clair | Si DB compromise, tokens inexploitables; même pattern que les OTP |
| Refresh token rotation | Rotation + grace window Redis 30s | Token fixe 7j / rotation sans grace | Détection de vol après 30s; retry transparent pendant 30s (3G Cameroun) |
| Max sessions | 5 par utilisateur, plus ancienne révoquée auto | Pas de limite / erreur | Évite accumulation; UX transparente (pas de message d'erreur) |
| Session revocation | Soft revoke (revokedAt) | Hard delete | Audit trail, détection réutilisation; purge physique différée |
| User profile cache | Redis `user:{id}` TTL 5min | Pas de cache / cache HTTP | Invalidation explicite sur write; fréquent read (ouverture app) |
| Admin auth | Simple `requireAdmin` decorator | RBAC complet | Suffisant Phase 1 (1 admin); RBAC quand rôles granulaires nécessaires |
| Access token revocation | Redis blocklist `blocked:{userId}` TTL 15min | Check DB sur chaque requête | Sub-ms Redis vs DB round-trip; fail-open si Redis down (15min max exposure) |
