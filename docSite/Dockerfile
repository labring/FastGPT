FROM hugomods/hugo:0.117.0 AS builder

WORKDIR /app

ADD ./docSite hugo
RUN cd /app/hugo && hugo mod get -u github.com/colinwilson/lotusdocs@6d0568e && hugo -v --minify

FROM fholzer/nginx-brotli:latest

LABEL org.opencontainers.image.source https://github.com/labring/FastGPT

COPY --from=builder /app/hugo/public /usr/share/nginx/html

COPY ./docSite/nginx.conf /etc/nginx/conf.d/default.conf