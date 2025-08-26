import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

let client: Redis | null = null;

try {
  if (REDIS_URL) {
    client = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    } as any);
    // Avoid unhandled error event noise when Redis is not reachable
    client.on('error', (e: any) => {
      const msg = (e && e.message) ? e.message : String(e);
      if (process.env.DEBUG_LOG === '1') {
        console.warn('redis error:', msg);
      }
    });
    client.connect().catch(() => {});
  }
} catch {}

export const redis = client as any;

export default redis;


