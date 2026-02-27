#!/bin/bash

# Start code-server
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
     --user-data-dir /home/coder/.local/share/code-server \
     /workspace/projects
