const axios = require("axios");

// Seedr API Configuration
const SEEDR_BASE_URL = "https://v2.seedr.cc/api/v0.1/p";
const CLIENT_ID = "tn7B667iqQajxkyMKtiVitHvfnxsS1Tj";
const DEBUG_LOGS = process.env.DEBUG_SEEDR === "1";

/**
 * Request a device code for authorization
 * @returns {Promise<{device_code: string, user_code: string, verification_uri: string, expires_in: number, interval: number}>}
 */
async function getDeviceCode() {
    try {
        const params = new URLSearchParams();
        params.append("client_id", CLIENT_ID);
        params.append("scope", "files.read files.write tasks.read tasks.write profile");

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth/device/code`, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error("Seedr Device Code Error:", error.response.data);
            throw new Error(error.response.data.error_description || error.response.data.error || error.message);
        }
        throw error;
    }
}

/**
 * Poll for authorization token after user enters code
 * @param {string} deviceCode - The device code from getDeviceCode
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number, refresh_token: string}|null>}
 */
async function pollForToken(deviceCode) {
    try {
        const params = new URLSearchParams();
        params.append("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
        params.append("device_code", deviceCode);
        params.append("client_id", CLIENT_ID);

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth/token`, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        if (response.data && response.data.access_token) {
            return response.data;
        }
        return null;
    } catch (error) {
        // Authorization pending - user hasn't entered code yet
        if (error.response && (error.response.data.error === "authorization_pending" || error.response.status === 400)) {
            return null;
        }
        throw error;
    }
}

/**
 * Get contents of a folder (or root folder if no folderId)
 * @param {string} accessToken - The access token
 * @param {string|null} folderId - Optional folder ID (null for root)
 * @returns {Promise<{folders: Array, files: Array}>}
 */
async function getFolder(accessToken, folderId = null) {
    const url = folderId
        ? `${SEEDR_BASE_URL}/fs/folder/${folderId}/contents`
        : `${SEEDR_BASE_URL}/fs/root/contents`;


    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = response.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const folders = data.folders || items.filter(item => item.type === "folder");
    const files = data.files || items.filter(item => item.type === "file");
    const torrents = data.torrents || data.tasks || items.filter(item => item.type === "task" || item.type === "torrent");

    return {
        ...data,
        folders,
        files,
        torrents
    };
}

/**
 * Recursively get all video files from Seedr account
 * @param {string} accessToken - The access token
 * @param {string|null} folderId - Folder ID to start from (null for root)
 * @param {string} parentPath - Path prefix for folder hierarchy
 * @returns {Promise<Array<{id: string, name: string, size: number, path: string}>>}
 */
async function getAllVideoFiles(accessToken, folderId = null, parentPath = "") {
    const videos = [];

    try {
        const folderData = await getFolder(accessToken, folderId);

        // Add video files from current folder
        if (folderData.files) {
            for (const file of folderData.files) {
                // In V2, we might need a different way to check if it's a video
                // But usually there's a stream/presentation info
                videos.push({
                    id: file.id.toString(),
                    name: file.name,
                    size: file.size,
                    path: parentPath ? `${parentPath}/${file.name}` : file.name
                });
            }
        }

        // Recursively scan subfolders
        if (folderData.folders) {
            for (const folder of folderData.folders) {
                const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
                const subVideos = await getAllVideoFiles(accessToken, folder.id.toString(), folderPath);
                videos.push(...subVideos);
            }
        }
    } catch (error) {
        console.error("Error fetching folder:", folderId, error.message);
    }

    return videos;
}

/**
 * Get streaming URL for a file
 * @param {string} accessToken - The access token
 * @param {string} fileId - The folder_file_id of the file
 * @returns {Promise<{url: string, name: string, size: number}>}
 */
