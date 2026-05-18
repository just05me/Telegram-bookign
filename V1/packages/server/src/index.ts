import express from 'express';
import cors from 'cors';
import { config } from './config';
import { apiRouter } from './api/router';
import { startBot } from './bot';
import { startReminderCron } from './lib/reminders';

const app = express();

app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

async function main() {
  // Start Telegram bot
  await startBot();

  // Start reminder cron
  startReminderCron();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
