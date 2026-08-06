FROM node:22-alpine

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* tsconfig*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/core/package.json ./packages/core/

# Copy source code
COPY apps/api ./apps/api
COPY packages/core ./packages/core

# Install dependencies and build
RUN npm install
RUN npm run build:core
RUN npm run build:api

# Expose port
EXPOSE 3000

# Start API app
CMD ["npm", "run", "dev:api"]
