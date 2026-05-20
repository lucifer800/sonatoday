# Dockerfile — Fly.io builds this image and runs the container.
# Uses Node 20 LTS on Debian slim (sqlite3 has prebuilt binaries for it).

FROM node:20-bookworm-slim

WORKDIR /app

# Copy backend manifests first so npm install layer caches well
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy everything else (.dockerignore filters out junk)
COPY . .

# Fly assigns the port via PORT env; default Express listen uses it.
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

# Seed runs every boot (idempotent INSERT OR REPLACE) then starts the server.
CMD ["sh", "-c", "cd backend && node seedJewellers.js && node server.js"]