async function getStreamUrl(accessToken, fileId) {
    const headers = { Authorization: `Bearer ${accessToken.trim()}` };
    const endpoints = [
        `${SEEDR_BASE_URL}/presentations/file/${fileId}/video`,
        `${SEEDR_BASE_URL}/presentation/fs/item/${fileId}/video/url`,
        `${SEEDR_BASE_URL}/download/file/${fileId}/url`
    ];

    let lastError = null;

    for (const url of endpoints) {
        try {
            const response = await axios.get(url, { headers });
            const data = response.data;

            if (typeof data === "string") {
                return { url: data };
            }

            const streamUrl = data?.url || data?.stream_url || data?.download_url || data?.data?.url;
            if (streamUrl) {
                return {
                    url: streamUrl,
                    name: data.name,
                    size: data.size
                };
            }
        } catch (error) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) {
                throw error;
            }
        }
    }

    throw lastError || new Error(`Unable to get stream URL for file ${fileId}`);
}

/**
 * Get user account information
 * @param {string} accessToken - The access token
 * @returns {Promise<Object>}
 */
async function getUserInfo(accessToken) {
    const response = await axios.get(`${SEEDR_BASE_URL}/user`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
    });

    return response.data;
}

/**
 * Add a magnet link to Seedr for downloading
 * @param {string} accessToken - The access token
 * @param {string} magnetLink - The magnet URI to add
 * @param {number} folderId - Target folder ID (0 or null for root folder in V2)
 * @returns {Promise<{result: boolean, user_torrent_id?: number, error?: string}>}
 */
async function addMagnet(accessToken, magnetLink, folderId = 0) {
    if (DEBUG_LOGS) {
        console.log(`DEBUG: Adding magnet to folder ${folderId}`);
    }
    const payload = {
        torrent_magnet: magnetLink
    };
    if (folderId && folderId !== -1 && folderId !== 0) {
        payload.folder_id = folderId;
        payload.save_folder_id = folderId;
    }
    let response;
    try {
        response = await axios.post(`${SEEDR_BASE_URL}/tasks`, payload, {
            headers: {
                Authorization: `Bearer ${accessToken.trim()}`,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
        });
    } catch (error) {
        const apiError = new Error(
            `Failed to add magnet: ${error.response?.data?.reason_phrase || error.response?.data?.error || error.message}`
        );
        apiError.status = error.response?.status;
        apiError.reason_phrase = error.response?.data?.reason_phrase;
        apiError.wt = error.response?.data?.wt;
        apiError.responseData = error.response?.data;
        throw apiError;
    }

    const result = response.data;

    if (result.error) {
        throw new Error(`Failed to add magnet: ${result.error}`);
    }

    return {
        result: result.result ?? true,
        reason_phrase: result.reason_phrase,
        wt: result.wt,
        user_torrent_id: result.id || result.task_id
    };
}

/**
 * Get active transfers (downloading torrents) from Seedr
 * @param {string} accessToken - The access token
 * @returns {Promise<Array<{id: number, name: string, progress: number, size: number}>>}
 */
async function getActiveTransfers(accessToken) {
    if (DEBUG_LOGS) {
        console.log(
            `DEBUG: Fetching active transfers with access token: ${accessToken.trim().substring(0, 10)}...`
        );
    }

    let response;
    try {
        response = await axios.get(`${SEEDR_BASE_URL}/tasks`, {
            headers: {
                Authorization: `Bearer ${accessToken.trim()}`,
                Accept: "application/json"
            }
        });
    } catch (error) {
        console.error("Error fetching active transfers:", error.response?.data || error.message);
        throw new Error(`Failed to fetch active transfers: ${error.response?.data?.error || error.message}`);
    }

    const tasks = Array.isArray(response.data)
        ? response.data
        : response.data?.tasks || response.data?.torrents || [];

    return tasks.map(mapTaskToTransfer);
}

function mapTaskToTransfer(task) {
    return {
        id: task.id,
        name: task.name,
        type: task.type,
        state: task.state,
        progress: task.progress ?? 0,
        size: task.size ?? 0,
        storageSize: task.storage_size ?? 0,
        folderId: task.folder_id,
        completedFolderId: task.folder_created_id,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
        error: task.error,
        torrent: {
            hash: task.torrent_payload?.hash,
            downloadRate: task.torrent_payload?.download_rate ?? 0,
            seeders: task.torrent_payload?.seeders ?? 0,
            leechers: task.torrent_payload?.leechers ?? 0
        }
    };
}

/**
 * Get detailed info for a specific torrent task
 * @param {string} accessToken - The access token
 * @param {number|string} taskId - The task ID
 * @returns {Promise<Object>}
 */
async function getTask(accessToken, taskId) {
    const response = await axios.get(`${SEEDR_BASE_URL}/tasks/${taskId}`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            Accept: "application/json"
        }
    });

    const data = response.data?.task || response.data;
    return mapTaskToTransfer(data);
}

