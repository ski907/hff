#!/bin/bash
# deploy.sh — Build frontend + start FastAPI server
# Run from the repo root: bash deploy.sh
set -e

echo "==> Building SvelteKit frontend..."
cd frontend
npm install
npm run build
cd ..

echo "==> Copying build to backend/static..."
rm -rf backend/static
cp -r frontend/build backend/static

echo "==> Installing Python dependencies..."
cd backend
pip install -r requirements.txt

echo "==> Starting server on http://localhost:8000"
uvicorn app:app --host 0.0.0.0 --port 8000
