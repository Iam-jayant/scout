/**
 * Express server for IP Enforcement Agent
 * Main backend API server
 */

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { initializeStorySDK } from './services/storySDK.js';
import monitoringRoutes from './routes/monitoring.js';
import detectionRoutes from './routes/detection.js';
import disputeRoutes from './routes/disputes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'IP Enforcement Agent Backend'
  });
});

// API status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const storyClient = await initializeStorySDK();
    res.json({
      status: 'connected',
      storySDK: 'initialized',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Register routes
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/detect', detectionRoutes);
app.use('/api/disputes', disputeRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Keep the process alive
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Keep the process alive
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Initialize Story SDK on startup
async function startServer() {
  try {
    console.log('Starting IP Enforcement Agent Backend...\n');
    
    console.log('Initializing Story Protocol SDK...');
    await initializeStorySDK();
    console.log('Story SDK initialized\n');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API status: http://localhost:${PORT}/api/status\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.error('Make sure to set STORY_PRIVATE_KEY in backend/.env');
    process.exit(1);
  }
}

startServer();

