# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN npm ci

COPY packages/api-client packages/api-client
COPY apps/web apps/web
RUN npm run build:api-client && npm run build --workspace=@jasonTM17/web

FROM node:22-alpine AS runtime
ARG VCS_REF=local
LABEL org.opencontainers.image.source="https://github.com/JasonTM17/RepoMedic_AI" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
RUN addgroup -S repomedic && adduser -S -G repomedic -u 65532 repomedic
COPY --from=build /workspace/packages/api-client ./packages/api-client
COPY --from=build /workspace/apps/web/public ./public
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./.next/static
USER 65532:65532
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
