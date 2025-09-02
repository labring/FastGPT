FROM mirrors.sangfor.com/python:3.11-slim-bookworm AS builder
COPY --from=mirrors.sangfor.com/astral-sh/uv:0.7.17 /uv /uvx /bin/

WORKDIR /app
# Build context ../../
ADD ./packages /app/packages

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-workspace --no-install-project --no-editable --no-dev

# Sync the project
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --package diting-server --no-editable --no-dev

FROM mirrors.sangfor.com/python:3.11-slim-bookworm
# Copy the environment, but not the source code
COPY --from=builder --chown=diting:diting /app/.venv /app/.venv
# ENV DT_SERVER_DATA="/app/data"
# VOLUME ["/app/data"]
EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "diting_server.main:app", "--host", "0.0.0.0"]
