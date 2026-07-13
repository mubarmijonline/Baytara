#!/usr/bin/env bash
# One-shot deploy from the main checkout: pull -> deps -> DB migrate -> restart API -> rebuild SPAs.
# Migrations run automatically here (flask db upgrade) so schema is always applied before restart.
set -euo pipefail
ROOT=/development/projects/baytara

echo "==> pull"
git -C "$ROOT" pull --ff-only origin main

echo "==> backend deps + migrations"
cd "$ROOT/backend"
.venv/bin/pip install -q -r requirements.txt
# DATABASE_URL comes from backend/.env (load_dotenv); upgrade is idempotent
FLASK_APP=wsgi.py .venv/bin/flask db upgrade

echo "==> restart API"
sudo systemctl restart baytara-backend

echo "==> build + publish main site"
cd "$ROOT/frontend/web"
npm install --no-audit --no-fund --silent
npm run build
sudo rsync -a --delete dist/ /var/www/baytara/
sudo chown -R www-data:www-data /var/www/baytara

echo "==> build + publish admin portal"
cd "$ROOT/frontend/admin"
npm install --no-audit --no-fund --silent
npm run build
sudo rsync -a --delete dist/ /var/www/baytara-admin/
sudo chown -R www-data:www-data /var/www/baytara-admin

echo "==> build + publish instructor portal"
cd "$ROOT/frontend/instructor"
npm install --no-audit --no-fund --silent
npm run build
sudo rsync -a --delete dist/ /var/www/baytara-instructor/
sudo chown -R www-data:www-data /var/www/baytara-instructor

echo "==> deploy done: $(date)"