/**
 * Get task progress payload or poll URL
 * @param {string} accessToken - The access token
 * @param {number|string} taskId - The task ID
 * @returns {Promise<Object|string|null>}
 */
async function getTaskProgress(accessToken, taskId) {
    const response = await axios.get(`${SEEDR_BASE_URL}/tasks/${taskId}/progress`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            Accept: "application/json"
        }
    });

    return response.data;
}

/**
 * Refresh a transfer with task-specific detail/progress data when available
 * @param {string} accessToken - The access token
 * @param {Object} transfer - Transfer from list endpoint
 * @returns {Promise<Object>}
 */
async function refreshTransfer(accessToken, transfer) {
    if (!transfer?.id) {
        return transfer;
    }

    let refreshed = transfer;

    try {
        refreshed = await getTask(accessToken, transfer.id);
    } catch (error) {
        if (DEBUG_LOGS) {
            console.warn("Failed to refresh task details:", transfer.id, error.response?.data || error.message);
        }
    }

    try {
        const progressData = await getTaskProgress(accessToken, transfer.id);
        if (progressData && typeof progressData === "object") {
            if (typeof progressData.progress === "number") {
                refreshed.progress = progressData.progress;
            }
            if (typeof progressData.state === "string") {
                refreshed.state = progressData.state;
            }
            if (typeof progressData.url === "string") {
                refreshed.progressUrl = progressData.url;
            }
        } else if (typeof progressData === "string") {
            refreshed.progressUrl = progressData;
        }
    } catch (error) {
        if (DEBUG_LOGS) {
            console.warn("Failed to refresh task progress:", transfer.id, error.response?.data || error.message);
        }
    }

    return refreshed;
}

/**
 * Get files for a specific torrent task
 * @param {string} accessToken - The access token
 * @param {number|string} taskId - The task ID
 * @returns {Promise<{files: Array, folders: Array}>}
 */
async function getTaskContents(accessToken, taskId) {
    const response = await axios.get(`${SEEDR_BASE_URL}/tasks/${taskId}/contents`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            Accept: "application/json"
        }
    });

    const data = response.data || {};
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
    const folders = data.folders || items.filter(item => item.type === "folder");
    const files = data.files || items.filter(item => item.type === "file");

    return {
        ...data,
        folders,
        files
    };
}

/**
 * Delete a specific torrent task
 * @param {string} accessToken - The access token
 * @param {number|string} taskId - The task ID
 * @returns {Promise<Object>}
 */
async function deleteTask(accessToken, taskId) {
    const response = await axios.delete(`${SEEDR_BASE_URL}/tasks/${taskId}`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            Accept: "application/json"
        }
    });

    return response.data;
}

/**
 * Delete all torrent tasks without touching downloaded files
 * @param {string} accessToken - The access token
 * @returns {Promise<{result: boolean, deleted: number}>}
 */
async function clearTasks(accessToken) {
    const tasks = await getActiveTransfers(accessToken);

    if (!tasks.length) {
        return { result: true, deleted: 0 };
    }

    await Promise.all(tasks.map(task => deleteTask(accessToken, task.id)));
    return {
        result: true,
        deleted: tasks.length
    };
}

/**
 * Find a folder by name in the root directory
 * @param {string} accessToken - The access token
 * @param {string} folderName - The name of the folder to find
 * @returns {Promise<Object|null>} - The folder object or null if not found
 */
async function getFolderByName(accessToken, folderName) {
    try {
        const rootFolder = await getFolder(accessToken, 0);
        if (rootFolder.folders) {
            const folder = rootFolder.folders.find(f => f.name === folderName);
            return folder || null;
        }
        return null;
    } catch (error) {
        console.error("Error getting folder by name:", error.message);
        return null;
    }
}

