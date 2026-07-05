FROM node:20-alpine AS vendor
WORKDIR /build
RUN npm install @ffmpeg/ffmpeg@0.12.15 @ffmpeg/core@0.12.10

FROM nginx:alpine

RUN printf '%s\n' \
  'server {' \
  '    listen 80;' \
  '    server_name _;' \
  '    root /usr/share/nginx/html;' \
  '    index index.html;' \
  '' \
  '    add_header Cross-Origin-Opener-Policy "same-origin" always;' \
  '    add_header Cross-Origin-Embedder-Policy "credentialless" always;' \
  '' \
  '    location / {' \
  '        try_files $uri $uri/ /index.html;' \
  '    }' \
  '' \
  '    location ~* \.wasm$ {' \
  '        default_type application/wasm;' \
  '    }' \
  '' \
  '    gzip on;' \
  '    gzip_types text/css application/javascript text/plain application/json image/svg+xml application/wasm;' \
  '}' \
  > /etc/nginx/conf.d/default.conf

COPY web/ /usr/share/nginx/html/
COPY --from=vendor /build/node_modules/@ffmpeg/ffmpeg/dist/esm /usr/share/nginx/html/vendor/ffmpeg-esm
COPY --from=vendor /build/node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js /usr/share/nginx/html/vendor/
COPY --from=vendor /build/node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm /usr/share/nginx/html/vendor/

EXPOSE 80
