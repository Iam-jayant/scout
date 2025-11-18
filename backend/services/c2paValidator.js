/**
 * C2PA (Coalition for Content Provenance and Authenticity) Validator
 * Checks IP Assets for C2PA watermarks and authenticity proofs
 */

import axios from 'axios';

const PINATA_GATEWAY = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud';

/**
 * Check C2PA watermark for an IP Asset
 * @param {Object} ipAsset - IP Asset object with metadata
 * @returns {Promise<Object>} C2PA validation result
 */
export async function checkC2PAWatermark(ipAsset) {
  try {
    const c2paCID = ipAsset.metadata?.c2paManifestCID || 
                    ipAsset.metadata?.c2pa?.manifestCID ||
                    ipAsset.c2paManifestCID;

    if (!c2paCID) {
      return {
        status: 'MISSING_WATERMARK',
        risk: 'HIGH',
        reason: 'No C2PA authenticity proof found in IP metadata',
        timestamp: new Date().toISOString(),
        hasC2PA: false
      };
    }

    const c2paData = await fetchC2PAManifest(c2paCID);

    if (!c2paData) {
      return {
        status: 'WATERMARK_INVALID',
        risk: 'HIGH',
        reason: 'C2PA manifest CID exists but data could not be fetched from IPFS',
        timestamp: new Date().toISOString(),
        hasC2PA: false,
        cid: c2paCID
      };
    }

    const validation = validateC2PAManifest(c2paData);

    if (validation.valid) {
      return {
        status: 'WATERMARK_VALID',
        risk: 'LOW',
        reason: 'C2PA authenticity verified',
        timestamp: new Date().toISOString(),
        hasC2PA: true,
        cid: c2paCID,
        manifest: {
          claims: validation.claims,
          assertions: validation.assertions,
          signature: validation.hasSignature
        }
      };
    } else {
      return {
        status: 'WATERMARK_INVALID',
        risk: 'MEDIUM',
        reason: validation.reason || 'C2PA manifest structure is invalid',
        timestamp: new Date().toISOString(),
        hasC2PA: true,
        cid: c2paCID,
        errors: validation.errors
      };
    }

  } catch (error) {
    console.error('C2PA validation error:', error);
    return {
      status: 'WATERMARK_INVALID',
      risk: 'MEDIUM',
      reason: `C2PA check failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      hasC2PA: false,
      error: error.message
    };
  }
}

/**
 * Fetch C2PA manifest from IPFS
 * @param {string} cid - IPFS CID of the C2PA manifest
 * @returns {Promise<Object|null>} C2PA manifest data or null
 */
async function fetchC2PAManifest(cid) {
  try {
    const ipfsUrl = `${PINATA_GATEWAY}/ipfs/${cid}`;
    
    const response = await axios.get(ipfsUrl, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 200 && response.data) {
      return response.data;
    }

    return null;
  } catch (error) {
    const alternativeGateways = [
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`
    ];

    for (const gateway of alternativeGateways) {
      try {
        const response = await axios.get(gateway, {
          timeout: 5000,
          headers: {
            'Accept': 'application/json'
          }
        });

        if (response.status === 200 && response.data) {
          return response.data;
        }
      } catch (err) {
        continue;
      }
    }

    console.error(`Failed to fetch C2PA manifest from IPFS: ${cid}`, error.message);
    return null;
  }
}

/**
 * Validate C2PA manifest structure
 * @param {Object} manifest - C2PA manifest data
 * @returns {Object} Validation result
 */
function validateC2PAManifest(manifest) {
  const errors = [];
  
  if (!manifest) {
    return {
      valid: false,
      reason: 'Manifest is null or undefined',
      errors: ['Manifest data is missing']
    };
  }

  const hasClaims = manifest.claims || manifest.claim_generator || manifest.claim;
  const hasAssertions = manifest.assertions || manifest.claim_assertions;
  const hasSignature = manifest.signature || manifest.claim_signature;

  if (!hasClaims) {
    errors.push('Missing claims section');
  }

  if (!hasAssertions) {
    errors.push('Missing assertions section');
  }

  if (!hasSignature) {
    errors.push('Warning: No signature found (may be unsigned)');
  }

  const claims = hasClaims ? (manifest.claims || manifest.claim || {}) : {};
  const assertions = hasAssertions ? (manifest.assertions || manifest.claim_assertions || []) : [];
  const isValid = hasClaims || hasAssertions;

  return {
    valid: isValid,
    reason: isValid 
      ? 'C2PA manifest structure is valid' 
      : 'C2PA manifest missing required fields',
    errors: errors.length > 0 ? errors : undefined,
    claims: claims,
    assertions: assertions,
    hasSignature: !!hasSignature
  };
}

/**
 * Extract creator information from C2PA manifest
 * @param {Object} manifest - C2PA manifest data
 * @returns {Object} Creator information
 */
export function extractCreatorInfo(manifest) {
  try {
    const claims = manifest.claims || manifest.claim || {};
    const assertions = manifest.assertions || manifest.claim_assertions || [];

    let creator = null;
    let created = null;
    let tool = null;

    if (claims.creator) {
      creator = claims.creator;
    }

    if (claims.created) {
      created = claims.created;
    }

    if (claims.claim_generator || claims.tool) {
      tool = claims.claim_generator || claims.tool;
    }

    if (Array.isArray(assertions)) {
      for (const assertion of assertions) {
        if (assertion.label === 'creator' || assertion.label === 'stds.schema-org.CreativeWork') {
          creator = assertion.data || creator;
        }
        if (assertion.label === 'created' || assertion.label === 'stds.schema-org.dateCreated') {
          created = assertion.data || created;
        }
      }
    }

    return {
      creator: creator,
      created: created,
      tool: tool,
      hasCreatorInfo: !!creator
    };
  } catch (error) {
    return {
      creator: null,
      created: null,
      tool: null,
      hasCreatorInfo: false,
      error: error.message
    };
  }
}

