#!/usr/bin/env python3
"""Musikoo 本地开发服务器。

Python 自带的 http.server 只发送 Last-Modified，不发送 Cache-Control。
Chrome 等浏览器会按启发式规则把 HTML / ES Module 缓存很久，
导致修改后的播放器看起来“没生效”。这里统一对源码文件发送
no-store，保证每次刷新都拿到磁盘上的最新版本。
"""

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))

NO_STORE_EXTENSIONS = {
    ".html", ".htm",
    ".js", ".mjs", ".css",
    ".json", ".xml", ".musicxml",
    ".map", ".txt",
}


class NoCacheHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        ext = os.path.splitext(path)[1].lower()

        if ext in NO_STORE_EXTENSIONS or path.endswith("/"):
            self.send_header(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, max-age=0"
            )
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")

        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    server = ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler)

    print(f"打开: http://localhost:{port}/play.html")
    print(f"播放器: http://localhost:{port}/player.html")
    print("已禁用源码缓存，修改后刷新即可生效")
    print("按 Ctrl+C 停止")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
