FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ARG APP
ARG VITE_API_BASE_URL=http://localhost:8072
ARG VITE_KEYCLOAK_URL=http://localhost:7080
ARG VITE_KEYCLOAK_REALM=master
ARG VITE_KEYCLOAK_CLIENT_ID=easybank-shell
ARG VITE_ACCOUNTS_REMOTE=http://localhost:3001/remoteEntry.js
ARG VITE_CARDS_REMOTE=http://localhost:3002/remoteEntry.js
ARG VITE_LOANS_REMOTE=http://localhost:3003/remoteEntry.js
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID \
    VITE_ACCOUNTS_REMOTE=$VITE_ACCOUNTS_REMOTE \
    VITE_CARDS_REMOTE=$VITE_CARDS_REMOTE \
    VITE_LOANS_REMOTE=$VITE_LOANS_REMOTE
RUN pnpm --filter "@easybank/${APP}" build

FROM nginx:1.27-alpine
ARG APP
ARG PORT=8080
ENV PORT=${PORT}
ENV NGINX_ENVSUBST_FILTER=PORT
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/apps/${APP}/dist /usr/share/nginx/html
EXPOSE ${PORT}
