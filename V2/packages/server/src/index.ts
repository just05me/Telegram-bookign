import express from 'express';
import { config } from './config';
import { googleRouter } from './api/google';
import { startBot } from './bot';
import { startReminderCron } from './lib/reminders';
import { sessionStore } from './lib/session';

const app = express();

app.use(express.json());

// Google OAuth endpoints (need HTTP for OAuth callback)
app.use('/api/google', googleRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

async function main() {
  // Load persistent sessions from DB
  await sessionStore.init();

  // Start Telegram bot
  await startBot();

  // Start reminder cron
  startReminderCron();

  // Only start Express if Google OAuth is configured
  if (config.google.clientId && config.google.clientSecret) {
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port} (Google OAuth)`);
    });
  } else {
    console.log('Google OAuth not configured — HTTP server not started.');
  }
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
