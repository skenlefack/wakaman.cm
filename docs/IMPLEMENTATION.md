# Wakaman — Journal d'implémentation

## Vue d'ensemble de l'avancement

| Module | Statut | Dernière mise à jour | Notes |
|--------|--------|----------------------|-------|
| Users | Partiel — routes/schemas uniquement | 2026-05-16 | Handlers, service, repository à implémenter |
| Auth | Partiel — signup OTP (feature 1/3) | 2026-05-16 | Login/refresh (feature 2), logout/sessions (feature 3) restants |
| Clients | Non commencé | — | Profil client, adresses, favoris |
| Couriers | Non commencé | — | Onboarding, KYC, position temps réel |
| Merchants | Non commencé | — | Onboarding, catalogue, horaires |
| Catalog | Non commencé | — | Produits, catégories, options |
| Orders | Non commencé | — | Création, state machine, assignation |
| Payments | Non commencé | — | MTN MoMo, Orange Money, wallet |
| Tracking | Non commencé | — | WebSocket, position coursier |
| Notifications | Non commencé | — | Push (FCM), SMS, email, in-app |
| Support | Non commencé | — | Tickets, messages |
| Wallet | Non commencé | — | Solde, transactions, cashback |

---

## Modules

### Users

- **Rôle et responsabilité** : CRUD utilisateurs (tous types : CLIENT, COURIER, MERCHANT, ADMIN, SUPPORT). Module de base référencé par tous les autres.
- **Endpoints exposés** :

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/v1/users/me` | JWT | Profil de l'utilisateur connecté |
| GET | `/api/v1/users/:id` | JWT + ADMIN | Récupérer un utilisateur par ID |
| GET | `/api/v1/users` | JWT + ADMIN | Lister les utilisateurs (paginé) |
| POST | `/api/v1/users` | JWT + ADMIN | Créer un utilisateur |
| PATCH | `/api/v1/users/:id` | JWT + ADMIN/SELF | Modifier un utilisateur |
| DELETE | `/api/v1/users/:id` | JWT + ADMIN | Supprimer un utilisateur (soft delete) |

- **Modèles de données utilisés** : `User`, `Address`
- **Décisions d'architecture** : À documenter lors de l'implémentation complète
- **Dépendances vers d'autres modules** : Aucune (module de base)
- **Points de vigilance / dette technique connue** :
  - Seuls `users.routes.ts` et `users.schemas.ts` existent — handlers, service, repository manquants
  - Validation téléphone E.164 (+237XXXXXXXXX) déjà en place dans les schemas
- **Comment tester manuellement** : À documenter après implémentation des handlers
- **Statut des tests automatisés** : Aucun test écrit

---

### Auth

- **Rôle et responsabilité** : Inscription et connexion par OTP SMS, gestion JWT (access + refresh tokens), sessions.
- **Endpoints exposés** :

| Méthode | Route | Auth | Description | Statut |
|---------|-------|------|-------------|--------|
| POST | `/api/v1/auth/signup` | Non | Envoie un OTP 6 chiffres par SMS | Implémenté |
| POST | `/api/v1/auth/verify-otp` | Non | Vérifie l'OTP, crée le compte, retourne JWT tokens (auto-login) | Implémenté |
| POST | `/api/v1/auth/login` | Non | Connexion par OTP (envoie un code) | TODO feature 2 |
| POST | `/api/v1/auth/verify-login` | Non | Vérifie OTP login et retourne JWT tokens (réutilise TokenService) | TODO feature 2 |
| POST | `/api/v1/auth/refresh` | Refresh token | Renouvelle l'access token (réutilise TokenService) | TODO feature 2 |
| POST | `/api/v1/auth/logout` | JWT | Révoque la session | TODO feature 3 |

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
- **Dépendances vers d'autres modules** : Aucune (crée les Users directement via son propre repository)
- **Points de vigilance / dette technique connue** :
  - Le rate limit auth (5/min/IP) est déclaré au niveau route via `config.rateLimit` — nécessite que `@fastify/rate-limit` supporte le override par route (vérifié OK avec Fastify 5)
  - Les OTP expirés ne sont pas nettoyés automatiquement — prévoir un cron/job de purge
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

  # 3. Utiliser l'access token pour les requêtes authentifiées
  curl http://localhost:3000/api/v1/users/me \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Statut des tests automatisés** : Aucun test écrit (prévu après validation de la structure)

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

### Merchants

- **Rôle et responsabilité** : Onboarding marchands, gestion multi-utilisateurs, horaires, taux de commission.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Merchant`, `MerchantUser`, `User`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Users, Auth
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

---

### Catalog

- **Rôle et responsabilité** : Gestion des produits, catégories, options et choix d'options par marchand.
- **Endpoints exposés** : À définir
- **Modèles de données utilisés** : `Category`, `Product`, `ProductOption`, `ProductOptionChoice`
- **Décisions d'architecture** : À documenter
- **Dépendances vers d'autres modules** : Merchants
- **Points de vigilance / dette technique connue** : À documenter
- **Comment tester manuellement** : À documenter
- **Statut des tests automatisés** : Aucun test écrit

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
