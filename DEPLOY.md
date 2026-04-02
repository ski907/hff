# Deployment Guide — hff-svelte

This is the FastAPI + SvelteKit rewrite (`svelte-rewrite` branch).
The legacy Streamlit version lives at `/opt/heatflux/` on the droplet and runs on port 8501.

> **Note:** Always build the frontend locally on Windows and upload the result.
> The droplet doesn't have enough RAM to run the Vite build — Node.js is not needed on the server.

---

## Local development

**Terminal 1 — backend:**
```powershell
conda activate hff
cd backend
uvicorn app:app --reload --port 8000
```

**Terminal 2 — frontend:**
```powershell
cd frontend
npm run dev
```
Open `http://localhost:5173`

---

## Local production build (PowerShell)

To test the full production build locally before deploying:

```powershell
cd frontend
npm install
npm run build
cd ..

Remove-Item -Recurse -Force backend\static -ErrorAction SilentlyContinue
Copy-Item -Recurse frontend\build backend\static

cd backend
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```
Open `http://localhost:8000`

---

## DigitalOcean droplet — first-time setup

Node.js is NOT needed on the server. Only Python is required.

SSH into the droplet, then:

```bash
# Install Python + pip
sudo apt-get install -y python3-pip python3-venv

# Clone the svelte-rewrite branch
git clone -b svelte-rewrite <your-repo-url> /opt/hff-svelte

# Install Python deps into a venv
cd /opt/hff-svelte/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Then from your local Windows machine, upload the built frontend:**
```powershell
# Build locally first
cd frontend
npm run build
cd ..

# Upload to server
scp -r frontend/build root@<your-ip>:/opt/hff-svelte/backend/static
```

### systemd service

```bash
sudo nano /etc/systemd/system/hff-svelte.service
```

```ini
[Unit]
Description=Heat Flux Forecast (SvelteKit)
After=network.target

[Service]
WorkingDirectory=/opt/hff-svelte/backend
ExecStart=/opt/hff-svelte/backend/venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hff-svelte
sudo systemctl start hff-svelte
sudo systemctl status hff-svelte   # verify it's running
```

### DigitalOcean firewall

Dashboard → your droplet → **Networking** → **Firewall** → add inbound rule:
- Type: Custom TCP
- Port: 8000
- Sources: All IPv4

---

## Both versions side by side

| Version | Path | Port | URL |
|---|---|---|---|
| Legacy Streamlit | `/opt/heatflux/` | 8501 | `http://<ip>:8501` |
| SvelteKit rewrite | `/opt/hff-svelte/` | 8000 | `http://<ip>:8000` |

---

## Deploying updates

```powershell
# 1. Build frontend locally
cd frontend
npm run build
cd ..

# 2. Upload built frontend to server
scp -r frontend/build root@<your-ip>:/opt/hff-svelte/backend/static

# 3. If backend code changed, pull and restart
ssh root@<your-ip> "cd /opt/hff-svelte && git pull && systemctl restart hff-svelte"

# 4. If only the frontend changed, just restart
ssh root@<your-ip> "systemctl restart hff-svelte"
```
