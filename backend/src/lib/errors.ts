/**
 * Erreurs métier Wakaman
 *
 * Toutes les erreurs lancées par la logique métier doivent étendre AppError.
 * Le global error handler dans server.ts les transforme en réponses HTTP propres.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================
// ERREURS GÉNÉRIQUES (réutilisables partout)
// ============================================================

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} ${id} not found` : `${resource} not found`;
    super('NOT_FOUND', 404, msg);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super('FORBIDDEN', 403, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', 409, message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMIT', 429, message);
  }
}

// ============================================================
// ERREURS DOMAINE WAKAMAN
// ============================================================

export class PaymentError extends AppError {
  constructor(message: string, provider: string, details?: unknown) {
    super('PAYMENT_ERROR', 402, message, { provider, ...((details as object) ?? {}) });
  }
}

export class InsufficientFundsError extends AppError {
  constructor(walletId: string) {
    super('INSUFFICIENT_FUNDS', 402, 'Insufficient wallet balance', { walletId });
  }
}

export class OrderStateError extends AppError {
  constructor(orderId: string, currentState: string, attemptedAction: string) {
    super(
      'INVALID_ORDER_STATE',
      409,
      `Cannot ${attemptedAction} order in state ${currentState}`,
      { orderId, currentState, attemptedAction },
    );
  }
}

export class CourierUnavailableError extends AppError {
  constructor(message = 'No couriers available in your area') {
    super('NO_COURIER_AVAILABLE', 503, message);
  }
}

export class MerchantClosedError extends AppError {
  constructor(merchantId: string) {
    super('MERCHANT_CLOSED', 409, 'Merchant is currently closed', { merchantId });
  }
}

export class OtpError extends AppError {
  constructor(message: string, attempts?: number) {
    super('OTP_ERROR', 400, message, { attempts });
  }
}

export class KycError extends AppError {
  constructor(message: string, courierId: string) {
    super('KYC_ERROR', 422, message, { courierId });
  }
}
