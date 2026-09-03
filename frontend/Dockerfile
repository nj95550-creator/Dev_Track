# Build stage: install frontend dependencies and compile the Vite production bundle.
FROM node:24-alpine AS build

WORKDIR /app

# Copy manifests first to keep npm ci cached when source files change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

# Runtime stage: serve the compiled static application from a small Nginx image.
FROM nginx:1.29-alpine AS production

# Replace the default site with the DevTrack production files and configuration.
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Nginx remains in its normal foreground mode via the base image command.
