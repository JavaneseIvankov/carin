"""Real local HTTP smoke: two analysis calls, then spam rejected before inference.

Default provider is a labelled local fixture. --live makes exactly two target
Alibaba calls using the existing service .env, and never retries paid requests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import httpx
from dotenv import dotenv_values


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.contract import validate_payload  # noqa: E402


def run(image: Path, live: bool) -> dict:
    source = image.read_bytes()
    counts = {"media_downloads": 0, "simulated_provider_calls": 0}

    class Fixture(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if urlsplit(self.path).path != "/meal.jpg":
                self.send_error(404)
                return
            counts["media_downloads"] += 1
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(source)))
            self.end_headers()
            self.wfile.write(source)

        def do_POST(self):
            if self.path != "/v1/chat/completions" or live:
                self.send_error(404)
                return
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            counts["simulated_provider_calls"] += 1
            content = {
                "is_food": True, "container_diameter_cm": 20, "apparent_volume_cm3": 200,
                "weight_g": 150, "components": [{"name": "rice", "mass_g": 150}],
                "prediction": {"energy_kcal": 195, "protein_g": 4, "carbohydrate_g": 42, "fat_g": 0.5},
                "limitations": ["Simulated provider output for HTTP/security verification."],
            }
            envelope = {"model": payload["model"], "choices": [{
                "finish_reason": "stop", "message": {"content": json.dumps(content)},
            }]}
            data = json.dumps(envelope).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    fixture_thread = threading.Thread(target=fixture.serve_forever, daemon=True)
    fixture_thread.start()
    fixture_port = fixture.server_address[1]
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    api_port = listener.getsockname()[1]
    key = secrets.token_urlsafe(32)
    env = {**os.environ, **{key: value for key, value in dotenv_values(ROOT / ".env").items() if value is not None}}
    if live and (not env.get("DASHSCOPE_API_KEY") or not env.get("VLM_BASE_URL")):
        fixture.shutdown()
        fixture.server_close()
        listener.close()
        raise RuntimeError("Live provider credentials are not configured")
    env.update({
        "AI_SERVICE_KEY": key, "REQUEST_MAX_BYTES": "65536",
        "API_RATE_LIMIT_PER_MINUTE": "2",
        "MEDIA_ALLOWED_HOSTS": f"127.0.0.1:{fixture_port}", "VLM_TIMEOUT_SECONDS": "60",
    })
    if not live:
        env.update({"DASHSCOPE_API_KEY": "local-fixture-only", "VLM_BASE_URL": f"http://127.0.0.1:{fixture_port}/v1"})

    checks = []
    results = []
    with tempfile.TemporaryFile() as server_log:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--fd", str(listener.fileno()),
             "--no-access-log", "--no-server-header", "--no-proxy-headers"],
            cwd=ROOT, env=env, pass_fds=(listener.fileno(),), stdout=server_log, stderr=server_log,
        )
        try:
            with httpx.Client(base_url=f"http://127.0.0.1:{api_port}", timeout=88, trust_env=False) as client:
                headers = {"X-Carin-Service-Key": key}
                for attempt in range(100):
                    try:
                        ready = client.get("/openapi.json")
                        if ready.status_code == 200:
                            break
                    except httpx.ConnectError:
                        pass
                    if process.poll() is not None:
                        raise RuntimeError("Local API startup failed; server output suppressed to protect credentials")
                    time.sleep(0.05)
                else:
                    raise RuntimeError("Local API did not become ready")

                a, b = "/internal/ai-service/a-model", "/internal/ai-service/b-model"
                body = {"image": {
                    "downloadUrl": f"http://127.0.0.1:{fixture_port}/meal.jpg?fixture=local-test",
                    "mimeType": "image/jpeg", "sha256": hashlib.sha256(source).hexdigest(),
                }}
                for name, response, expected in (
                    ("missing-key", client.post(a, json=body), 401),
                    ("invalid-key", client.post(b, headers={"X-Carin-Service-Key": "invalid"}, json=body), 401),
                    ("body-limit", client.post(a, headers=headers, content=b"x" * 65537), 413),
                ):
                    assert response.status_code == expected, name
                    validate_payload("Error", response.json())
                    checks.append({"check": name, "status": expected, "passed": True})

                for route in ("/internal/v1/experiments/a1v1/variant-a", "/internal/v1/experiments/a1v1/variant-b"):
                    assert client.post(route, headers=headers, json=body).status_code == 404
                checks.append({"check": "retired-aliases-removed", "passed": True})

                for route in (a, b):
                    started = time.perf_counter()
                    response = client.post(route, headers=headers, json=body)
                    elapsed = time.perf_counter() - started
                    if response.status_code != 200:
                        raise RuntimeError(f"Analysis smoke failed with HTTP {response.status_code}; no automatic retry")
                    prediction = response.json()
                    validate_payload("A1V1Prediction", prediction)
                    assert "X-Carin-Model" not in response.headers
                    assert response.headers["Cache-Control"] == "no-store"
                    results.append({"endpoint": route, "status": 200, "elapsed_seconds": round(elapsed, 3),
                                    "schema_valid": True, "is_food": prediction["is_food"], "weight_g": prediction["weight_g"]})

                downloads_before_spam = counts["media_downloads"]
                spam_statuses = []
                for index in range(20):
                    route = (a, b, "/internal/v1/analyses")[index % 3]
                    response = client.post(route, headers=headers, json=body)
                    assert response.status_code == 429
                    assert response.json()["error"]["code"] == "RATE_LIMITED"
                    assert int(response.headers["Retry-After"]) >= 1
                    validate_payload("Error", response.json())
                    spam_statuses.append(response.status_code)
                assert counts["media_downloads"] == downloads_before_spam == 2
                if not live:
                    assert counts["simulated_provider_calls"] == 2
                checks.append({"check": "shared-spam-quota", "requests": 20, "statuses": spam_statuses,
                               "extra_media_downloads": 0, "passed": True})
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            listener.close()
            fixture.shutdown()
            fixture.server_close()

    return {
        "mode": "live-alibaba" if live else "simulated-provider", "image": image.name,
        "transport": "real local HTTP + fixture object storage + JPEG normalization",
        "rate_limiter": "in-memory process-local, shared by authenticated internal API routes",
        "test_api_limit_per_minute": 2, "default_api_limit_per_minute": 5,
        "target_provider_calls": 2, "endpoints": results, "checks": checks,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Make two paid provider calls without retry")
    parser.add_argument("--image", type=Path, default=ROOT.parent / "experiments/model-evaluation/data/lefood-set/images/lefood-14.jpg")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    summary = run(args.image, args.live)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
