const express = require("express");
const addon = require("./addon");
const seedrApi = require("./seedrApi");

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8000;
const VERBOSE_LOGS = process.env.DEBUG_SEEDR === "1";

function verboseLog(...args) {
    if (VERBOSE_LOGS) {
        console.log(...args);
    }
}

// Handle OPTIONS preflight requests
app.options("*", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.sendStatus(200);
});

// Enable CORS for all routes
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    next();
});

// ============================================
// Configuration Page - Device Code Authorization
// ============================================
app.get("/configure", async (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr Cloud Player - Setup</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            color: #4ade80;
        }
        .subtitle { color: #94a3b8; margin-bottom: 30px; }
        .step { margin: 20px 0; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; }
        .step-number {
            display: inline-block;
            width: 30px;
            height: 30px;
            background: #4ade80;
            color: #1a1a2e;
            border-radius: 50%;
            line-height: 30px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .code-display {
            font-size: 2.5rem;
            font-family: monospace;
            letter-spacing: 8px;
            color: #4ade80;
            background: rgba(0,0,0,0.3);
            padding: 15px 25px;
            border-radius: 8px;
            margin: 15px 0;
            display: inline-block;
        }
        .link { color: #60a5fa; text-decoration: none; font-weight: bold; }
        .link:hover { text-decoration: underline; }
        .status { margin-top: 20px; padding: 15px; border-radius: 8px; }
        .status.waiting { background: rgba(251,191,36,0.2); color: #fbbf24; }
        .status.success { background: rgba(74,222,128,0.2); color: #4ade80; }
        .status.error { background: rgba(248,113,113,0.2); color: #f87171; }
        .btn {
            display: inline-block;
            background: #4ade80;
            color: #1a1a2e;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .hidden { display: none; }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #4ade80;
            animation: spin 1s linear infinite;
            margin-right: 10px;
            vertical-align: middle;
        }
        .url-container {
            display: flex;
            margin: 15px 0;
            gap: 8px;
        }
        .url-input {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 12px;
            font-family: monospace;
        }
        .copy-btn {
            padding: 12px 16px;
            border: none;
            border-radius: 8px;
            background: #60a5fa;
            color: #1a1a2e;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }
        .copy-btn:hover { background: #93c5fd; }
        .copy-btn.copied { background: #4ade80; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Seedr Cloud Player</h1>
        <p class="subtitle">Connect your Seedr account to Stremio</p>
        
        <div id="loading">
            <div class="spinner"></div>
            <span>Getting authorization code...</span>
        </div>
        
        <div id="auth-steps" class="hidden">
            <div class="step">
                <div class="step-number">1</div>
                <p>Visit <a id="verification-link" href="https://v2.seedr.cc/devices" target="_blank" class="link">seedr.cc/devices</a></p>
            </div>
            
            <div class="step">
                <div class="step-number">2</div>
                <p>Enter this code:</p>
                <div id="user-code" class="code-display">--------</div>
            </div>
            
            <div class="step">
                <div class="step-number">3</div>
                <p>Click "Authorize" on Seedr</p>
            </div>
            
            <div id="status" class="status waiting">
                <span class="spinner"></span>
                Waiting for authorization...
            </div>
        </div>
        
        <div id="success" class="hidden">
            <div class="status success">
                ✅ Authorization successful!
            </div>
            <p style="margin-top: 15px; color: #94a3b8;">Copy this URL to install manually:</p>
            <div class="url-container">
                <input type="text" id="manifest-url" readonly class="url-input">
                <button onclick="copyUrl()" class="copy-btn" id="copy-btn">📋 Copy</button>
            </div>
            <a id="install-btn" href="#" class="btn">Install in Stremio</a>
        </div>
        
        <div id="error" class="hidden">
            <div class="status error" id="error-message">
                ❌ An error occurred
            </div>
            <a href="/configure" class="btn">Try Again</a>
        </div>
    </div>
    
    <script>
        const baseUrl = window.location.origin;
        let deviceCode = null;
        let pollInterval = null;
        
        async function startAuth() {
            try {
                // Get device code
                const response = await fetch('/api/device-code');
                const data = await response.json();
                
                if (data.error) {
                    showError(data.error);
                    return;
                }
                
                deviceCode = data.device_code;
                document.getElementById('user-code').textContent = data.user_code;
                
                // Update verification link if provided
                let vUri = data.verification_uri_complete || data.verification_uri;
                if (vUri) {
                    if (vUri.startsWith('/')) {
                        vUri = 'https://v2.seedr.cc' + vUri;
                    }
                    const link = document.getElementById('verification-link');
                    link.href = vUri;
                    link.textContent = 'v2.seedr.cc' + (data.verification_uri_complete ? ' (auto-fill)' : '/devices');
                }
                
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('auth-steps').classList.remove('hidden');
                
                // Start polling
                pollInterval = setInterval(pollForAuth, (data.interval || 5) * 1000);
                
            } catch (error) {
                showError('Failed to start authorization: ' + error.message);
            }
        }
        
        async function pollForAuth() {
            try {
                const response = await fetch('/api/poll-token?device_code=' + encodeURIComponent(deviceCode));
                const data = await response.json();
                
                if (data.access_token) {
                    clearInterval(pollInterval);
                    showSuccess(data.access_token);
                }
            } catch (error) {
                // Continue polling
            }
        }
        
        function showSuccess(token) {
            document.getElementById('auth-steps').classList.add('hidden');
            document.getElementById('success').classList.remove('hidden');
            
            // Create Stremio install URL with token
            const encodedToken = encodeURIComponent(token);
            const manifestUrl = baseUrl + '/' + encodedToken + '/manifest.json';
            const stremioUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
            
            document.getElementById('manifest-url').value = manifestUrl;
            document.getElementById('install-btn').href = stremioUrl;
        }
        
        function copyUrl() {
            const urlInput = document.getElementById('manifest-url');
            urlInput.select();
            document.execCommand('copy');
            
            const copyBtn = document.getElementById('copy-btn');
            copyBtn.textContent = '✅ Copied!';
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.textContent = '📋 Copy';
                copyBtn.classList.remove('copied');
            }, 2000);
        }
        
        function showError(message) {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('auth-steps').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
            document.getElementById('error-message').textContent = '❌ ' + message;
            
            if (pollInterval) clearInterval(pollInterval);
        }
        
        // Start authorization on page load
        startAuth();
    </script>
</body>
</html>
    `);
});

// ============================================
// API Endpoints for Device Authorization
// ============================================
app.get("/api/device-code", async (req, res) => {
    try {
        const data = await seedrApi.getDeviceCode();
        res.json(data);
    } catch (error) {
        console.error("Error getting device code:", error.message);
        res.json({ error: error.message });
    }
});

app.get("/api/poll-token", async (req, res) => {
    try {
        const deviceCode = req.query.device_code;
        if (!deviceCode) {
            return res.json({ error: "Missing device_code" });
        }

        const data = await seedrApi.pollForToken(deviceCode);
        res.json(data || { pending: true });
    } catch (error) {
        console.error("Error polling for token:", error.message);
        res.json({ error: error.message });
    }
});

// ============================================
// Token-based Addon Routes
// ============================================
// Handle configure page with token (redirect to main configure or show reconfigure option)
app.get("/:token/configure", (req, res) => {
    const token = req.params.token;
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr Cloud Player - Configuration</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 { font-size: 2rem; margin-bottom: 10px; color: #4ade80; }
        .subtitle { color: #94a3b8; margin-bottom: 30px; }
        .status { margin: 20px 0; padding: 20px; background: rgba(74,222,128,0.2); border-radius: 12px; }
        .status.success { color: #4ade80; }
        .btn {
            display: inline-block;
            background: #4ade80;
            color: #1a1a2e;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 10px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .btn.secondary {
            background: rgba(255,255,255,0.2);
            color: #fff;
        }
        .info { margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; color: #94a3b8; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Seedr Cloud Player</h1>
        <p class="subtitle">Configuration</p>
        
        <div class="status success">
            ✅ Your addon is already configured and connected to Seedr!
        </div>
        
        <p style="margin: 20px 0; color: #94a3b8;">
            Your Seedr account is linked. You can browse your files in Stremio under "My Seedr Files".
        </p>
        
        <div style="margin: 20px 0;">
            <a id="install-btn" href="#" class="btn">📥 Install Addon in Stremio</a>
        </div>
        
        <p style="margin: 15px 0; color: #94a3b8; font-size: 0.9rem;">Or copy this URL to install manually:</p>
        <div style="display: flex; margin: 15px 0; gap: 8px;">
            <input type="text" id="manifest-url" readonly style="flex: 1; padding: 12px; border: none; border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; font-size: 12px; font-family: monospace;">
            <button onclick="copyUrl()" id="copy-btn" style="padding: 12px 16px; border: none; border-radius: 8px; background: #60a5fa; color: #1a1a2e; font-weight: bold; cursor: pointer;">📋 Copy</button>
        </div>
        
        <div>
            <a href="/configure" class="btn secondary">🔄 Reconfigure with Different Account</a>
        </div>
        
        <div class="info">
            <strong>Tip:</strong> To see your Seedr files in Stremio, go to the Discover tab and select "My Seedr Files" from the catalog.
        </div>
        
        <script>
            const token = "${token}";
            const baseUrl = window.location.origin;
            const manifestUrl = baseUrl + '/' + encodeURIComponent(token) + '/manifest.json';
            const stremioUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
            
            document.getElementById('manifest-url').value = manifestUrl;
            document.getElementById('install-btn').href = stremioUrl;
            
            function copyUrl() {
                const urlInput = document.getElementById('manifest-url');
                urlInput.select();
                document.execCommand('copy');
                
                const copyBtn = document.getElementById('copy-btn');
                copyBtn.textContent = '✅ Copied!';
                copyBtn.style.background = '#4ade80';
                
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.style.background = '#60a5fa';
                }, 2000);
            }
        </script>
    </div>
</body>
</html>
    `);
});

// Handle manifest request with token
app.get("/:token/manifest.json", (req, res) => {
    const manifest = addon.manifest;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");
    res.json(manifest);
});

// Custom router to handle token extraction
app.get("/:token/catalog/:type/:id.json", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    try {
        const { token, type, id } = req.params;

        const result = await addon.catalogHandler({
            type,
            id: id.replace(".json", ""),
            config: { token: decodeURIComponent(token) }
        });

        res.json(result);
    } catch (error) {
        console.error("Catalog error:", error);
        res.json({ metas: [] });
    }
});

app.get("/:token/stream/:type/:id.json", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    try {
        const { token, type, id } = req.params;
        const serverBaseUrl = `${req.protocol}://${req.get('host')}`;

        const result = await addon.streamHandler({
            type,
            id: id.replace(".json", ""),
            config: { token: decodeURIComponent(token) }
        }, serverBaseUrl);

        res.json(result);
    } catch (error) {
        console.error("Stream error:", error);
        res.json({ streams: [] });
    }
});

// ============================================
// Resolve Endpoint - Download torrent and redirect to stream
// ============================================
// Keep track of active processing to prevent race conditions
const processingLocks = new Set();
// Cache for resolved stream URLs to prevent repetitive API calls
const resolveCache = new Map();
const RESOLVE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const VIDEO_EXTENSIONS = new Set([
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v",
    ".mpg", ".mpeg", ".ts", ".m2ts", ".3gp", ".ogv"
]);

function isVideoFile(file) {
    if (!file || !file.name) {
        return false;
    }

    if (file.play_video === true) {
        return true;
    }

    const lowerName = file.name.toLowerCase();
    return [...VIDEO_EXTENSIONS].some(ext => lowerName.endsWith(ext));
}

function findPlayableFile(files = []) {
    return files.find(isVideoFile) || files[0] || null;
}

async function tryResolveCompletedTransfer(accessToken, transfer) {
    if (!transfer) {
        return null;
    }

    if (transfer.completedFolderId) {
        const completedContent = await seedrApi.getFolder(accessToken, transfer.completedFolderId);
        const completedFile = findPlayableFile(completedContent.files || []);
        if (completedFile) {
            return completedFile;
        }
    }

    const taskContents = await seedrApi.getTaskContents(accessToken, transfer.id);
    return findPlayableFile(taskContents.files || []);
}

function isRetryableStreamError(error) {
    const status = error?.response?.status;
    return status === 403 || status === 404;
}

function normalizeNameForMatch(value = "") {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractEpisodeToken(value = "") {
    const normalized = normalizeNameForMatch(value);
    const seasonEpisodeMatch = normalized.match(/\bs(\d{1,2})\s*e(\d{1,2})\b/);
    if (seasonEpisodeMatch) {
        return `s${seasonEpisodeMatch[1].padStart(2, "0")}e${seasonEpisodeMatch[2].padStart(2, "0")}`;
    }

    const altMatch = normalized.match(/\b(\d{1,2})x(\d{1,2})\b/);
    if (altMatch) {
        return `s${altMatch[1].padStart(2, "0")}e${altMatch[2].padStart(2, "0")}`;
    }

    return null;
}

function namesLikelyMatch(candidateName = "", targetName = "") {
    const candidateNormalized = normalizeNameForMatch(candidateName);
    const targetNormalized = normalizeNameForMatch(targetName);
    const targetEpisode = extractEpisodeToken(targetName);
    const candidateEpisode = extractEpisodeToken(candidateName);

    if (targetEpisode) {
        if (candidateEpisode !== targetEpisode) {
            return false;
        }

        const targetWords = targetNormalized.split(" ").filter(Boolean).filter(word => word !== targetEpisode);
        const titleSnippet = targetWords.slice(0, 4).join(" ");
        return !titleSnippet || candidateNormalized.includes(titleSnippet);
    }

    const targetPrefix = targetNormalized.split(" ").slice(0, 6).join(" ");
    return candidateNormalized.includes(targetPrefix) || targetNormalized.includes(candidateNormalized);
}

function findMatchingTransfer(transfers, infoHash, targetName) {
    const normalizedInfoHash = (infoHash || "").toLowerCase();

    let transfer = transfers.find(t =>
        t.torrent?.hash && t.torrent.hash.toLowerCase() === normalizedInfoHash
    );

    if (transfer) {
        return transfer;
    }

    transfer = transfers.find(t =>
        t.name && targetName && namesLikelyMatch(t.name, targetName)
    );

    if (transfer) {
        return transfer;
    }

    return null;
}

async function getPreferredTransfer(accessToken, preferredTaskId, transfers, infoHash, targetName) {
    if (preferredTaskId) {
        try {
            return await seedrApi.refreshTransfer(accessToken, { id: preferredTaskId });
        } catch (error) {
            console.warn(`Failed to refresh preferred task ${preferredTaskId}:`, error.response?.data || error.message);
        }
    }

    const matchedTransfer = findMatchingTransfer(transfers, infoHash, targetName);
    if (!matchedTransfer) {
        return null;
    }

    return seedrApi.refreshTransfer(accessToken, matchedTransfer);
}

app.get("/:token/resolve/:infoHash", async (req, res) => {
    const { token, infoHash } = req.params;
    const { name, trackers, fileIdx, torrentFile } = req.query;
    const accessToken = decodeURIComponent(token);
    
    verboseLog(`\n🔗 Resolve request received for infoHash: ${infoHash}`);
    // Check cache first
    if (resolveCache.has(infoHash)) {
        const cached = resolveCache.get(infoHash);
        if (Date.now() - cached.timestamp < RESOLVE_CACHE_TTL) {
            verboseLog(`⚡ Using cached stream URL for ${infoHash}`);
            return res.redirect(307, cached.url);
        } else {
            resolveCache.delete(infoHash);
        }
    }

    verboseLog("============================================");
    verboseLog("🔄 Resolve request for infoHash:", infoHash);
    verboseLog("   Name:", name);
    verboseLog("   Type:", torrentFile ? "Torrent File" : "Magnet Link");
    verboseLog("============================================");

    // Wait if this infoHash is already being processed (simple busy-wait or just join)
    // Since we can't easily "join" the other request's specific state in this architecture without complex event emitters,
    // we will just wait until the lock is released, then proceed with checks (which should catch the newly added transfer).
    if (processingLocks.has(infoHash)) {
        verboseLog("⏳ Another request is processing this infoHash. Waiting for lock release...");
        let waitTime = 0;
        while (processingLocks.has(infoHash) && waitTime < 30000) { // 30s max wait
            await new Promise(r => setTimeout(r, 1000));
            waitTime += 1000;
        }
        verboseLog("🔓 Lock released (or timed out). Proceeding...");
    }

    try {
        // Poll for completion (5 minute timeout, 3 second intervals)
        const maxAttempts = 100; // 100 * 3s = 5 minutes
        const pollInterval = 3000;
        let attempts = 0;
        let preferredTaskId = null;

        const pollForCompletion = async () => {
            verboseLog("⏳ Waiting for download to complete...");
            let lastProgress = -1;

            while (attempts < maxAttempts) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, pollInterval));

                // Check transfers for progress
                let transfers = await seedrApi.getActiveTransfers(accessToken);
                let transfer = await getPreferredTransfer(accessToken, preferredTaskId, transfers, infoHash, name);

                if (transfer) {
                    preferredTaskId = preferredTaskId || transfer.id;
                    const progress = transfer.progress || 0;
                    if (progress !== lastProgress) {
                        verboseLog(`   Progress: ${progress}% (attempt ${attempts}/${maxAttempts})`);
                        lastProgress = progress;
                    }

                    if (progress >= 100) {
                        // Download complete - wait a moment for file to be moved to folder
                        // If it stays at 100% without disappearing from transfers, it might be processing
                        if (attempts % 5 === 0) verboseLog("   (Stuck at 100%? waiting for file processing...)");

                        const completedFile = await tryResolveCompletedTransfer(accessToken, transfer);
                        if (completedFile) {
                            verboseLog("✅ Download complete via task contents:", completedFile.name);
                            try {
                                const streamData = await seedrApi.getStreamUrl(accessToken, completedFile.id);
                                if (streamData && streamData.url) {
                                    verboseLog("🎬 Redirecting to stream URL");
                                    resolveCache.set(infoHash, {
                                        url: streamData.url,
                                        timestamp: Date.now()
                                    });
                                    return res.redirect(307, streamData.url);
                                }
                            } catch (error) {
                                if (isRetryableStreamError(error)) {
                                    verboseLog("   Stream URL not ready yet, continuing to poll...");
                                } else {
                                    throw error;
                                }
                            }
                        }
                    }
                } else {
                    // If no transfer found, it might be done or failed.
                    // We continue to check videos.
                }

                // Check if file is now in videos
                const videos = await seedrApi.getAllVideoFiles(accessToken);

                // DEBUG: Log first few videos found to see what we are comparing against
                if (attempts === 1 || attempts % 10 === 0) {
                    // console.log("   Current videos in specific folder:", videos.map(v => v.name).slice(0, 3));
                }

                const matchingVideo = videos.find(v => {
                    return namesLikelyMatch(v.name, name || "");
                });

                if (matchingVideo) {
                    verboseLog("✅ Download complete:", matchingVideo.name);
                    try {
                        const streamData = await seedrApi.getStreamUrl(accessToken, matchingVideo.id);
                        if (streamData && streamData.url) {
                            verboseLog("🎬 Redirecting to stream URL");
                            // Cache the successful result
                            resolveCache.set(infoHash, {
                                url: streamData.url,
                                timestamp: Date.now()
                            });
                            return res.redirect(307, streamData.url);
                        }
                    } catch (error) {
                        if (isRetryableStreamError(error)) {
                            verboseLog("   Matching file found, but stream URL is not ready yet...");
                        } else {
                            throw error;
                        }
                    }
                } else if (!transfer && attempts > 5) {
                    // If no active transfer and no video found after a few attempts, 
                    // maybe look for ANY video in the top folder if we just added one?
                    // Or look for the specific folder we added to?
                    // For now, just log that we haven't found it yet.
                    if (attempts % 5 === 0) {
                        verboseLog(`   ❓ No transfer and no matching video found yet for "${name}"`);
                        // DEBUG: Inspect what IS there
                        if (videos.length > 0) {
                            verboseLog(`      Available videos: ${videos.map(v => v.name).join(", ")}`);
                        } else {
                            verboseLog("      No videos found in account.");
                        }
                    }
                }
            }

            // Timeout reached
            console.warn("⏰ Timeout waiting for download");
            return res.status(408).json({
                error: "Download timeout",
                message: "The download is taking longer than expected. Please check Seedr Downloads catalog and try again."
            });
        };

        // Determine if we're using a torrent file or magnet link
        let isTorrentFile = !!torrentFile;
        let magnet = null;
        let torrentData = null;

        if (!isTorrentFile) {
            // Build magnet link from parameters
            magnet = `magnet:?xt=urn:btih:${infoHash}`;
            if (name) {
                magnet += `&dn=${encodeURIComponent(name)}`;
            }
            if (trackers) {
                const trackerList = trackers.split(",");
                for (const tracker of trackerList) {
                    magnet += `&tr=${encodeURIComponent(tracker)}`;
                }
            }
        } else {
            // Torrent file is base64 encoded in the query
            torrentData = decodeURIComponent(torrentFile);
        }

        verboseLog("🔒 Acquiring processing lock...");
        processingLocks.add(infoHash);

        try {
            // Step 1: Check if folder exists for this info_hash (cached downloads)
            verboseLog("📁 Looking for existing folder...");
            let targetFolder = await seedrApi.getFolderByName(accessToken, infoHash);

            if (targetFolder) {
                verboseLog("✅ Using existing folder:", targetFolder.id);

                // Check if torrent is already downloading or completed in this folder
                const folderContent = await seedrApi.getFolder(accessToken, targetFolder.id);

                if (folderContent.folders && folderContent.folders.length > 0) {
                    verboseLog("✅ Torrent already completed in this folder");
                    // Get files from the first subfolder (completed torrent)
                    const completedFolder = folderContent.folders[0];
                    const completedContent = await seedrApi.getFolder(accessToken, completedFolder.id);

                    if (completedContent.files && completedContent.files.length > 0) {
                        // Find a playable video file
                        const videoFile = findPlayableFile(completedContent.files);
                        if (videoFile) {
                            verboseLog("🎬 Found playable file:", videoFile.name);
                            const streamData = await seedrApi.getStreamUrl(accessToken, videoFile.id);
                            if (streamData && streamData.url) {
                                verboseLog("🎬 Redirecting to stream URL");
                                return res.redirect(307, streamData.url);
                            }
                        }
                    }
                } else {
                    const folderTransfers = await seedrApi.getActiveTransfers(accessToken);
                    const relatedTransfer = folderTransfers.find(t =>
                        t.folderId === targetFolder.id ||
                        t.completedFolderId === targetFolder.id ||
                        (findMatchingTransfer([t], infoHash, name))
                    );

                    if (relatedTransfer) {
                        verboseLog("⏳ Torrent already downloading for this folder, waiting for completion...");
                        // Don't add again - skip to polling
                        return pollForCompletion();
                    }
                }
            }

            // Step 1.5: Check if torrent is already in active transfers (prevent duplicate additions)
            verboseLog("🔍 Checking for existing transfers...");
            const activeTransfers = await seedrApi.getActiveTransfers(accessToken);
            const existingTransfer = findMatchingTransfer(activeTransfers, infoHash, name);

            if (existingTransfer) {
                const refreshedTransfer = await seedrApi.refreshTransfer(accessToken, existingTransfer);
                preferredTaskId = refreshedTransfer.id || existingTransfer.id;
                verboseLog("⏳ Torrent already in transfer queue, waiting for completion...");
                verboseLog("   Current progress:", refreshedTransfer.progress || 0, "%");
                // Skip adding - go straight to polling
                attempts = 0; // Reset attempts counter
                return pollForCompletion();
            }

            // Step 1.8: Check if the file is already completed and in the library 
            // (Previous check only looked for folder named infoHash, but Magnet links created folders with torrent name)
            verboseLog("🔍 Checking for existing completed files...");
            const allVideos = await seedrApi.getAllVideoFiles(accessToken);
            const existingVideo = allVideos.find(v => {
                return namesLikelyMatch(v.name, name || "");
            });

            if (existingVideo) {
                verboseLog("✅ Match found in library:", existingVideo.name);
                const streamData = await seedrApi.getStreamUrl(accessToken, existingVideo.id);
                if (streamData && streamData.url) {
                    verboseLog("🎬 Redirecting to stream URL (Cached)");
                    resolveCache.set(infoHash, {
                        url: streamData.url,
                        timestamp: Date.now()
                    });
                    return res.redirect(307, streamData.url);
                }
            }

            // Step 2: Add torrent (magnet link or file) to root
            let addResult;
            let retryCount = 0;
            const maxRetries = 1;
            let hasClearedAccountForSpaceIssue = false;

            while (retryCount <= maxRetries) {
                try {
                    if (isTorrentFile) {
                        verboseLog(`📥 Adding torrent file to Seedr (Attempt ${retryCount + 1})...`);
                        addResult = await seedrApi.addTorrentFile(accessToken, torrentData, name || `torrent-${infoHash}.torrent`);
                    } else {
                        verboseLog(`📥 Adding magnet to Seedr (Attempt ${retryCount + 1})...`);
                        addResult = await seedrApi.addMagnet(accessToken, magnet, 0);
                    }

                    // Check for "soft" failures that are actually successes-with-conditions in API (result: "queue_full...")
                    // But user wants to CLEAR if this happens, so treat as failure needing clear
                    if (addResult.result === "queue_full_added_to_wishlist" || addResult.result === "not_enough_space_added_to_wishlist") {
                        throw new Error(`Space/Queue full (code: ${addResult.result})`);
                    }

                    // If we get here and result is true/success, we are done
                    if (addResult.result === true || addResult.result === "success") {
                        preferredTaskId = addResult.user_torrent_id || preferredTaskId;
                        verboseLog("✅ Torrent added to active downloads");
                        break;
                    } else {
                        preferredTaskId = addResult.user_torrent_id || preferredTaskId;
                        // Unknown success code, but assume success
                        verboseLog("✅ Torrent added successfully (code: " + addResult.result + ")");
                        break;
                    }

                } catch (error) {
                    console.error(`❌ Attempt ${retryCount + 1} failed:`, error.message);

                    const reasonPhrase = error.reason_phrase || "";
                    const isSpaceIssue = error.message.includes("not_enough_space") ||
                        error.message.includes("storage_full") ||
                        reasonPhrase.includes("not_enough_space") ||
                        reasonPhrase.includes("queue_full") ||
                        reasonPhrase.includes("storage_full");

                    if (retryCount < maxRetries && isSpaceIssue && !hasClearedAccountForSpaceIssue) {
                        console.warn("⚠️  Seedr space/queue limit reached. Clearing Seedr content and retrying...");

                        // If it was added to wishlist during the failed attempt (soft fail), delete it first to be clean
                        const wishlistId = addResult?.wt?.id || error.wt?.id;
                        if (wishlistId) {
                            try {
                                await seedrApi.deleteFromWishlist(accessToken, wishlistId);
                            } catch (wishlistError) {
                                console.warn("⚠️  Failed to delete wishlist item before retry:", wishlistError.response?.data || wishlistError.message);
                            }
                        }

                        const clearResult = await seedrApi.clearAccount(accessToken);
                        if (!clearResult.result) {
                            console.error("❌ Failed to clear Seedr content:", clearResult.error);
                            // If clear fails, we probably can't add anyway, but let loop continue to fail naturally or try
                        }
                        hasClearedAccountForSpaceIssue = true;
                        retryCount++;
                        // Continue to next iteration (retry)
                    } else {
                        const statusCode = isSpaceIssue ? 507 : 500;
                        const message = isSpaceIssue
                            ? "Seedr reported a space or queue limit. Attempted to clear account but the add still could not proceed."
                            : error.message;

                        return res.status(statusCode).json({
                            error: isSpaceIssue ? "Storage full" : "Failed to add torrent",
                            message
                        });
                    }
                }
            }
        } finally {
            verboseLog("🔓 Releasing processing lock...");
            processingLocks.delete(infoHash);
        }

        // Start polling
        await pollForCompletion();

    } catch (error) {
        console.error("❌ Resolve error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Root redirect to configure
// ============================================
app.get("/", (req, res) => {
    res.redirect("/configure");
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log("============================================");
    console.log("🎬 Seedr Cloud Player for Stremio");
    console.log("============================================");
    console.log("");
    console.log("📍 Server running at: http://127.0.0.1:" + PORT);
    console.log("");
    console.log("🔧 To connect your Seedr account:");
    console.log("   1. Open: http://127.0.0.1:" + PORT + "/configure");
    console.log("   2. Follow the on-screen instructions");
    console.log("   3. Click 'Install in Stremio' when done");
    console.log("");
    console.log("Press Ctrl+C to stop the server");
    console.log("============================================");
});

// Export for Vercel serverless deployment
module.exports = app;
