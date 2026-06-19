FROM public.ecr.aws/docker/library/node:22-alpine3.20 AS build

WORKDIR /app


COPY package.json package-lock.json ./

RUN npm ci

COPY src/ src/
COPY scripts/ scripts/
COPY index.html tsconfig*.json vite.config.ts react-router.config.ts ./

ARG VITE_API_URL

RUN npm run build

FROM public.ecr.aws/docker/library/nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --spider -q --no-check-certificate https://127.0.0.1/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
