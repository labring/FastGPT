FROM astral/uv:0.8-python3.11-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends gcc libc-dev

ENV UV_COMPILE_BYTECODE=1 UV_NO_INSTALLER_METADATA=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    --mount=type=bind,source=scripts/install_duckdb_extensions.py,target=install_duckdb_extensions.py \
    uv sync --frozen --no-install-project --no-dev \
    && uv run python install_duckdb_extensions.py

# clean the cache
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

FROM python:3.11-slim-bookworm AS runtime

COPY --from=builder --chown=dative:dative /.venv /.venv
COPY --from=builder --chown=dative:dative /root/.duckdb /root/.duckdb

COPY src/dative /dative

COPY docker/entrypoint.sh /

ENV PATH="/.venv/bin:$PATH"

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
