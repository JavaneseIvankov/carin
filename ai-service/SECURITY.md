# API rate limit

Set `API_RATE_LIMIT_PER_MINUTE` in `.env` to choose how many authenticated internal API requests the service accepts per minute. The default is 5. The limit is shared by all authenticated routes and applies after `X-Carin-Service-Key` validation. A rejected request returns the standard error response with HTTP `429` and `Retry-After`.

The counter lives in process memory and resets when the process restarts. Each worker has its own counter, so run one Uvicorn worker when the configured number should be the service-wide limit. This implementation does not require Redis or another service.

The service key remains required for internal API routes. Image source, MIME type, checksum and size checks remain part of the existing image request contract.
