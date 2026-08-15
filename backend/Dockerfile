# --- deps ---
FROM node:24-alpine AS deps
WORKDIR /app
# Force devDependencies install regardless of any inherited NODE_ENV=production
# build-arg (e.g. injected by the deploy platform) — @nestjs/cli lives here.
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

# --- runtime ---
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# mongodump/mongorestore para los backups programados de base de datos. Si el paquete no
# está en la rama estable de Alpine, se cae a la community de edge (es un binario Go
# estático, no arrastra el resto de edge). Sin esto, el backend arranca igual pero cada
# backup falla con "No se encontró el binario mongodump".
RUN apk add --no-cache mongodb-tools \
  || apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community mongodb-tools
RUN addgroup -S mayahelp && adduser -S mayahelp -G mayahelp
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER mayahelp
EXPOSE 3000
CMD ["node", "dist/main.js"]
