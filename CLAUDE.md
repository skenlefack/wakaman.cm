# Wakaman — Plateforme de livraison Afrique centrale

## Vision

Super-app de livraison pour le Cameroun (Douala, Yaoundé) puis CEMAC.
**Slogan : « On bouge pour toi »**

## Stack globale

- **Backend** : Fastify 5.x + TypeScript + Awilix (DI) + TypeBox (validation) + Prisma + PostgreSQL + PostGIS
- **Android** : Kotlin + Jetpack Compose + MVVM + Hilt (3 apps : client, courier, merchant)
- **iOS** : Swift 5+ + SwiftUI + Combine + MVVM (2 apps : client, merchant — pas de courier iOS)
- **Admin web** : Next.js 15 (App Router) + TypeScript + Tailwind + React Query
- **Infra** : GCP + Kubernetes (GKE) + Cloudflare CDN

## Conventions globales

- Langue code et commentaires : **ANGLAIS**
- Langue commits Git : **ANGLAIS** (Conventional Commits : feat:, fix:, refactor:, docs:)
- Langue UI utilisateur : **FRANÇAIS** (avec FR/EN switch dans Phase 2)
- Pas de `console.log()` en production, utiliser le logger Pino
- Pas de `any`/`Any` sans justification (TypeScript, Kotlin, Swift)
- Pas de magic numbers (toujours des constantes nommées)

## Architecture

**Modular monolith (Fastify + Awilix)**. Microservices différés à l'an 2-3.
Voir `docs/architecture/` pour les diagrammes détaillés.

## Intégrations critiques

- MTN MoMo Business API (paiement principal)
- Orange Money API (paiement secondaire)
- Flutterwave / CinetPay (cartes bancaires fallback)
- Twilio + InTouch (SMS OTP)
- Firebase Cloud Messaging (push notifications)
- Mapbox (cartographie, géocodage, ETA)
- Sentry (erreurs)
- Smile Identity (KYC coursiers)

## Sécurité

- JWT + refresh tokens (15min access / 7j refresh)
- Bcrypt pour passwords (cost 12)
- Rate limiting sur toutes les routes publiques (Redis)
- HTTPS partout (TLS 1.3 minimum)
- Jamais de secrets dans le code → `.env` local + Secret Manager GCP en prod
- Tokenisation des moyens de paiement (jamais de PAN stocké)

## Tests

- Tests unitaires sur la logique métier critique (Vitest backend, JUnit Android, XCTest iOS)
- Tests E2E sur les flux paiement et commande
- Coverage cible : 70% sur services, 50% global

## Pour démarrer une session de dev

1. Si modifications **backend** → `cd backend/` et lire `CLAUDE.md` local
2. Si modifications **Android** → `cd android/` et lire `CLAUDE.md` local
3. Si modifications **iOS** → `cd ios/` et lire `CLAUDE.md` local
4. Si modifications **admin-web** → `cd admin-web/` et lire `CLAUDE.md` local
5. Toujours vérifier les types partagés dans `shared-types/`

## Workflow Git

- Branche principale : `main` (protégée)
- Branches features : `feat/nom-feature`
- Branches fixes : `fix/nom-fix`
- Commits atomiques, push fréquents
- PR obligatoire pour `main` (même solo, pour traçabilité)

## Contacts importants

- Fondateur / Dev Lead : [ton nom]
- COO : [à recruter en M1]
