import { Router, Request, Response } from 'express';
import { config } from '../config';

export const googleRouter = Router();

// GET /api/google/auth — start OAuth flow
googleRouter.get('/auth', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: config.google.scopes.join(' '),
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/google/callback — OAuth callback
googleRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    res.status(400).send('Missing authorization code');
    return;
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens: { error?: string; access_token?: string; refresh_token?: string } = await tokenResponse.json() as { error?: string; access_token?: string; refresh_token?: string };

    if (tokens.error) {
      console.error('Google OAuth error:', tokens.error);
      res.status(400).send(`OAuth error: ${tokens.error}`);
      return;
    }

    // In production, associate tokens with the organizer and store securely
    // For now, redirect back to frontend with success
    res.redirect(`${config.frontendUrl}/dashboard/settings?google=connected`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.status(500).send('Authentication failed');
  }
});
