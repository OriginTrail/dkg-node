#!/bin/bash

echo "🚀 Starting DKG Node RAGAS Evaluation..."

# Store the original directory
RAGAS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Go back to project root to find .env file
cd ../../

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up..."
    
    # In CI, use force kill (-9) to prevent hanging
    if [ -n "$CI" ] || [ -n "$JENKINS_URL" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$GITLAB_CI" ]; then
        KILL_SIGNAL="-9"
        echo "🤖 CI environment detected - using force kill"
    else
        KILL_SIGNAL=""
    fi
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "🔴 Stopping frontend server (PID: $FRONTEND_PID)..."
        kill $KILL_SIGNAL $FRONTEND_PID 2>/dev/null || true
        sleep 1
    fi
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        echo "🔴 Stopping backend server (PID: $BACKEND_PID)..."
        kill $KILL_SIGNAL $BACKEND_PID 2>/dev/null || true
        sleep 1
    fi
    # Note: Dashboard process (DASHBOARD_PID) is intentionally NOT killed
    # to allow continued access to results after evaluation completes
    exit
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Check if frontend is already running
if curl -s http://localhost:8081 > /dev/null 2>&1; then
    echo "✅ Frontend already running at http://localhost:8081"
    FRONTEND_ALREADY_RUNNING=true
else
    echo "🔄 Starting frontend server..."
    # Start only the frontend (much faster)
    cd apps/agent
    # Set environment variables to prevent browser opening but not trigger CI detection
    export EXPO_NO_BROWSER=1
    export BROWSER=none
    npm run dev:app &
    FRONTEND_PID=$!
    cd ../../
    FRONTEND_ALREADY_RUNNING=false
    
    echo "⏳ Waiting for frontend to start..."
    
    # Wait for frontend to be ready (up to 30 seconds)
    for i in {1..30}; do
        if curl -s http://localhost:8081 > /dev/null 2>&1; then
            echo "✅ Frontend ready at http://localhost:8081"
            break
        fi
        
        if [ $i -eq 30 ]; then
            echo "❌ Frontend failed to start within 30 seconds"
            exit 1
        fi
        
        sleep 1
        echo -n "."
    done
fi

# Check if backend is already running
if curl -s http://localhost:9200 > /dev/null 2>&1; then
    echo "✅ Backend already running at http://localhost:9200"
    BACKEND_ALREADY_RUNNING=true
else
    echo "🔄 Starting backend server..."
    # Start only the backend using pre-built files (very fast)
    cd apps/agent
    node dist/index.js --dev &
    BACKEND_PID=$!
    cd ../../
    BACKEND_ALREADY_RUNNING=false
    
    echo "⏳ Waiting for backend to start..."
    
    # Wait for backend to be ready (up to 15 seconds)
    for i in {1..15}; do
        if curl -s http://localhost:9200 > /dev/null 2>&1; then
            echo "✅ Backend ready at http://localhost:9200"
            break
        fi
        
        if [ $i -eq 15 ]; then
            echo "❌ Backend failed to start within 15 seconds"
            exit 1
        fi
        
        sleep 1
        echo -n "."
    done
fi

# Run evaluation with useful progress info
echo "📊 Running DKG Node evaluation..."
NODE_OPTIONS='--import tsx' tsx "${RAGAS_DIR}/evaluate.ts"

if [ $? -eq 0 ]; then
    echo "✅ Evaluation complete!"
    
    # Check if we're in a CI environment
    if [ -n "$CI" ] || [ -n "$JENKINS_URL" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$GITLAB_CI" ]; then
        echo "🤖 Running in CI environment - skipping dashboard"
        echo "🎉 RAGAS evaluation finished!"
        echo "📊 Results available in console output"
    else
        # Local environment - start dashboard and open browser
        if curl -s http://localhost:3001 > /dev/null 2>&1; then
            echo "🌐 Dashboard already running at http://localhost:3001"
        else
            echo "🌐 Starting dashboard..."
            NODE_OPTIONS='--import tsx' tsx "${RAGAS_DIR}/dashboard.ts" &
            DASHBOARD_PID=$!
            sleep 2
        fi
        
        # Open dashboard in browser (only on local)
        if command -v open > /dev/null 2>&1; then
            echo "🌐 Opening dashboard in browser..."
            open http://localhost:3001
        elif command -v xdg-open > /dev/null 2>&1; then
            echo "🌐 Opening dashboard in browser..."
            xdg-open http://localhost:3001
        elif command -v start > /dev/null 2>&1; then
            echo "🌐 Opening dashboard in browser..."
            start http://localhost:3001
        else
            echo "🌐 Dashboard available at: http://localhost:3001"
        fi
        
        echo "🎉 RAGAS evaluation finished!"
        echo "📊 View detailed results at: http://localhost:3001"
        
        # Stop the evaluation servers but keep dashboard running
        if [ "$FRONTEND_ALREADY_RUNNING" = false ] && [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
            echo "🔴 Stopping frontend server (evaluation complete)..."
            kill $FRONTEND_PID 2>/dev/null || true
            sleep 1
            FRONTEND_PID=""
        fi
        
        if [ "$BACKEND_ALREADY_RUNNING" = false ] && [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
            echo "🔴 Stopping backend server (evaluation complete)..."
            kill $BACKEND_PID 2>/dev/null || true
            sleep 1
            BACKEND_PID=""
        fi
        
        echo "✅ Evaluation servers stopped"
        echo "🌐 Dashboard still running at: http://localhost:3001"
        echo "💡 Dashboard will continue running until manually stopped"
    fi
else
    echo "❌ Evaluation failed!"
    exit 1
fi