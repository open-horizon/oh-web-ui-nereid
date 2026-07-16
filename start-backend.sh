#!/bin/bash
pkill -f "node server/index.cjs" 2>/dev/null
sleep 1
cd /home/jieke/.qwenpaw/workspaces/coding/NereidOpenHorizon
DATABASE_URL=postgres://nereid:nereidpass@localhost:5432/nereid nohup node server/index.cjs > /tmp/backend.log 2>&1 &
disown
sleep 2
curl -s http://localhost:3001/api/health
