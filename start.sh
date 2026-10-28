#!/usr/bin/env bash
# MusicXML 播放器本地服务器
# 音色库和 AudioWorklet 不能通过 file:// 加载，必须用 http 打开。
# serve.py 会对 HTML / JS 发送 no-store，避免浏览器继续运行旧缓存。

set -e

PORT="${1:-8000}"
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"

if command -v python3 >/dev/null 2>&1; then
    exec python3 serve.py "$PORT"
else
    echo "打开: http://localhost:${PORT}/play.html"
    echo "按 Ctrl+C 停止"
    exec npx --yes http-server "$PORT" -c-1
fi
