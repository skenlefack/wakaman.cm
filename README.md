# 🚀 Wakaman

> **« On bouge pour toi »** — Plateforme de livraison à la demande pour l'Afrique centrale.

Wakaman connecte clients, marchands et coursiers pour livrer **rapidement**, à **prix juste**, **partout au Cameroun**.

## 🎯 Vision

Devenir la **super-app de référence** en Afrique centrale pour la livraison de biens et services, en couvrant un périmètre plus large que les acteurs internationaux : alimentation, courses, pharmacie, colis inter-villes, paiement de factures, achats sur les marchés traditionnels.

## 🏗️ Architecture du monorepo

```
wakaman/
├── backend/         # API NestJS + Prisma + PostgreSQL
├── android/         # 3 apps Kotlin natives (client, courier, merchant)
├── ios/             # 2 apps Swift natives (client, merchant)
├── admin-web/       # Console admin Next.js
├── shared-types/    # Types TypeScript partagés
├── infrastructure/  # Terraform + K8s
└── docs/            # Documentation
```

## 🛠️ Stack technique

| Couche | Technologie |
|---|---|
| Backend | NestJS 11 + TypeScript + Prisma + PostgreSQL 16 + PostGIS |
| Android | Kotlin + Jetpack Compose + MVVM + Hilt |
| iOS | Swift 5+ + SwiftUI + Combine + MVVM |
| Admin | Next.js 15 + React Query + Tailwind |
| Cloud | GCP + Kubernetes (GKE) + Cloudflare |
| Paiement | MTN MoMo + Orange Money + Flutterwave |

## 🚀 Démarrage rapide

### Prérequis

- Node.js 22 LTS
- Docker + Docker Compose
- Android Studio (pour Android)
- Xcode 15+ (pour iOS, macOS uniquement)
- Compte GCP (avec crédits startup)

### Installation

```bash
# Cloner le repo
git clone https://github.com/wakaman/wakaman.git
cd wakaman

# Installer les dépendances (workspace npm)
npm install

# Lancer la stack locale (Postgres, Redis, RabbitMQ)
docker-compose up -d

# Setup backend
cd backend
cp .env.example .env
npx prisma migrate dev
npm run start:dev

# Dans un autre terminal : admin web
cd admin-web
npm run dev
```

## 📋 Roadmap

- **M1-M2** : Fondations (juridique, archi, recrutement COO)
- **M3-M4** : App Coursier Android (priorité critique)
- **M5-M7** : Apps Client + Marchand Android + Admin web
- **M8-M9** : Polish + 🚀 Soft launch Douala
- **M10-M13** : Apps iOS + Lancement Yaoundé
- **M14+** : Phase 2 (marchés traditionnels, inter-villes, factures)

## 🤖 Développement AI-augmented

Ce projet est développé en **stratégie AI-augmented** avec Claude Code Max 20x. Voir les fichiers `CLAUDE.md` dans chaque sous-projet pour les conventions spécifiques.

## 📞 Contact

- **Fondateur** : [ton nom]
- **Email** : contact@wakaman.com
- **Site** : https://wakaman.com (en construction)

## 📄 Licence

Propriétaire — Wakaman SARL — Tous droits réservés.

---

*Made with ❤️ in Cameroon 🇨🇲*
