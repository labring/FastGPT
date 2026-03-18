# Build:
#   docker build -t fastgpt-volume-manager:latest .
#
# Run:
#   docker run -e VM_AUTH_TOKEN=changeme -e VM_RUNTIME=kubernetes -p 3001:3001 fastgpt-volume-manager:latest

FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3001

CMD ["bun", "src/index.ts"]
