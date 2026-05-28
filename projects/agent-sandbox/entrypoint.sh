#!/bin/bash
set -euo pipefail

# Set work directory from environment variable, default to /home/sandbox
WORKDIR="${FASTGPT_WORKDIR:-/home/sandbox}"
mkdir -p "${WORKDIR}"

if [ ! -w "${WORKDIR}" ]; then
  echo "Sandbox work directory is not writable: ${WORKDIR}" >&2
  exit 1
fi

# Clear all FastGPT runtime vars for security
unset FASTGPT_SESSION_ID FASTGPT_WORKDIR

# 后台拉起极轻量的专属 fastgpt-ide-agent 监听指定端口（仅在明确启用时）
if [ "${IDE_AGENT_ENABLED:-}" = "true" ]; then
  BIND_ADDR="${IDE_AGENT_BIND_ADDR:-0.0.0.0:1318}"
  echo "Starting fastgpt-ide-agent on ${BIND_ADDR}..."
  fastgpt-ide-agent > /tmp/ide-agent.log 2>&1 &
fi

# Keep the sandbox running so backend can execute commands
exec sleep infinity
