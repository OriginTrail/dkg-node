#!/bin/bash
# Load Bicycle Manufacturing Story - EPCIS Test Events
# Usage: ./load-test-events.sh [BASE_URL]

BASE_URL="${1:-http://localhost:9200}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$SCRIPT_DIR/bicycle-manufacturing-story.json"

echo "🚴 Alpine Cycles - Bicycle Manufacturing Story"
echo "================================================"
echo "Loading EPCIS events to: $BASE_URL"
echo ""

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Install with: apt install jq"
    exit 1
fi

# Load each event
EVENT_COUNT=$(jq '.events | length' "$DATA_FILE")
echo "📦 Found $EVENT_COUNT events to load"
echo ""

for i in $(seq 0 $((EVENT_COUNT - 1))); do
    EVENT_NAME=$(jq -r ".events[$i].name" "$DATA_FILE")
    EVENT_DESC=$(jq -r ".events[$i].description" "$DATA_FILE")
    
    echo "[$((i + 1))/$EVENT_COUNT] $EVENT_NAME"
    echo "         $EVENT_DESC"
    
    # Extract and send the document
    DOCUMENT=$(jq ".events[$i].document" "$DATA_FILE")
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/epcis/capture" \
        -H "Content-Type: application/json" \
        -d "$DOCUMENT")
    
    CAPTURE_ID=$(echo "$RESPONSE" | jq -r '.captureID // "error"')
    STATUS=$(echo "$RESPONSE" | jq -r '.status // "error"')
    
    if [ "$CAPTURE_ID" != "error" ] && [ "$CAPTURE_ID" != "null" ]; then
        echo "         ✅ Captured: ID=$CAPTURE_ID"
    else
        echo "         ❌ Failed: $RESPONSE"
    fi
    echo ""
    
    # Small delay to avoid overwhelming the server
    sleep 0.5
done

echo "================================================"
echo "✅ All events loaded!"
echo ""
echo "🔍 Test Queries to Try:"
echo ""
echo "1. Track the carbon frame through assembly:"
echo "   curl '$BASE_URL/epcis/events?epc=urn:epc:id:sgtin:4012345.011111.1001&fullTrace=true'"
echo ""
echo "2. Track the finished bicycle:"
echo "   curl '$BASE_URL/epcis/events?epc=urn:epc:id:sgtin:4012345.099999.9001&fullTrace=true'"
echo ""
echo "3. Find all receiving events:"
echo "   curl '$BASE_URL/epcis/events?bizStep=receiving'"
echo ""
echo "4. Find assembly operations:"
echo "   curl '$BASE_URL/epcis/events?bizStep=assembling'"
echo ""
echo "5. Find events at quality lab:"
echo "   curl '$BASE_URL/epcis/events?bizLocation=urn:epc:id:sgln:4012345.00002.0'"
echo ""