/**
 * Delete a folder from Seedr
 * @param {string} accessToken - The access token
 * @param {string} folderId - The folder ID to delete
 * @returns {Promise<Object>}
 */
async function deleteFolder(accessToken, folderId) {
    const response = await axios.delete(`${SEEDR_BASE_URL}/fs/folder/${folderId}`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
    });

    return response.data;
}

/**
 * Delete a file from Seedr
 * @param {string} accessToken - The access token
 * @param {string|number} fileId - The file ID
 * @returns {Promise<Object>}
 */
async function deleteFile(accessToken, fileId) {
    const response = await axios.delete(`${SEEDR_BASE_URL}/fs/file/${fileId}`, {
        headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
            Accept: "application/json"
        }
    });

    return response.data;
}

/**
 * Delete all content from Seedr (folders, files, and active transfers)
 * @param {string} accessToken - The access token
 * @returns {Promise<{result: boolean, deleted: number, message: string}>}
 */
async function deleteAllContent(accessToken) {
    try {
        const rootFolder = await getFolder(accessToken, 0);
        const tasks = await getActiveTransfers(accessToken);
        const folders = rootFolder.folders || [];
        const files = rootFolder.files || [];
        const deleteItems = [
            ...folders.map(folder => ({ type: "folder", id: folder.id })),
            ...files.map(file => ({ type: "file", id: file.id })),
            ...tasks.map(task => ({ type: "torrent", id: task.id }))
        ];

        if (!deleteItems.length) {
            return { result: true, deleted: 0, message: "Nothing to delete" };
        }

        try {
            await axios.post(`${SEEDR_BASE_URL}/fs/batch/delete`, {
                delete_arr: deleteItems
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken.trim()}`,
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            });
        } catch (batchError) {
            if (DEBUG_LOGS) {
                console.warn("Batch delete failed, falling back to individual deletes:", batchError.response?.data || batchError.message);
            }

            await Promise.all(tasks.map(task => deleteTask(accessToken, task.id)));
            await Promise.all(files.map(file => deleteFile(accessToken, file.id)));
            await Promise.all(folders.map(folder => deleteFolder(accessToken, folder.id)));
        }

        return {
            result: true,
            deleted: deleteItems.length,
            message: `Deleted ${deleteItems.length} items`
        };
    } catch (error) {
        console.error("Error deleting all content:", error.message);
        throw error;
    }
}

/**
 * Delete an item from wishlist
 * @param {string} accessToken - The access token
 * @param {number|string} wishlistId - The wishlist item ID to delete
 * @returns {Promise<Object>}
 */
async function deleteFromWishlist(accessToken, wishlistId) {
    try {
        const response = await axios.delete(`${SEEDR_BASE_URL}/tasks/${wishlistId}`, {
            headers: { Authorization: `Bearer ${accessToken.trim()}` }
        });

        return response.data;
    } catch (taskDeleteError) {
        try {
            const response = await axios.post(`${SEEDR_BASE_URL}/fs/batch/delete`, {
                delete_arr: [{ type: "wishlist", id: wishlistId }]
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken.trim()}`,
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            });

            return response.data;
        } catch (batchDeleteError) {
            const status = batchDeleteError.response?.status || taskDeleteError.response?.status;
            if (status === 404) {
                return { result: true, ignored: true };
            }
            throw batchDeleteError;
        }
    }
}

/**
 * Clear all content from Seedr account (alias for deleteAllContent)
 * @param {string} accessToken - The access token
 * @returns {Promise<{result: boolean, deleted: number, message: string}>}
 */
async function clearAccount(accessToken) {
    return deleteAllContent(accessToken);
}

module.exports = {
    getDeviceCode,
    pollForToken,
    getFolder,
    getAllVideoFiles,
    getStreamUrl,
    getUserInfo,
    addMagnet,
    getActiveTransfers,
    getTask,
    getTaskProgress,
    refreshTransfer,
    getTaskContents,
    deleteTask,
    clearTasks,
    getFolderByName,
    deleteFolder,
    deleteFile,
    deleteAllContent,
    deleteFromWishlist,
    clearAccount
};
