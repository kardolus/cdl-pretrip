# CDL Pretrip — static study app served by nginx.
FROM nginx:1.27-alpine
COPY site/ /usr/share/nginx/html
# long cache for fonts/images, no-cache for the app shell + data/js/css so updates land
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location = /index.html { add_header Cache-Control "no-cache"; }\n\
  location ~* \\.(css|svg|js|json)$ { add_header Cache-Control "no-cache"; }\n\
  location ~* \\.(webp|png|jpg|woff2)$ { add_header Cache-Control "public, max-age=86400"; }\n\
  location / { try_files $uri $uri/ /index.html; }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
