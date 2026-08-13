FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
COPY server/scripts ./scripts
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client docker-cli
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/index.js"]