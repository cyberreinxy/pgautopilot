FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client docker-cli
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]