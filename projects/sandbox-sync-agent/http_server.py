#!/usr/bin/env python3
"""
Sync Agent HTTP 服务
提供健康检查和手动触发同步接口，读取 sync.sh 写入的状态文件。
"""
import http.server
import json
import os
import pathlib
from datetime import datetime, timezone

STATE_DIR = pathlib.Path(os.environ.get('STATE_DIR', '/tmp/sync-state'))
HTTP_PORT = int(os.environ.get('HTTP_PORT', '8081'))


class SyncAgentHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 抑制每次请求的访问日志

    def _read_state(self):
        try:
            last_sync = (STATE_DIR / 'last_sync').read_text().strip()
        except Exception:
            last_sync = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        try:
            pending = int((STATE_DIR / 'pending_count').read_text().strip())
        except Exception:
            pending = 0
        return last_sync, pending

    def _send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            last_sync, pending = self._read_state()
            self._send_json(200, {
                'status': 'healthy',
                'lastSync': last_sync,
                'pendingCount': pending
            })
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/sync':
            STATE_DIR.mkdir(parents=True, exist_ok=True)
            (STATE_DIR / 'trigger').touch()
            self._send_json(200, {'success': True})
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == '__main__':
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    server = http.server.HTTPServer(('', HTTP_PORT), SyncAgentHandler)
    print(f'[Sync] HTTP server listening on :{HTTP_PORT}', flush=True)
    server.serve_forever()
