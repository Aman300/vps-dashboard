# ⚡ VPS Management Dashboard (Next.js + PM2)

A clean, dark, high-performance web dashboard to manage your Node.js projects, Git deployments, and PM2 processes on a Linux VPS.

---

## 🚀 Features

- **Project Operations**:
  - `[ Git Pull ]`: Runs `git pull origin <branch>` inside the configured project directory.
  - `[ Build ]`: Runs `npm install && <buildCommand>` (e.g. `npm run build`).
  - `[ Restart ]`: Runs `pm2 restart <pm2Name>`.
  - `[ Logs ]`: Shows real-time PM2 logs in an interactive terminal popup with 50/100/200/500 lines selector & live refresh.
- **Server Health Monitor**:
  - 🖥️ **CPU Usage**: Real-time load average & core usage.
  - 🧠 **RAM**: Memory used, total, and available.
  - 💾 **Disk**: Root partition mount usage (`df -h /`).
  - ⚙️ **PM2 Status**: Online, Stopped, and Errored processes with live status dots (🟢/🟡/🔴).
- **Security First**:
  - **Zero arbitrary commands**: The backend strictly validates actions against a whitelist (`pull`, `build`, `restart`, `logs`, `status`).
  - No client-supplied shell commands are executed. All paths, branches, and PM2 names are loaded from server-side `projects.json`.
- **No Database / No Docker**:
  - Powered by a simple `projects.json` file.

---

## 📁 Project Configuration (`projects.json`)

Configure your Node.js apps inside `projects.json`:

```json
[
  {
    "id": "plyzoo",
    "name": "plyzoo",
    "path": "/home/plyzoo.com",
    "branch": "main",
    "pm2Name": "plyzoo",
    "buildCommand": "npm run build"
  }
]
```

You can edit `projects.json` directly with `nano` on your server, or use the **"+ Configure Projects"** modal directly from the dashboard UI!

---

## 🛠️ Complete Linux VPS Installation Guide

### Step 1: Upload or Clone to your VPS

Place this dashboard into `/home/vps-dashboard` on your VPS:

```bash
cd /home
# If transferring via git or scp/rsync:
# git clone <your-repo-url> vps-dashboard
cd /home/vps-dashboard
```

### Step 2: Install Dependencies & Build

```bash
cd /home/vps-dashboard
npm install
npm run build
```

---

### Step 3: Run with PM2

The project includes an `ecosystem.config.js` file pre-configured for production on port `3000`.

Start the dashboard process:
```bash
cd /home/vps-dashboard
pm2 start ecosystem.config.js
```

Save the PM2 process list and configure it to start on server boot:
```bash
pm2 save
pm2 startup
```
*(Copy and run any `sudo env PATH=...` command that `pm2 startup` outputs if prompted).*

Verify that the dashboard is running:
```bash
pm2 status
```
You will see `vps-dashboard` with status `online`.

---

### Step 4: Configure Nginx Reverse Proxy

Create an Nginx configuration file for the dashboard:

```bash
sudo nano /etc/nginx/sites-available/vps-dashboard
```

Paste the following configuration (replace `dashboard.yourdomain.com` with your subdomain or your VPS server IP):

```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com; # Or your server IP

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Generous timeouts for long-running builds (npm install & npm run build)
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
```

Enable the site configuration and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/vps-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 5: (Recommended) Enable Free SSL Certificate (HTTPS)

Run Certbot to secure your dashboard domain with Let's Encrypt:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d dashboard.yourdomain.com
```

Certbot will automatically update your Nginx config and redirect all HTTP traffic to HTTPS.

---

### Step 6: (Recommended) Add Password Protection (HTTP Basic Auth)

To protect your dashboard so unauthorized visitors cannot trigger builds or view logs:

```bash
# Install apache2-utils for htpasswd tool
sudo apt install apache2-utils -y

# Create a password file and username (e.g. admin)
sudo htpasswd -c /etc/nginx/.htpasswd admin
# Enter your desired password when prompted
```

Add these 2 lines inside the `location /` block in `/etc/nginx/sites-available/vps-dashboard`:

```nginx
auth_basic "Restricted VPS Control Panel";
auth_basic_user_file /etc/nginx/.htpasswd;
```

Then reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

Now, your browser will prompt for the username and password before loading the dashboard!

---

## 🔄 Daily Usage & Operations

- **Pull latest Git changes**: Click `[ Git Pull ]`
- **Reinstall packages and build**: Click `[ Build ]`
- **Restart application in PM2**: Click `[ Restart ]`
- **Inspect live logs**: Click `[ Logs ]`
# vps-dashboard
