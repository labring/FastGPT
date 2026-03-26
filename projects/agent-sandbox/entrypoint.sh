#!/bin/bash

# Set work directory from environment variable, default to /home/sandbox
WORKDIR="${FASTGPT_WORKDIR:-/home/sandbox}"
mkdir -p "${WORKDIR}"

# Capture the flag before unsetting, then clear all FastGPT runtime vars
_ENABLE_CODE_SERVER="${FASTGPT_ENABLE_CODE_SERVER}"
unset FASTGPT_SESSION_ID FASTGPT_WORKDIR FASTGPT_ENABLE_CODE_SERVER

# Start code-server or sleep forever
if [ "${_ENABLE_CODE_SERVER}" = "true" ]; then
  # --bind-addr 0.0.0.0:8080 allows access from outside the container
  # --auth none removes password protection
  exec code-server \
       --bind-addr 0.0.0.0:8080 \
       --auth none \
       --disable-telemetry \
       --disable-update-check \
       --disable-workspace-trust \
       --disable-getting-started-override \
       --app-name "Skills" \
       --user-data-dir /home/sandbox/.local/share/code-server \
       "${WORKDIR}"
else
  exec sleep infinity
fi
