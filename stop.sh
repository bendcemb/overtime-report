#!/bin/bash
echo "Stopping Overtime Report server on port 5030..."
fuser -k 5030/tcp 2>/dev/null || true
echo "Server stopped."
