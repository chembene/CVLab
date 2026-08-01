import * as Joi from 'joi';

/**
 * Fails fast on startup if required configuration is missing/malformed,
 * rather than surfacing confusing runtime errors later. As of Phase 1,
 * JWT_ACCESS_SECRET/JWT_REFRESH_SECRET are actually used (access-token
 * signing and refresh/verification/reset-token HMAC hashing respectively —
 * see TokenService) so they're required here with a minimum length, not
 * just optional placeholders. AI/storage/M-Pesa placeholders remain loosely
 * validated since nothing reads them yet.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  FRONTEND_URL: Joi.string().uri().optional(),
  API_BASE_URL: Joi.string().uri().optional(),
  CORS_ALLOWED_ORIGINS: Joi.string().allow('').optional(),
}).unknown(true);
