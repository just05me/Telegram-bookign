import { Router, Request, Response } from 'express';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { createOAuth2Client } from '../lib/google';

export const googleRouter = Router();

// In-memory store for pending OAuth states
// Maps state -> { telegramId: number }
const pendingAuth = new Map<string, { telegramId: number }>();

export function storePendingAuth(state: string, data: { telegramId: number }) {
  pendingAuth.set(state, data);
  // Auto-clean after 10 minutes
  setTimeout(() => pendingAuth.delete(state), 10 * 60 * 1000);
}

// GET /api/google/auth?state=<telegramId> — start OAuth flow
googleRouter.get('/auth', (req: Request, res: Response) => {
  const state = req.query.state as string;
  if (!state || !pendingAuth.has(state)) {
    res.status(400).send('Invalid state parameter. Start OAuth from the bot.');
    return;
  }

  const oauth2Client = createOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: config.google.scopes,
    state,
  });

  res.redirect(url);
});

// GET /api/google/callback — OAuth callback
googleRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    res.status(400).send('Missing authorization code');
    return;
  }

  const authData = state ? pendingAuth.get(state as string) : null;
  if (!authData) {
    res.status(400).send('Invalid or expired state. Start OAuth from the bot again.');
    return;
  }

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.status(400).send('No refresh token received. Try again with prompt=consent.');
      return;
    }

    // Save refresh token and calendar ID to the organizer
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(authData.telegramId) },
      include: { organizer: true },
    });

    if (!user?.organizer) {
      res.status(400).send('Organizer not found.');
      return;
    }

    await prisma.organizer.update({
      where: { id: user.organizer.id },
      data: { googleRefreshToken: tokens.refresh_token },
    });

    pendingAuth.delete(state as string);

    res.send(`
      <html>
      <body style="font-family: sans-serif; text-align: center; padding: 40px;">
        <h2>✅ Google Calendar подключён!</h2>
        <p>Вернитесь в бота.</p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.status(500).send('Authentication failed');
  }
});
