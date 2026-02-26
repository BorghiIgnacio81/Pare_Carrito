# Deploy en VPS (Ubuntu + Nginx) — Pare Carrito (Node/Express)

Objetivo: levantar esta app Node/Express **sin interferir** con tu app Django existente.

En este repo la app Node:
- sirve el frontend estático en `/`
- expone API en `/api/*`
- lee variables: `PORT`, `SPREADSHEET_ID`, `SHEET_NAME`, credenciales Google (ahora soporta `GOOGLE_KEY_JSON`/`GOOGLE_KEY_BASE64`) y Postgres opcional (`DATABASE_URL`, `PGSSLMODE=require`).

## 0) Suposiciones
- Ubuntu con Nginx ya funcionando para Django.
- Tenés un dominio o subdominio disponible (recomendado: subdominio dedicado, ej `pedidos.tudominio.com`).

## 1) Elegí un puerto interno
Usá un puerto distinto al de Django (ejemplo `3001`). Nginx va a proxyear a `127.0.0.1:3001`.

## 2) Preparar directorio en el VPS
Ejemplo (ajustá usuario/paths a tu estilo):

```bash
sudo mkdir -p /var/www/parecarrito
sudo chown -R $USER:$USER /var/www/parecarrito
```

Subí el proyecto (git clone o scp). Si usás git:

```bash
cd /var/www/parecarrito
git clone <TU_REPO_GIT> .
```

## 3) Instalar Node.js (recomendado Node 20 LTS)
Si ya tenés Node, chequeá versión:

```bash
node -v
npm -v
```

Si no, una opción típica es instalar Node 20 LTS desde NodeSource.

## 4) Instalar dependencias

```bash
cd /var/www/parecarrito
npm ci --omit=dev || npm install --omit=dev
```

## 5) Crear archivo de entorno **separado** (no toca Django)
Creá `/etc/parecarrito.env`:

```bash
sudo nano /etc/parecarrito.env
```

Contenido mínimo (ejemplo):

```env
PORT=3001
SPREADSHEET_ID=...
SHEET_NAME=Pedidos

# Credenciales Google (preferido en VPS)
GOOGLE_KEY_JSON={...}

# Opcional Postgres (si querés)
# DATABASE_URL=postgres://user:pass@localhost:5432/parecarrito
# PGSSLMODE=require
```

Asegurá permisos:

```bash
sudo chown root:root /etc/parecarrito.env
sudo chmod 600 /etc/parecarrito.env
```

Notas:
- Si tu sistema de env se complica con JSON multilínea, usá `GOOGLE_KEY_BASE64`.
- Esta app funciona sin `DATABASE_URL`.

## 6) Crear servicio systemd (auto-restart)
Creá `/etc/systemd/system/parecarrito.service`:

```bash
sudo nano /etc/systemd/system/parecarrito.service
```

Pegá:

```ini
[Unit]
Description=Pare Carrito (Node/Express)
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/parecarrito
EnvironmentFile=/etc/parecarrito.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

# Seguridad básica
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Ajustes recomendados:
- Si preferís no usar `www-data`, creá un usuario dedicado `parecarrito`.
- Si `npm` no está en `/usr/bin/npm`, cambiá `ExecStart` (ver con `which npm`).

Dale permisos al directorio para que el usuario del servicio pueda leerlo:

```bash
sudo chown -R www-data:www-data /var/www/parecarrito
```

Activá y levantá:

```bash
sudo systemctl daemon-reload
sudo systemctl enable parecarrito
sudo systemctl start parecarrito
sudo systemctl status parecarrito --no-pager
```

Logs:

```bash
sudo journalctl -u parecarrito -f
```

Test local en el VPS:

```bash
curl -s http://127.0.0.1:3001/api/health | jq
```

## 7) Nginx: server block para subdominio
Creá un site, ejemplo `/etc/nginx/sites-available/pedidos`:

```bash
sudo nano /etc/nginx/sites-available/pedidos
```

Contenido (HTTP):

```nginx
server {
    listen 80;
    server_name pedidos.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Si más adelante usás websockets
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Habilitar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/pedidos /etc/nginx/sites-enabled/pedidos
sudo nginx -t
sudo systemctl reload nginx
```

## 8) HTTPS (Certbot)
Si ya usás certbot para Django, repetís para el subdominio:

```bash
sudo certbot --nginx -d pedidos.tudominio.com
```

## 9) Convivencia con Django (lo importante)
- **No reutilices** el `.env`/variables del proyecto Django.
- Mantener puertos distintos (Django en su puerto actual; Pare Carrito en `3001`).
- Cada app con su `systemd service` y su `EnvironmentFile`.
- Si usás Postgres en ambas: base y usuario **separados**.

## 10) Checklist de problemas típicos
- 502 en Nginx: el servicio no está corriendo o el puerto no coincide.
- Error Google auth: falta `GOOGLE_KEY_JSON/BASE64` o el service account no tiene acceso al Sheet.
- CORS: la app ya usa `cors({ origin: "*" })`.

