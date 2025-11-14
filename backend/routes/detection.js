/**
 * Detection API Routes
 * Handles IP Asset detection and plagiarism checking
 */

import express from 'express';
import { checkC2PAWatermark } from '../services/c2paValidator.js';
import { reverseImageSearch } from '../services/reverseSearch.js';
import { checkStoryBlockchain } from '../services/blockchainQuery.js';
import { monitorIPAssets } from '../services/monitoringService.js';

const router = express.Router();

/**
 * POST /api/detect
 * Run all detection checks on an IP Asset
 */
router.post('/', async (req, res) => {
  try {
    const { ipAsset } = req.body;

    if (!ipAsset) {
      return res.status(400).json({
        success: false,
        error: 'IP Asset object is required',
        timestamp: new Date().toISOString()
      });
    }

    const [c2paResult, reverseSearchResult, blockchainResult] = await Promise.allSettled([
      checkC2PAWatermark(ipAsset),
      ipAsset.metadata?.imageUrl || ipAsset.imageUrl 
        ? reverseImageSearch(ipAsset.metadata?.imageUrl || ipAsset.imageUrl)
        : Promise.resolve({ verdict: 'SKIPPED', reason: 'No image URL provided' }),
      checkStoryBlockchain(ipAsset)
    ]);

    const c2pa = c2paResult.status === 'fulfilled' 
      ? c2paResult.value 
      : { status: 'ERROR', risk: 'LOW', error: c2paResult.reason?.message };

    const reverseSearch = reverseSearchResult.status === 'fulfilled'
      ? reverseSearchResult.value
      : { verdict: 'ERROR', error: reverseSearchResult.reason?.message };

    const blockchain = blockchainResult.status === 'fulfilled'
      ? blockchainResult.value
      : { status: 'ERROR', risk: 'LOW', error: blockchainResult.reason?.message };

    const overallRisk = calculateOverallRisk(c2pa, reverseSearch, blockchain);
    const violations = compileViolations(c2pa, reverseSearch, blockchain);

    res.json({
      success: true,
      ipAssetId: ipAsset.ipId || ipAsset.id,
      detectionResults: {
        c2pa: c2pa,
        reverseSearch: reverseSearch,
        blockchain: blockchain
      },
      overallRisk: overallRisk,
      violations: violations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/detect/batch
 * Run detection on multiple IP Assets
 */
router.post('/batch', async (req, res) => {
  try {
    const { ipAssets } = req.body;

    if (!Array.isArray(ipAssets)) {
      return res.status(400).json({
        success: false,
        error: 'ipAssets must be an array',
        timestamp: new Date().toISOString()
      });
    }

    const batchSize = 10;
    const results = [];

    for (let i = 0; i < ipAssets.length; i += batchSize) {
      const batch = ipAssets.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (ipAsset) => {
          try {
            const [c2paResult, reverseSearchResult, blockchainResult] = await Promise.allSettled([
              checkC2PAWatermark(ipAsset),
              ipAsset.metadata?.imageUrl || ipAsset.imageUrl 
                ? reverseImageSearch(ipAsset.metadata?.imageUrl || ipAsset.imageUrl)
                : Promise.resolve({ verdict: 'SKIPPED', reason: 'No image URL provided' }),
              checkStoryBlockchain(ipAsset)
            ]);

            const c2pa = c2paResult.status === 'fulfilled' 
              ? c2paResult.value 
              : { status: 'ERROR', risk: 'LOW', error: c2paResult.reason?.message };

            const reverseSearch = reverseSearchResult.status === 'fulfilled'
              ? reverseSearchResult.value
              : { verdict: 'ERROR', error: reverseSearchResult.reason?.message };

            const blockchain = blockchainResult.status === 'fulfilled'
              ? blockchainResult.value
              : { status: 'ERROR', risk: 'LOW', error: blockchainResult.reason?.message };

            const overallRisk = calculateOverallRisk(c2pa, reverseSearch, blockchain);
            const violations = compileViolations(c2pa, reverseSearch, blockchain);

            return {
              success: true,
              ipAssetId: ipAsset.ipId || ipAsset.id,
              detectionResults: {
                c2pa: c2pa,
                reverseSearch: reverseSearch,
                blockchain: blockchain
              },
              overallRisk: overallRisk,
              violations: violations,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            return {
              success: false,
              ipAssetId: ipAsset.ipId || ipAsset.id,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        })
      );

      results.push(...batchResults);
    }

    res.json({
      success: true,
      results: results,
      total: results.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Calculate overall risk based on all detection results
 */
function calculateOverallRisk(c2pa, reverseSearch, blockchain) {
  let riskScore = 0;

  if (c2pa.risk === 'HIGH') riskScore += 30;
  else if (c2pa.risk === 'MEDIUM') riskScore += 15;

  if (reverseSearch.verdict === 'LIKELY_PLAGIARIZED') {
    riskScore += 40;
    if (reverseSearch.highestSimilarity > 90) riskScore += 10;
  }

  if (blockchain.status === 'ALREADY_REGISTERED') {
    riskScore += 30;
  }

  if (riskScore >= 70) return 'CRITICAL';
  if (riskScore >= 40) return 'HIGH';
  if (riskScore >= 20) return 'MEDIUM';
  return 'LOW';
}

/**
 * Compile list of violations from detection results
 */
function compileViolations(c2pa, reverseSearch, blockchain) {
  const violations = [];

  if (c2pa.status === 'MISSING_WATERMARK' || c2pa.status === 'WATERMARK_INVALID') {
    violations.push({
      type: 'C2PA',
      severity: c2pa.risk,
      description: c2pa.reason,
      timestamp: c2pa.timestamp
    });
  }

  if (reverseSearch.verdict === 'LIKELY_PLAGIARIZED') {
    violations.push({
      type: 'REVERSE_SEARCH',
      severity: 'HIGH',
      description: `Found ${reverseSearch.foundMatches} matching images online`,
      matches: reverseSearch.matches?.slice(0, 5), // Limit to 5 matches
      timestamp: reverseSearch.timestamp
    });
  }

  if (blockchain.status === 'ALREADY_REGISTERED') {
    violations.push({
      type: 'BLOCKCHAIN_DUPLICATE',
      severity: 'CRITICAL',
      description: `IP Asset already registered by ${blockchain.duplicateCount} other owner(s)`,
      duplicates: blockchain.duplicates,
      timestamp: blockchain.timestamp
    });
  }

  return violations;
}

export default router;