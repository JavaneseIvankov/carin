FROM ghcr.io/astral-sh/uv:0.11.32 AS uv
FROM python:3.12.13-slim-bookworm AS build

COPY --from=uv /uv /uvx /bin/
WORKDIR /app/ai-service
COPY ai-service/pyproject.toml ai-service/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project --python /usr/local/bin/python

FROM python:3.12.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/ai-service/.venv/bin:$PATH"

WORKDIR /app
COPY --from=build --chown=10001:10001 /app/ai-service/.venv /app/ai-service/.venv
COPY --chown=10001:10001 ai-service/app /app/ai-service/app
COPY --chown=10001:10001 ai-service/data/synthetic-demo /app/ai-service/data/synthetic-demo
COPY --chown=10001:10001 specs/contracts/ai-service.openapi.yaml /app/specs/contracts/ai-service.openapi.yaml
RUN groupadd --system --gid 10001 carin \
    && useradd --system --uid 10001 --gid carin --home-dir /nonexistent --shell /usr/sbin/nologin carin

USER 10001:10001
WORKDIR /app/ai-service
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
