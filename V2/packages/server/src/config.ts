import { config as dotenvConfig, parse as dotenvParse } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

// Helper: set process.env[key] only if not already set to a non-empty value
function setEnvIfNotSet(key: string, value: string) {
  if (!process.env[key] || process.env[key] === '') {
    process.env[key] = value;
  }
}

// Load root .env first (does not override already-set env vars)
const rootEnvPath = resolve(__dirname, '../../../.env');
if (existsSync(rootEnvPath)) {
  dotenvConfig({ path: rootEnvPath });
}

// Load server .env values (only set if not already set)
const serverEnvPath = resolve(__dirname, '../.env');
if (existsSync(serverEnvPath)) {
  const serverVars = dotenvParse(readFileSync(serverEnvPath));
  for (const [key, value] of Object.entries(serverVars)) {
    if (value !== '') {
      setEnvIfNotSet(key, value);
    }
  }
}

export const config = {
  port: parseInt(process.env['PORT'] || '3001', 10),

  // Bot username is set at runtime after bot initialises
  botUsername: '',

  bot: {
    token: process.env['BOT_TOKEN'] || '',
    webhookUrl: process.env['BOT_WEBHOOK_URL'] || '',
  },

  google: {
    clientId: process.env['GOOGLE_CLIENT_ID'] || '',
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || '',
    redirectUri:
      process.env['GOOGLE_REDIRECT_URI'] ||
      'http://localhost:3001/api/google/callback',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },

  encryptionKey: process.env['ENCRYPTION_KEY'] || 'dev-encryption-key-32chars!!',
};
