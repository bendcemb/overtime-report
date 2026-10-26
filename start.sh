#!/bin/bash
cd "$(dirname "$0")"

# Kill any existing process on port 5030
fuser -k 5030/tcp 2>/dev/null || true
sleep 1

# Start Gunicorn server in background
nohup gunicorn -w 2 -b 0.0.0.0:5030 --timeout 60 --access-logfile - --error-logfile server.log app:app > server.log 2>&1 &

sleep 2
if fuser 5030/tcp >/dev/null 2>&1; then
    echo "Overtime Report server started successfully on http://0.0.0.0:5030"
else
    echo "Failed to start server. Check server.log for details."
    exit 1
fi
