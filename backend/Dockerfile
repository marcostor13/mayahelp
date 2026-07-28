# --- deps ---
FROM node:24-alpine AS deps
WORKDIR /app
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
RUN addgroup -S mayahelp && adduser -S mayahelp -G mayahelp
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER mayahelp
EXPOSE 3000
CMD ["node", "dist/main.js"]
