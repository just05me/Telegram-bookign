import express from 'express';
import { config } from './config';
import { startBot } from './bot';
import { startReminderCron } from './lib/reminders';
import { sessionStore } from './lib/session';

const app = express();

app.use(express.json());

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

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
