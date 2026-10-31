# Build TypeScript/React in a dependency-rich stage, then copy only runnable
# output and backend production dependencies to the non-root runtime stage.
# Install locked build tools before copying source so dependency layers can be cached.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
RUN cd backend && npm ci
RUN cd frontend && npm ci
COPY . .
RUN npm run build

# Start a fresh runtime image; frontend build tools and test packages do not ship here.
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 AUTO_MIGRATE=false
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/public ./backend/public
COPY --from=build /app/database ./database
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/docs/openapi.json ./docs/openapi.json
WORKDIR /app/backend
# Run the HTTP process without root privileges; Compose also restricts filesystem/capabilities.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
