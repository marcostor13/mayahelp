# --- deps ---
FROM node:24-alpine AS deps
WORKDIR /app
# Force devDependencies install regardless of any inherited NODE_ENV=production
# build-arg (e.g. injected by the deploy platform) — @angular/cli lives here.
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:24-alpine AS build
WORKDIR /app
ARG API_URL=https://api.mayahelp.example.com/api
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN sed -i "s#https://api.mayahelp.example.com/api#${API_URL}#" src/environments/environment.ts
RUN npm run build -- --configuration production

# --- runtime ---
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
