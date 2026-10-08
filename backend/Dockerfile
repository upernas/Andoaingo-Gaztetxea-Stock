# Backend: Node 22 + tsx. Contexto de build = raíz del repositorio (necesita shared/ y db/).
FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY shared /app/shared
COPY db /app/db
COPY backend/src ./src
ENV NODE_ENV=production PORT=3000 SCHEMA_FILE=/app/db/schema.sql
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "--import", "tsx", "src/server.ts"]
