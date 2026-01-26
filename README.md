# Rei JSON Base Storage

<div align="center">

<img src="./docs/images/rei.png" alt="Rei Logo" width="120" />

**JSON storage service built on Cloudflare Workers**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![D1 Database](https://img.shields.io/badge/Cloudflare-D1-blueviolet?style=flat-square&logo=cloudflare)](https://developers.cloudflare.com/d1/)

[English](./README.md) | [中文](./README.zh.md) | [Quick Start](#quick-start)

No server management, deploy and use immediately.

</div>

## Screenshot Preview

<div align="center">

| Login | Dashboard | Data Management |
|-------|-----------|-----------------|
| ![Login](./docs/images/console-login.png) | ![Dashboard](./docs/images/console-dashboard.png) | ![Data](./docs/images/console-data.png) |

</div>

## Quick Start

### Automated Deployment

```bash
git clone https://github.com/PBK-B/cloudflare-worker-json-base.git
cd cloudflare-worker-json-base
npm install
npm run auto-deploy
```

### Manual Deployment

```bash
npm install -g wrangler
wrangler login
npx wrangler d1 create jsonbase
# edit d1_databases.database_id and vars.API_KEY
vim wrangler.toml
npm run deploy
```

## Usage

### Authentication

```bash
# Header auth (recommended)
Authorization: Bearer YOUR_API_KEY

# URL param auth
?key=YOUR_API_KEY
```

### Store Data

```bash
curl -X POST https://your-worker.workers.dev/myapp/config \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"theme": "dark"}'
```

Response: `{"status": 1, "message": "storage ok"}`

### Get Data

```bash
curl -X GET https://your-worker.workers.dev/myapp/config \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Upload Files

```bash
curl -X PUT https://your-worker.workers.dev/myapp/logo.svg \
  -H "Authorization: Bearer YOUR_API_KEY" \
  --data-binary @/path/to/file.svg
```

### Delete Data

```bash
curl -X DELETE https://your-worker.workers.dev/myapp/config \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/{bucket}/{key}` | Create/update data |
| GET | `/{bucket}/{key}` | Get data |
| PUT | `/{bucket}/{file}` | Upload file |
| DELETE | `/{bucket}/{key}` | Delete data |

## WebUI Console

Visit `https://your-worker.workers.dev/` for web management.

## Configuration

Configure in `wrangler.toml`:

```toml
name = "your-worker"
main = "dist/index.js"
compatibility_date = "2024-05-02"

[vars]
ENVIRONMENT = "production"
STORAGE_BACKEND = "d1"

[[d1_databases]]
binding = "JSONBASE_DB"
database_name = "jsonbase"
database_id = "xxx"
```

## FAQ

**Lost API Key?**
Redeploy with new API_KEY env var to get a new one.

**Data persistence?**
Data stored in D1, won't be lost.

**Custom domain?**
Yes, bind in Cloudflare dashboard.

## Contributors

<a href="https://github.com/PBK-B/cloudflare-worker-json-base/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=PBK-B/cloudflare-worker-json-base" />
</a>

## Acknowledgments

- [jsonbase.com](https://web.archive.org/web/20221007050426/https://jsonbase.com/) - Original inspiration
- [theowenyoung/blog](https://github.com/theowenyoung/blog) - Original implementation reference
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge computing platform

## Links

- [Developer Guide](./CONTRIBUTING.md)
- [Report Issues](https://github.com/PBK-B/cloudflare-worker-json-base/issues)

---

<div align="center">

**Star History**

[![Star History Chart](https://api.star-history.com/svg?repos=PBK-B/cloudflare-worker-json-base&type=Date)](https://star-history.com/#PBK-B/cloudflare-worker-json-base&Date)

Found it useful? Give us a ⭐ Star!

</div>
