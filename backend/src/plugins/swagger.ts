/**
 * Plugin Swagger / OpenAPI
 *
 * Génère automatiquement la documentation API à partir des schemas TypeBox.
 * Accessible sur /docs en développement.
 */

import { FastifyInstance } from 'fastify';

export async function registerSwagger(fastify: FastifyInstance) {
  await fastify.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Wakaman API',
        description: 'API officielle Wakaman — Plateforme de livraison Afrique centrale',
        version: '0.1.0',
        contact: {
          name: 'Wakaman Tech',
          email: 'tech@wakaman.com',
        },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development' },
        { url: 'https://api.wakaman.com', description: 'Production' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentification et gestion des sessions' },
        { name: 'Users', description: 'Gestion des utilisateurs' },
        { name: 'Clients', description: 'Profils clients' },
        { name: 'Couriers', description: 'Gestion des coursiers' },
        { name: 'Merchants', description: 'Gestion des marchands' },
        { name: 'Catalog', description: 'Catalogue produits et catégories' },
        { name: 'Orders', description: 'Commandes' },
        { name: 'Payments', description: 'Paiements (MoMo, OM, cash, cartes)' },
        { name: 'Tracking', description: 'Suivi temps réel des livraisons' },
        { name: 'Notifications', description: 'Notifications push, SMS, email' },
        { name: 'Support', description: 'Support client et tickets' },
        { name: 'Wallet', description: 'Porte-monnaie Wakaman' },
      ],
    },
  });

  // Swagger UI uniquement en dev
  if (process.env.NODE_ENV !== 'production') {
    await fastify.register(import('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
    });
  }
}
