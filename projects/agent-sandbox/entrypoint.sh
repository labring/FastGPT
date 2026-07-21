#!/bin/bash
set -euo pipefail

# Set work directory from environment variable, default to /home/sandbox
WORKDIR="${FASTGPT_WORKDIR:-/home/sandbox}"
mkdir -p "${WORKDIR}"

if [ ! -w "${WORKDIR}" ]; then
  echo "Sandbox work directory is not writable: ${WORKDIR}" >&2
  exit 1
fi

if [ "${IDE_AGENT_ENABLED:-false}" = "true" ]; then
  echo "Starting fastgpt-ide-agent..."
  fastgpt-ide-agent > /tmp/ide-agent.log 2>&1 &
fi

# Clear FastGPT runtime vars from the long-running shell after child processes inherit them.
unset FASTGPT_SESSION_ID FASTGPT_WORKDIR IDE_AGENT_ENABLED

# Keep the sandbox running so backend can execute commands
exec sleep infinity
