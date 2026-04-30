# Build:
#   docker build -t fastgpt-volume-manager:latest .

FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "src/index.ts"]
