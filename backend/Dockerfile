# Build stage: install all dependencies and compile the TypeScript source.
FROM node:24-alpine AS build

WORKDIR /app

# Copy manifests first so dependency installation remains cached until they change.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage: keep only the runtime files and production dependencies.
FROM node:24-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# Install only production dependencies, including swagger-ui-dist, then remove npm cache.
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run without root privileges inside the container.
USER node

EXPOSE 3000
CMD ["npm", "start"]
