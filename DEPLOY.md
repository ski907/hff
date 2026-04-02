# Deployment Guide — hff-svelte

This is the FastAPI + SvelteKit rewrite (`svelte-rewrite` branch).
The legacy Streamlit version lives at `/opt/heatflux/` on the droplet and runs on port 8501.

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

SSH into the droplet, then:

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python + pip
sudo apt-get install -y python3-pip python3-venv

# Clone the svelte-rewrite branch
git clone -b svelte-rewrite <your-repo-url> /opt/hff-svelte
cd /opt/hff-svelte

# Build frontend
cd frontend
npm install
npm run build
cd ..
cp -r frontend/build backend/static

# Install Python deps into a venv
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
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

## Updating hff-svelte

```bash
cd /opt/hff-svelte
git pull

cd frontend && npm run build && cd ..
cp -r frontend/build backend/static

sudo systemctl restart hff-svelte
```
