const seedrApi = require("./seedrApi");

// ============================================
// Manifest Definition
// ============================================
const manifest = {
    id: "org.seedr.stremio",
    version: "1.0.0",
    name: "Seedr Cloud Player",
    description: "Stream videos from your Seedr cloud storage account",
    resources: ["catalog", "stream"],
    types: ["other"],
    catalogs: [
        {
            type: "other",
            id: "seedr-files",
            name: "My Seedr Files"
        }
    ],
    idPrefixes: ["seedr:"],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

// Cache for video files (to avoid repeated API calls)
const videoCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get videos with caching
 */
async function getCachedVideos(accessToken) {
    const cached = videoCache.get(accessToken);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.videos;
    }

    const videos = await seedrApi.getAllVideoFiles(accessToken);
    videoCache.set(accessToken, {
        videos,
        timestamp: Date.now()
    });

    return videos;
}

// ============================================
// Catalog Handler - List Seedr Videos
// ============================================
async function catalogHandler(args) {
    console.log("Catalog request:", args);

    // Extract token from config
    const accessToken = args.config?.token;

    if (!accessToken) {
        console.log("No access token provided");
        return { metas: [] };
    }

    if (args.type === "other" && args.id === "seedr-files") {
        try {
            const videos = await getCachedVideos(accessToken);

            const metas = videos.map(video => ({
                id: `seedr:${video.id}`,
                type: "other",
                name: video.name.replace(/\.[^/.]+$/, ""), // Remove file extension
                poster: "https://www.seedr.cc/favicon.ico", // Seedr icon as placeholder
                description: `📁 ${video.path}\n📦 Size: ${formatFileSize(video.size)}`,
                releaseInfo: "Seedr Cloud"
            }));

            console.log("Returning", metas.length, "videos from Seedr");
            return { metas };
        } catch (error) {
            console.error("Error fetching Seedr catalog:", error.message);
            return { metas: [] };
        }
    }

    return { metas: [] };
}

// ============================================
// Stream Handler - Get Streaming URL
// ============================================
async function streamHandler(args) {
    console.log("Stream request:", args);

    // Extract token from config
    const accessToken = args.config?.token;

    if (!accessToken) {
        console.log("No access token provided");
        return { streams: [] };
    }

    // Check if this is a Seedr file ID
    if (args.type === "other" && args.id.startsWith("seedr:")) {
        const fileId = args.id.replace("seedr:", "");

        try {
            const streamData = await seedrApi.getStreamUrl(accessToken, fileId);

            if (streamData && streamData.url) {
                console.log("Returning stream URL for file:", streamData.name);

                return {
                    streams: [
                        {
                            url: streamData.url,
                            title: `🎬 ${streamData.name || "Play Video"}`,
                            name: "Seedr"
                        }
                    ]
                };
            }
        } catch (error) {
            console.error("Error getting stream URL:", error.message);
        }
    }

    return { streams: [] };
}

// ============================================
// Helper Functions
// ============================================
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Export manifest and handlers for server.js
module.exports = {
    manifest,
    catalogHandler,
    streamHandler
};
