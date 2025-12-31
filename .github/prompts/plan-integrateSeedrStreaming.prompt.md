## Plan: Integrate Seedr Streaming into Stremio Addon

This plan adds Seedr cloud storage integration to your Stremio extension, allowing you to browse and stream videos from your Seedr account using device code authorization (1-year token) and direct streaming URLs.

### Steps

1. **Add HTTP dependencies** in [package.json](package.json) - add `axios` for API calls and `express` for the configuration page routing

2. **Create device code authorization flow** in [server.js](server.js) - add `/configure` HTML endpoint that requests device code from `/api/device/code?client_id=seedr_xbmc`, shows user code, polls `/api/device/authorize`, then redirects to Stremio with token-embedded URL

3. **Update manifest for configuration** in [addon.js](addon.js) - change `id` to something like `org.seedr.stremio`, add `behaviorHints: { configurable: true, configurationRequired: true }`, add new catalog `{ type: "other", id: "seedr-files", name: "My Seedr Files" }`

4. **Implement Seedr catalog handler** in [addon.js](addon.js) - extract token from request path, call `GET /api/folder?access_token={token}` to list files/folders, filter items where `play_video: true`, return as Stremio meta objects with `seedr:{folder_file_id}` as ID

5. **Implement Seedr stream handler** in [addon.js](addon.js) - for `seedr:` prefixed IDs, call `POST /oauth_test/resource.php` with `func=fetch_file` and `folder_file_id`, return the signed streaming URL to Stremio's default player

6. **Configure token-based routing** in [server.js](server.js) - modify server to handle `/:token/manifest.json`, `/:token/catalog/...`, and `/:token/stream/...` routes, passing token to handlers

### Further Considerations

1. **Folder navigation depth?** Should the catalog show only root folder videos, or recursively scan all subfolders? (Recursive = slower but complete / Root only = fast but limited) 
User answer : Do recursive scan all subfolders.

2. **Content type handling?** Do you want all videos as `type: "other"` or should the addon attempt to detect movies vs series based on filename patterns? 
User answer : All videos as type "other".

3. **Do you want torrent upload support?** The Seedr API supports adding magnet links - we could add this feature later to upload torrents directly from Stremio (requires additional planning)
User answer : Not at this time.
