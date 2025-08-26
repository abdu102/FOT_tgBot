# Football Telegram Bot - Scalability Guide

## Current Architecture Analysis

### Strengths
- ✅ PostgreSQL database (ACID compliant, excellent for complex queries)
- ✅ Prisma ORM with type safety
- ✅ Modular scene-based architecture with Telegraf
- ✅ Proper middleware chain (auth, ensureUser, i18n)
- ✅ Clean separation of concerns (handlers, scenes, services)

### Bottlenecks Identified
- ⚠️ Database queries without proper indexing
- ⚠️ No connection pooling (default Prisma limit: ~10 connections)
- ⚠️ In-memory session storage (loses data on restart)
- ⚠️ Synchronous database operations in message handlers
- ⚠️ No rate limiting or request queuing
- ⚠️ Heavy queries in session list (computeSessionTable)

## Server Recommendations

### Small Scale (100-1,000 active users)
**Option 1: DigitalOcean Droplet**
- **Specs**: 1GB RAM, 1 vCPU, 25GB SSD
- **Cost**: $6/month
- **Database**: Managed PostgreSQL ($15/month) or self-hosted

**Option 2: Railway (current)**
- **Cost**: $5-20/month
- **Pros**: Easy deployment, automatic scaling
- **Cons**: Limited control, can be expensive at scale

### Medium Scale (1,000-10,000 active users)
**Recommended: DigitalOcean**
- **App Server**: 4GB RAM, 2 vCPUs ($24/month)
- **Database**: Managed PostgreSQL with 1GB RAM ($15/month)
- **Load Balancer**: $12/month
- **Total**: ~$51/month

### Large Scale (10,000+ active users)
**Recommended: AWS/GCP with Kubernetes**
- **App Servers**: Multiple instances with auto-scaling
- **Database**: Multi-region PostgreSQL with read replicas
- **Caching**: Redis for session storage and query caching
- **CDN**: For static assets
- **Cost**: $200-500+/month

## Critical Performance Optimizations

### 1. Database Optimizations

#### Add Database Indexes
```sql
-- Users table
CREATE INDEX idx_users_telegram_id ON "User"(telegram_id);
CREATE INDEX idx_users_phone ON "User"(phone);
CREATE INDEX idx_users_active ON "User"(is_active);

-- Sessions table
CREATE INDEX idx_sessions_start_at ON "Session"(start_at);
CREATE INDEX idx_sessions_status ON "Session"(status);
CREATE INDEX idx_sessions_start_status ON "Session"(start_at, status);

-- Session registrations
CREATE INDEX idx_session_reg_session_id ON "SessionRegistration"(session_id);
CREATE INDEX idx_session_reg_user_id ON "SessionRegistration"(user_id);
CREATE INDEX idx_session_reg_status ON "SessionRegistration"(status);

-- Teams and members
CREATE INDEX idx_team_members_team_id ON "TeamMember"(team_id);
CREATE INDEX idx_team_members_user_id ON "TeamMember"(user_id);
```

#### Connection Pooling
```typescript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Add connection pooling
  relationMode = "prisma"
}
```

```typescript
// src/database.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

// Connection pool configuration
const prismaWithPool = prisma.$extends({
  query: {
    $allOperations: async ({ operation, model, args, query }) => {
      const start = Date.now();
      const result = await query(args);
      const end = Date.now();
      console.log(`${model}.${operation} took ${end - start}ms`);
      return result;
    },
  },
});
```

### 2. Session Storage Optimization

#### Redis for Session Storage
```typescript
// src/config/redis.ts
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// src/middlewares/session.ts
import { session } from 'telegraf';
import RedisSession from 'telegraf-session-redis';

export const sessionMiddleware = new RedisSession({
  store: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  ttl: 3600, // 1 hour
});
```

### 3. Rate Limiting

#### Implement Rate Limiting
```typescript
// src/middlewares/rateLimit.ts
import { Context } from 'telegraf';
import { redis } from '../config/redis';

export async function rateLimitMiddleware(ctx: Context, next: () => Promise<void>) {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const key = `rate_limit:${userId}`;
  const current = await redis.get(key);
  
  if (current && parseInt(current) > 30) { // 30 requests per minute
    await ctx.reply('Too many requests. Please wait a moment.');
    return;
  }
  
  await redis.incr(key);
  await redis.expire(key, 60); // 1 minute
  return next();
}
```

### 4. Query Optimization

