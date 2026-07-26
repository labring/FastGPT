#!/bin/bash

set -e

# Function to check if environment is development (case-insensitive)
is_development() {
    local env
    env=$(echo "${DATIVE_ENVIRONMENT}" | tr '[:upper:]' '[:lower:]')
    [[ "$env" == "development" ]]
}

start_arq() {
    echo "Starting ARQ worker..."
    # Use exec to replace the shell with arq_worker if running in single process mode
    if ! is_development; then
        exec arq_worker
    else
        arq_worker &
        ARQ_PID=$!
        echo "ARQ worker started with PID: $ARQ_PID"
    fi
}

start_uvicorn() {
    echo "Starting Uvicorn server..."
    # Use PORT environment variable, default to 3000 if not set
    local port="${PORT:-3000}"
    # Use exec to replace the shell with uvicorn if running in single process mode
    if ! is_development; then
        exec uvicorn dative.main:app --host '0.0.0.0' --port "$port"
    else
        uvicorn dative.main:app --host '0.0.0.0' --port "$port" &
        UVICORN_PID=$!
        echo "Uvicorn server started with PID: $UVICORN_PID"
    fi
}

# Start the appropriate service
if [[ "${MODE}" == "worker" ]]; then
    start_arq
else
    start_uvicorn
fi

if is_development; then
    sleep infinity
else
    echo "Signal handling disabled. Process will replace shell (exec)."
    # In this case, start_arq or start_uvicorn would have used exec
    # So we shouldn't reach here unless something went wrong
fi
