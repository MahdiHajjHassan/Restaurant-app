"""Independent loopback HTTP service."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import mimetypes
from pathlib import Path
import threading
from urllib.parse import urlsplit
import zipfile

TOP_FILES = {'.gitignore', 'domain.py', 'serve.py', 'schema.sql', 'index.html', 'model.py', 'qa_runner.mjs', 'DESIGN.md', 'service.py', 'orchestration.py', 'artifacts.py', 'warehouse.sql', 'verify_journey.py', 'vite.config.ts', 'test_product.py', 'requirements.txt', 'retrieval.py', 'README.md', 'package.json', 'test_pipeline.py', 'tsconfig.json', 'PUBLIC-SOURCE.md', 'cli.py', 'package-lock.json', 'PRODUCT.md', 'runtime.py'}

ROOT = Path(__file__).resolve().parent

def launch(product_type, default_port=8921):
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".product-data")
    args = parser.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)
    product = product_type(args.data_dir)
    lock = threading.RLock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            if args and str(args[1]) not in ("200", "304"):
                print(fmt % args, flush=True)
        def respond(self, status, data, content_type="application/json"):
            if isinstance(data, (dict, list)):
                data = json.dumps(data, ensure_ascii=False).encode()
            elif isinstance(data, str):
                data = data.encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
        def trusted(self):
            return self.headers.get("Host") in {f"127.0.0.1:{args.port}", f"localhost:{args.port}"}
        def do_GET(self):
            if not self.trusted():
                return self.respond(403, {"error": "Use this product's loopback URL."})
            path = urlsplit(self.path).path
            if path == "/api/health":
                return self.respond(200, {"ok": True, "product": ROOT.name})
            if path == "/api/state":
                with lock:
                    return self.respond(200, product.state())
            if path == "/api/source.zip":
                archive = io.BytesIO()
                with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
                    for f in sorted(ROOT.rglob("*")):
                        rel = f.relative_to(ROOT)
                        if f.is_file() and ((len(rel.parts) == 1 and f.name in TOP_FILES) or rel.parts[0] in {"src", "public", "fixtures", "tests", "migrations", "cloud", "screenshots"}) and not any(p in {"node_modules", "dist", "__pycache__", ".git"} for p in rel.parts) and (f.name == ".gitignore" or f.suffix in {".py", ".tsx", ".ts", ".js", ".mjs", ".cjs", ".css", ".html", ".json", ".csv", ".toml", ".ini", ".sql", ".yaml", ".yml", ".md", ".txt", ".ttf", ".woff", ".woff2", ".jpg", ".png", ".svg"}) and not f.name.startswith(".env"):
                            bundle.writestr((Path(ROOT.name) / rel).as_posix(), f.read_bytes())
                return self.respond(200, archive.getvalue(), "application/zip")
            root = ROOT / "dist"
            target = (root / path.lstrip("/")).resolve()
            if not target.is_relative_to(root.resolve()):
                return self.respond(404, {"error": "File not found."})
            if not target.is_file():
                target = root / "index.html"
            if target.is_file():
                mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                return self.respond(200, target.read_bytes(), mime)
            return self.respond(503, {"error": "Build the interface with npm install and npm run build."})
        def do_POST(self):
            if not self.trusted():
                return self.respond(403, {"error": "Use this product's loopback URL."})
            origin = self.headers.get("Origin")
            if origin and origin not in {f"http://127.0.0.1:{args.port}", f"http://localhost:{args.port}"}:
                return self.respond(403, {"error": "Foreign origin denied."})
            path = urlsplit(self.path).path
            if not path.startswith("/api/") or "/" in path[5:]:
                return self.respond(404, {"error": "Unknown action."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 2 * 1024 * 1024:
                    return self.respond(413, {"error": "Provide a JSON payload below 2 MiB."})
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("Provide a JSON object.")
                with lock:
                    return self.respond(200, product.action(path[5:], payload))
            except PermissionError as e:
                return self.respond(403, {"error": str(e)})
            except RuntimeError as e:
                return self.respond(409, {"error": str(e)})
            except (ValueError, KeyError, TypeError) as e:
                return self.respond(400, {"error": str(e)})
            except Exception as e:
                print(f"Action failed: {type(e).__name__}: {e}", flush=True)
                return self.respond(500, {"error": "Action failed. Check the local server output."})
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"{ROOT.name}: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
