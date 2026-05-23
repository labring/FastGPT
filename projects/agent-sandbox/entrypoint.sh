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

# Keep the sandbox running so backend can execute commands
exec sleep infinity
