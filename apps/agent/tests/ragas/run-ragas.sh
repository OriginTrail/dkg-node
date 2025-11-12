#!/bin/bash
set -euo pipefail

echo "🚀 Starting DKG Node RAGAS Evaluation..."

RAGAS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd ../../

# Track PIDs and cleanup properly
cleanup() {
    echo "🧹 Cleaning up..."

    # Try graceful shutdown first
    if [ -n "${FRONTEND_PID:-}" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "🔴 Stopping frontend server (PID: $FRONTEND_PID)..."
        kill -TERM $FRONTEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
    fi

    if [ -n "${BACKEND_PID:-}" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        echo "🔴 Stopping backend server (PID: $BACKEND_PID)..."
        kill -TERM $BACKEND_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
    fi

    # Give Node time to close ports
    sleep 1
    echo "✅ Cleanup complete"
}
trap cleanup EXIT INT TERM

# Start servers in separate process group (isolated from Jenkins wrapper)
set -m

if ! curl -s http://localhost:8081 > /dev/null 2>&1; then
    echo "🔄 Starting frontend server..."
    cd apps/agent
    export EXPO_NO_BROWSER=1
    export BROWSER=none
    npm run dev:app >/dev/null 2>&1 &
    FRONTEND_PID=$!
    cd ../../
    echo "⏳ Waiting for frontend..."
    for i in {1..30}; do
        curl -s http://localhost:8081 >/dev/null 2>&1 && break
        sleep 1
    done
    echo "✅ Frontend ready"
fi

if ! curl -s http://localhost:9200 > /dev/null 2>&1; then
    echo "🔄 Starting backend server..."
    cd apps/agent
    node dist/index.js --dev >/dev/null 2>&1 &
    BACKEND_PID=$!
    cd ../../
    echo "⏳ Waiting for backend..."
    for i in {1..15}; do
        curl -s http://localhost:9200 >/dev/null 2>&1 && break
        sleep 1
    done
    echo "✅ Backend ready"
fi

# Run evaluation in its own process group
echo "📊 Running DKG Node evaluation..."
( NODE_OPTIONS='--import tsx' tsx "${RAGAS_DIR}/evaluate.ts" ) &
EVAL_PID=$!
PGID=$(ps -o pgid= $EVAL_PID | tr -d ' ')

wait $EVAL_PID
EXIT_CODE=$?

# Gracefully close all background jobs
kill -TERM -$PGID 2>/dev/null || true
sleep 1
kill -KILL -$PGID 2>/dev/null || true

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Evaluation complete!"
else
    echo "❌ Evaluation failed!"
fi

# Extra sleep to let Jenkins durable log flush
sleep 2
exit $EXIT_CODE