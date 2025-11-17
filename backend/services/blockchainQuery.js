/**
 * Blockchain Query Service
 * Checks Story Protocol blockchain for duplicate IP Assets
 */

import { getStoryClient } from './storySDK.js';

/**
 * Check if an IP Asset already exists on Story Protocol
 * @param {Object} ipAsset - IP Asset to check
 * @returns {Promise<Object>} Duplicate check result
 */
export async function checkStoryBlockchain(ipAsset) {
  try {
    const client = await getStoryClient();
    const contentHash = ipAsset.contentHash || ipAsset.metadata?.contentHash;
    const ipId = ipAsset.ipId || ipAsset.id;

    if (!contentHash && !ipId) {
      return {
        status: 'ERROR',
        risk: 'LOW',
        reason: 'No contentHash or IP ID provided for duplicate check',
        timestamp: new Date().toISOString()
      };
    }

    let duplicates = [];

    try {
      if (client.ipAsset && typeof client.ipAsset.findByContentHash === 'function') {
        duplicates = await client.ipAsset.findByContentHash(contentHash);
      }
      else if (client.ipAsset && typeof client.ipAsset.list === 'function') {
        const allIPs = await client.ipAsset.list({ limit: 100 });
        duplicates = allIPs.filter(ip => {
          const ipContentHash = ip.contentHash || ip.metadata?.contentHash;
          return ipContentHash && ipContentHash.toLowerCase() === contentHash?.toLowerCase();
        });
      }
      else if (ipId && client.ipAsset && typeof client.ipAsset.get === 'function') {
        try {
          const existingIP = await client.ipAsset.get(ipId);
          if (existingIP) {
            duplicates = [existingIP];
          }
        } catch (err) {
        }
      }
    } catch (error) {
      console.warn('Error querying blockchain for duplicates:', error.message);
    }

    if (ipId && duplicates.length > 0) {
      duplicates = duplicates.filter(dup => {
        const dupId = dup.ipAssetId || dup.id || dup.ipId;
        return dupId && dupId.toLowerCase() !== ipId.toLowerCase();
      });
    }

    if (duplicates.length > 0) {
      return {
        status: 'ALREADY_REGISTERED',
        risk: 'CRITICAL',
        reason: `Found ${duplicates.length} duplicate IP Asset(s) with same content hash`,
        duplicateCount: duplicates.length,
        duplicates: duplicates.map(ip => ({
          ipId: ip.ipAssetId || ip.id || ip.ipId,
          owner: ip.owner || ip.registrant,
          registeredAt: ip.createdAt || ip.registeredAt || ip.timestamp,
          title: ip.metadata?.title || ip.name || 'Untitled'
        })),
        timestamp: new Date().toISOString()
      };
    }

    return {
      status: 'UNIQUE',
      risk: 'LOW',
      reason: 'No duplicate IP Assets found on blockchain',
      duplicateCount: 0,
      duplicates: [],
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Blockchain query error:', error);
    return {
      status: 'ERROR',
      risk: 'LOW',
      reason: `Blockchain check failed: ${error.message}`,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get IP Asset by ID from Story Protocol
 * @param {string} ipId - IP Asset ID
 * @returns {Promise<Object|null>} IP Asset or null
 */
export async function getIPAssetById(ipId) {
  try {
    const client = await getStoryClient();
    
    if (client.ipAsset && typeof client.ipAsset.get === 'function') {
      return await client.ipAsset.get(ipId);
    }

    // Fallback: query list and find by ID
    if (client.ipAsset && typeof client.ipAsset.list === 'function') {
      const allIPs = await client.ipAsset.list({ limit: 1000 });
      return allIPs.find(ip => {
        const id = ip.ipAssetId || ip.id || ip.ipId;
        return id && id.toLowerCase() === ipId.toLowerCase();
      }) || null;
    }

    return null;
  } catch (error) {
    console.error('Error getting IP Asset:', error);
    return null;
  }
}

