/**
 * Monitoring API Routes
 * Handles IP Asset monitoring endpoints
 */

import express from 'express';
import { monitorIPAssets, getMonitoringStats, resetMonitoring, setAutoDetection, isAutoDetectionEnabled } from '../services/monitoringService.js';
import { getDetectedViolations, getViolationsByRisk } from '../services/detectionPipeline.js';

const router = express.Router();

/**
 * GET /api/monitoring/status
 * Get current monitoring status
 */
router.get('/status', (req, res) => {
  try {
    const stats = getMonitoringStats();
    res.json({
      success: true,
      ...stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/recent
 * Get recently registered IP Assets
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await monitorIPAssets({ limit });
    
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching recent IPs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/stats
 * Get monitoring statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getMonitoringStats();
    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/monitoring/reset
 * Reset monitoring state (for testing)
 */
router.post('/reset', (req, res) => {
  try {
    resetMonitoring();
    res.json({
      success: true,
      message: 'Monitoring state reset',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/violations
 * Get detected violations
 */
router.get('/violations', (req, res) => {
  try {
    const riskFilter = req.query.risk; // Optional risk filter
    const violations = riskFilter 
      ? getViolationsByRisk(riskFilter.toUpperCase())
      : getDetectedViolations();

    res.json({
      success: true,
      violations: violations,
      count: violations.length,
      autoDetectionEnabled: isAutoDetectionEnabled(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/monitoring/auto-detection
 * Enable/disable auto-detection
 * Body: { enabled: true/false }
 */
router.post('/auto-detection', (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean',
        timestamp: new Date().toISOString()
      });
    }

    setAutoDetection(enabled);
    
    res.json({
      success: true,
      autoDetectionEnabled: enabled,
      message: `Auto-detection ${enabled ? 'enabled' : 'disabled'}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

