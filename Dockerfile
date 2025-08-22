FROM node:20-bullseye-slim

WORKDIR /app

# Install deps first
COPY package*.json ./
RUN npm ci

# Prisma client generate before copying the whole app (cache-friendly)
COPY prisma ./prisma
RUN npx prisma generate

# App source
COPY . .

# Build TypeScript
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

# Run migrations then start bot (long polling)
CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]


