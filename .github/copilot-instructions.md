# Copilot Instructions for Seedr Cloud Player

## Project Overview

This is a **Stremio addon** that integrates with **Seedr** cloud storage for torrent downloading and streaming. Users can browse their Seedr files and stream movies via Torrentio integration.

## Architecture

```
server.js      → Express HTTP server, routing, OAuth device flow UI
addon.js       → Stremio addon handlers (catalog, stream), caching logic
seedrApi.js    → Seedr API client (auth, files, folders, streaming, magnets)
torrentioApi.js → Torrentio API client (stream discovery, magnet building)
```

### Request Flow
1. **Catalog requests** (`/:token/catalog/:type/:id.json`) → `catalogHandler` → `seedrApi.getAllVideoFiles()`
2. **Stream requests** (`/:token/stream/:type/:id.json`) → `streamHandler` → returns Seedr direct links or Torrentio download options
3. **Resolve requests** (`/:token/resolve/:infoHash`) → builds magnet → `seedrApi.addMagnet()` → queues download in Seedr

### Authentication
- Uses OAuth **device code flow** via `/configure` page
- Token is embedded in URL path: `/{accessToken}/manifest.json`
- Token extracted from `args.config.token` in handlers

## Key Patterns

### API Client Pattern
All external API calls use `axios` with consistent error handling:
```javascript
async function apiMethod(accessToken, ...params) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "action_name");
    // ... params
    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData);
    return response.data;
}
```

### Stremio Addon Handlers
Handlers return objects with `metas` (catalog) or `streams` (stream):
```javascript
async function catalogHandler(args) {
    // args.config.token, args.type, args.id
    return { metas: [...] };
}
async function streamHandler(args, serverBaseUrl) {
    return { streams: [...] };
}
```

### Caching
Video files are cached per-token with 5-minute TTL using `Map`:
```javascript
const videoCache = new Map();  // key: accessToken, value: { videos, timestamp }
```

## Development

### Running Locally
```bash
npm start          # Runs on http://127.0.0.1:7000
```
- Configure page: `http://127.0.0.1:7000/configure`
- Requires Seedr account for testing

### Dependencies
- `stremio-addon-sdk` - Stremio manifest/protocol (not directly used for routing)
- `axios` - HTTP client
- `express` - HTTP server

### Environment
- `PORT` - Server port (default: 7000)

## Conventions

- **IDs**: Seedr files use `seedr:{fileId}`, movies use IMDB IDs (`tt1234567`)
- **File extensions**: Stripped from display names via `.replace(/\.[^/.]+$/, "")`
- **Size formatting**: Use `formatFileSize(bytes)` helper in addon.js
- **Stream titles**: Use emoji prefixes (✅ Ready, ⬇️ Download, 🎬 Play)

## Important Notes

- Seedr API uses `oauth_test/resource.php` endpoint with form-encoded POST requests
- Torrentio streams include `infoHash`, `trackers`, `fileIdx` for magnet construction
- The `/resolve/:infoHash` endpoint only queues downloads—streaming happens after Seedr processes the torrent
