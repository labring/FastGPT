#!/bin/bash
set -euo pipefail

# Ensure home, workspace and container-ephemeral runtime directories exist before launching agents
HOME_DIR="${HOME:-/home/sandbox}"
WORKDIR="${FASTGPT_WORKDIR:-/home/sandbox/workspace}"
RUNTIME_DIR="${FASTGPT_RUNTIME_DIR:-/var/lib/fastgpt-runtime}"
mkdir -p "${HOME_DIR}" "${WORKDIR}" "${RUNTIME_DIR}"

if [ ! -w "${WORKDIR}" ]; then
  echo "Sandbox work directory is not writable: ${WORKDIR}" >&2
  exit 1
fi

if [ ! -w "${RUNTIME_DIR}" ]; then
  echo "Sandbox runtime directory is not writable: ${RUNTIME_DIR}" >&2
  exit 1
fi

echo "Starting fastgpt-ide-agent..."
exec fastgpt-ide-agent
