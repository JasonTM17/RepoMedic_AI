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

COPY packages/core packages/core
COPY packages/api-client packages/api-client
COPY apps/cli apps/cli
RUN npm run build:core && npm run build:api-client && npm run build --workspace=@jasonTM17/cli

FROM node:22-alpine AS runtime
ARG VCS_REF=local
LABEL org.opencontainers.image.source="https://github.com/JasonTM17/RepoMedic_AI" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
RUN addgroup -S repomedic && adduser -S -G repomedic -u 65532 repomedic
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/core ./packages/core
COPY --from=build /workspace/packages/api-client ./packages/api-client
COPY --from=build /workspace/apps/cli/package.json ./package.json
COPY --from=build /workspace/apps/cli/dist ./dist
USER 65532:65532
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["node", "dist/index.js", "doctor"]
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
