#!/bin/bash

# Set work directory from environment variable, default to /home/sandbox
WORKDIR="${FASTGPT_WORKDIR:-/home/sandbox}"
mkdir -p "${WORKDIR}"

# Clear all FastGPT runtime vars for security
unset FASTGPT_SESSION_ID FASTGPT_WORKDIR

# Keep the sandbox running so backend can execute commands
exec sleep infinity