#### Optimize Session Queries
```typescript
// src/services/session.ts - Optimized version
export async function getUpcomingSessions(prisma: PrismaClient, limit = 10, offset = 0) {
  return prisma.session.findMany({
    where: {
      startAt: { gte: new Date() },
      status: 'PLANNED'
    },
    include: {
      teams: {
        include: {
          team: {
            include: {
              _count: {
                select: { members: true }
              }
            }
          }
        }
      },
      _count: {
        select: { registrations: true }
      }
    },
    orderBy: { startAt: 'asc' },
    take: limit,
    skip: offset
  });
}

// Cached session table computation
export async function computeSessionTableCached(prisma: PrismaClient, sessionId: string) {
  const cacheKey = `session_table:${sessionId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const result = await computeSessionTable(prisma, sessionId);
  await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 minutes cache
  return result;
}
```

### 5. Background Job Processing

#### Queue Heavy Operations
```typescript
// src/services/queue.ts
import Bull from 'bull';

export const sessionQueue = new Bull('session processing', {
  redis: { host: 'localhost', port: 6379 }
});

// Process team auto-formation in background
sessionQueue.process('auto-formation', async (job) => {
  const { sessionId } = job.data;
  await autoFormTeamsForSession(prisma, sessionId);
});

// src/handlers/admin.ts - Updated
bot.action(/sess_start_(.*)/, async (ctx) => {
  const sessionId = (ctx.match as any)[1];
  
  // Add to queue instead of processing immediately
  await sessionQueue.add('auto-formation', { sessionId });
  await ctx.answerCbQuery('Session start queued');
});
```

## Deployment Strategy

### Production Environment Setup

#### 1. Server Configuration
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
```

#### 2. Environment Variables
```env
# Production .env
NODE_ENV=production
BOT_TOKEN=your_bot_token
DATABASE_URL=postgresql://user:pass@localhost:5432/fotbot
REDIS_URL=redis://localhost:6379
WEBHOOK_URL=https://yourdomain.com/webhook

# Rate limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=30

# Connection pooling
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
```

### Monitoring and Logging

#### 1. Application Monitoring
```typescript
// src/services/monitoring.ts
import { collectDefaultMetrics, register, Counter, Histogram } from 'prom-client';

collectDefaultMetrics();

export const messageCounter = new Counter({
  name: 'telegram_messages_total',
  help: 'Total number of messages processed',
  labelNames: ['type', 'status']
});

export const responseTime = new Histogram({
  name: 'telegram_response_duration_seconds',
  help: 'Response time in seconds',
  labelNames: ['handler']
});

// Health check endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});
```

#### 2. Error Tracking
```typescript
// src/services/errorTracking.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

export function captureError(error: Error, context?: any) {
  console.error('Error:', error);
  Sentry.captureException(error, { extra: context });
}
```

## Capacity Planning

### User Load Estimates

| Users    | Messages/day | DB Queries/hour | RAM Usage | CPU Usage |
|----------|--------------|-----------------|-----------|-----------|
| 1,000    | 10,000      | 2,500          | 512MB     | 20%       |
| 5,000    | 50,000      | 12,500         | 2GB       | 60%       |
| 10,000   | 100,000     | 25,000         | 4GB       | 80%       |
| 50,000   | 500,000     | 125,000        | 16GB      | Multiple  |

### Infrastructure Scaling Plan

1. **Phase 1 (0-1K users)**: Single server with PostgreSQL
2. **Phase 2 (1K-5K users)**: Add Redis, optimize queries
3. **Phase 3 (5K-10K users)**: Load balancer, multiple app instances
4. **Phase 4 (10K+ users)**: Database replicas, caching layer, CDN

## Cost Analysis

### Monthly Costs by Scale

#### Small Scale (1,000 users)
- Server: $24/month (DigitalOcean 4GB)
- Database: $15/month (Managed PostgreSQL)
- Monitoring: $0 (Grafana Cloud free tier)
- **Total: $39/month**

#### Medium Scale (5,000 users)
- Servers: $48/month (2x 4GB instances)
- Database: $40/month (Larger managed instance)
- Redis: $15/month (Managed Redis)
- Load Balancer: $12/month
- Monitoring: $20/month
- **Total: $135/month**

#### Large Scale (10,000+ users)
- Servers: $200/month (Auto-scaling group)
- Database: $150/month (High-performance with replicas)
- Redis: $50/month (Cluster)
- Load Balancer: $25/month
- CDN: $20/month
- Monitoring: $50/month
- **Total: $495/month**

## Action Items

### Immediate (Next 2 weeks)
1. ✅ Add database indexes
2. ✅ Implement connection pooling
3. ✅ Add Redis for session storage
4. ✅ Implement basic rate limiting
5. ✅ Set up monitoring endpoints

### Short-term (Next month)
1. Optimize database queries
2. Implement background job processing
3. Add comprehensive error tracking
4. Set up staging environment
5. Performance testing

### Long-term (3+ months)
1. Migrate to Kubernetes
2. Implement horizontal auto-scaling
3. Add read replicas
4. Implement caching strategies
5. Multi-region deployment
