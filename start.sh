#!/usr/bin/env bash
# MusicXML 播放器本地服务器
# 音色库和 AudioWorklet 不能通过 file:// 加载，必须用 http 打开。

set -e

PORT="${1:-8000}"
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"

echo "打开: http://localhost:${PORT}/player.html"
echo "按 Ctrl+C 停止"

if command -v python3 >/dev/null 2>&1; then
    exec python3 -m http.server "$PORT"
else
    exec npx --yes http-server "$PORT" -c-1
fi
