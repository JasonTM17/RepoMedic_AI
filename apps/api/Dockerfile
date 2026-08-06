# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN npm ci

COPY packages/core packages/core
COPY packages/api-client packages/api-client
COPY apps/api apps/api
RUN npm run build:core && npm run build:api-client && npm run build --workspace=@jasonTM17/api

FROM node:24-alpine AS runtime
ARG VCS_REF=local
LABEL org.opencontainers.image.source="https://github.com/JasonTM17/RepoMedic_AI" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
RUN addgroup -S repomedic && adduser -S -G repomedic -u 65532 repomedic
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/core ./packages/core
COPY --from=build /workspace/packages/api-client ./packages/api-client
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
USER 65532:65532
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/server.js"]
