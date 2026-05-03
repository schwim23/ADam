import type { GAMClient } from '../gam/client.js';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min

function log(msg: string) {
  process.stderr.write(`[ADam cache] ${new Date().toISOString()} ${msg}\n`);
}

function todayAndYesterday(): [string, string] {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  return [today, yesterday];
}

export class GAMScheduler {
  private client: GAMClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(client: GAMClient) {
    this.client = client;
  }

  start(): void {
    // Warm cache immediately in the background, then refresh on interval
    setImmediate(() => this.refresh('startup warm-up'));
    this.timer = setInterval(() => this.refresh('scheduled refresh'), REFRESH_INTERVAL_MS);
    // Don't block process exit on the interval
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refresh(reason: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    log(`Starting ${reason}`);

    const [today, yesterday] = todayAndYesterday();

    try {
      // Yesterday first — morning briefing depends on it
      await this.client.refreshDeliveryCache({ start: yesterday, end: yesterday });
      log(`Cached yesterday (${yesterday})`);

      await this.client.refreshDeliveryCache({ start: today, end: today });
      log(`Cached today (${today})`);
    } catch (err) {
      log(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
