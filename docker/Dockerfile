# --- Base: Node + pnpm (se comparte entre etapas y se cachea) ---
FROM node:24-slim AS base
WORKDIR /app
RUN npm install -g pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --- Dependencias de producción (sin vite, tsx, typescript...) ---
FROM base AS deps
RUN pnpm install --prod --frozen-lockfile

# --- Compilación: web (client/dist) y servidor (dist-server) ---
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm build:server

# --- Imagen final: solo lo necesario para ejecutar, sin pnpm ni código fuente ---
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080

# package.json hace falta por "type": "module"
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/dist-server ./dist-server

# Sin root; los archivos siguen siendo de root y de solo lectura para el usuario node
USER node
EXPOSE 8080

# Node trae fetch; la imagen no tiene curl ni wget
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "dist-server/index.js"]
