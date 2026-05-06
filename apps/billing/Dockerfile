FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY apps/billing/package.json ./apps/billing/package.json
RUN npm install
COPY . .
RUN npm run build -w apps/billing

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/billing/dist ./apps/billing/dist
CMD ["node", "apps/billing/dist/main.js"]
