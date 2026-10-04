# ---- stage 1: build the React frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- stage 2: backend + built frontend ----
FROM node:20-alpine
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 4000
CMD ["node", "src/server.js"]
