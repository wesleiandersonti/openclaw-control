# 🚀 OpenClaw Control - Production Deployment Guide

Enterprise SaaS deployment using Docker, PostgreSQL, and Cloudflare Tunnel (Zero Trust).

## 📋 Prerequisites

- Docker & Docker Compose v2+
- Cloudflare account (free tier works)
- Domain managed by Cloudflare
- Server/VPS (Ubuntu 22.04 LTS recommended) or Proxmox VM
- Minimum specs: 2 CPU, 4GB RAM, 20GB SSD

## 🏗️ Architecture Overview

```
Internet → Cloudflare Tunnel → Nginx → OpenClaw App → PostgreSQL/Redis
                                    ↓
                              NO OPEN PORTS
```

**Security Features:**
- ✅ Zero open ports (Cloudflare Tunnel)
- ✅ PostgreSQL with SSL
- ✅ Redis with authentication
- ✅ Nginx reverse proxy with rate limiting
- ✅ Automatic HTTPS via Cloudflare
- ✅ DDoS protection via Cloudflare

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/wesleiandersonti/openclaw-control.git
cd openclaw-control
```

### 2. Environment Configuration

Copy and edit environment file:

```bash
cp .env.example .env.prod
nano .env.prod
```

**Required variables:**

```env
# Database
POSTGRES_USER=openclaw
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=openclaw

# JWT Secrets (generate with: openssl rand -base64 64)
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

# Encryption Key (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
KEY_ENC_MASTER_B64=your_encryption_key

# Redis
REDIS_PASSWORD=your_redis_password

# Cloudflare Tunnel Token (see setup below)
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token
```

### 3. Setup Cloudflare Tunnel

#### Install cloudflared on your server:

```bash
# Download and install
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Or use Docker (recommended for this setup)
```

#### Create tunnel:

```bash
# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create openclaw-prod

# Get tunnel token (save this!)
cloudflared tunnel token openclaw-prod
```

#### Configure DNS:

```bash
# Route your domain to the tunnel
cloudflared tunnel route dns openclaw-prod app.yourdomain.com
```

#### Add token to .env.prod:

```bash
CLOUDFLARE_TUNNEL_TOKEN=$(cloudflared tunnel token openclaw-prod)
echo "CLOUDFLARE_TUNNEL_TOKEN=$CLOUDFLARE_TUNNEL_TOKEN" >> .env.prod
```

### 4. Deploy

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f app

# Verify all services
docker-compose -f docker-compose.prod.yml ps
```

### 5. First Setup

Access your application at `https://app.yourdomain.com`

Register the first organization:

```bash
# Or use the web interface
curl -X POST https://app.yourdomain.com/api/auth/register-org \
  -H "Content-Type: application/json" \
  -d '{
    "orgName": "My Company",
    "email": "admin@company.com",
    "password": "secure_password",
    "firstName": "Admin"
  }'
```

## 🔧 Proxmox Deployment

### Create LXC Container:

```bash
# Download Ubuntu 22.04 template
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst

# Create container
pct create 100 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname openclaw-prod \
  --memory 4096 \
  --cores 2 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp

# Start container
pct start 100
pct enter 100
```

### Install Docker in LXC:

```bash
# Update and install dependencies
apt update && apt upgrade -y
apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker repo
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
usermod -aG docker $USER
```

### Deploy OpenClaw:

```bash
# Follow Quick Start steps above
git clone https://github.com/wesleiandersonti/openclaw-control.git
cd openclaw-control
# ... configure and deploy
```

## 📊 Monitoring

### View Logs:

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f postgres
```

### Health Checks:

```bash
# Application health
curl https://app.yourdomain.com/api/health

# Database connectivity
docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U openclaw
```

### Resource Usage:

```bash
docker stats
```

## 🔒 Security Checklist

- [ ] Changed all default passwords
- [ ] Generated strong JWT secrets
- [ ] Generated encryption key for API keys
- [ ] Enabled Cloudflare "Always Use HTTPS"
- [ ] Set Cloudflare Security Level to "High"
- [ ] Enabled Cloudflare Bot Fight Mode
- [ ] Set up Cloudflare Access (Zero Trust) for admin endpoints
- [ ] Regular backups configured
- [ ] Firewall enabled (only SSH port open if needed)

## 💾 Backup Strategy

### Automated Backups:

```bash
# Create backup script
cat > /opt/backup-openclaw.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/backup/openclaw
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker-compose -f /opt/openclaw-control/docker-compose.prod.yml exec -T postgres pg_dump -U openclaw openclaw > $BACKUP_DIR/db_$DATE.sql

# Backup environment
cp /opt/openclaw-control/.env.prod $BACKUP_DIR/env_$DATE

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete
EOF

chmod +x /opt/backup-openclaw.sh

# Add to crontab (daily at 2 AM)
0 2 * * * /opt/backup-openclaw.sh
```

## 🔄 Updates

### Update Application:

```bash
cd /opt/openclaw-control

# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

## 🆘 Troubleshooting

### Container won't start:

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs app

# Check environment variables
docker-compose -f docker-compose.prod.yml config
```

### Database connection issues:

```bash
# Check if postgres is running
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# Verify DATABASE_URL format
echo $DATABASE_URL
```

### Cloudflare Tunnel issues:

```bash
# Check tunnel status
docker-compose -f docker-compose.prod.yml logs cloudflared

# Verify token is correct
cloudflared tunnel list
```

## 📞 Support

- GitHub Issues: https://github.com/wesleiandersonti/openclaw-control/issues
- Documentation: https://github.com/wesleiandersonti/openclaw-control/wiki

---

**⚠️ IMPORTANT:** Never commit `.env.prod` or any file containing secrets to git!

**🔐 Security Note:** This setup uses Cloudflare Tunnel which means ZERO ports need to be opened on your firewall. The only inbound connection is through Cloudflare's secure tunnel.
