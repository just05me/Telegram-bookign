import { Router, Request, Response } from 'express';
import { createHash, createHmac } from 'crypto';
import { config } from '../config';

export const webappRouter = Router();

// POST /api/webapp/init — validate Telegram WebApp initData
webappRouter.post('/init', (req: Request, res: Response) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      res.status(400).json({ error: 'initData required' });
      return;
    }

    const isValid = validateTelegramWebAppData(initData, config.bot.token);

    if (!isValid) {
      res.status(401).json({ error: 'Invalid initData' });
      return;
    }

    // Parse user data from initData
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    const user = userStr ? JSON.parse(userStr) : null;

    res.json({ ok: true, user });
  } catch (err) {
    console.error('WebApp init error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function validateTelegramWebAppData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');

  // Sort keys alphabetically
  const sorted: string[] = [];
  for (const [key, value] of params) {
    sorted.push(`${key}=${value}`);
  }
  sorted.sort();

  const dataCheckString = sorted.join('\n');

  // Create secret key from bot token
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // Compute hash
  const computedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return computedHash === hash;
}
