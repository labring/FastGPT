#!/bin/bash
set -eu

# Ensure the configured sandbox workspace directory exists and is writable before execd accepts traffic.
WORKDIR="${FASTGPT_WORKDIR:-/workspace}"
mkdir -p "${WORKDIR}"

if [ ! -w "${WORKDIR}" ]; then
  echo "Sandbox work directory is not writable: ${WORKDIR}" >&2
  exit 1
fi

# Keep PID 1 alive so OpenSandbox execd serves commands, filesystem I/O, and PTY sessions.
exec sleep infinity
