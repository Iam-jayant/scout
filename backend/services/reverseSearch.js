import { Builder, By, until } from 'selenium-webdriver';
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Performs reverse image search using Google Images via Selenium
 * @param {string} imageUrl - URL of the image to search
 * @returns {Promise<Object>} Search results with matches and similarity scores
 */
export async function reverseImageSearch(imageUrl) {
  let driver = null;
  
  try {
    // Setup Chrome options for headless browsing
    const options = new ChromeOptions();
    options.addArguments('--headless');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Create WebDriver instance
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Download image to temp file if it's a URL
    let imagePath = imageUrl;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const tempPath = path.join(__dirname, '../../temp', `image_${Date.now()}.jpg`);
      const tempDir = path.dirname(tempPath);
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(tempPath, response.data);
      imagePath = tempPath;
    }

    // Navigate to Google Images
    await driver.get('https://www.google.com/imghp');

    // Click on the camera icon to upload image
    try {
      const cameraButton = await driver.wait(
        until.elementLocated(By.css('div[data-ved] svg[viewBox="0 0 24 24"]')),
        5000
      );
      await cameraButton.click();
    } catch (e) {
      // Alternative: Try direct URL method
      const searchByImageUrl = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`;
      await driver.get(searchByImageUrl);
    }

    // Wait for results page to load
    await driver.wait(until.titleContains('Google'), 10000);

    // Extract search results
    const results = await extractSearchResults(driver);

    // Clean up temp file if created
    if (imagePath !== imageUrl && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    return {
      foundMatches: results.length,
      matches: results,
      verdict: results.length > 0 ? 'LIKELY_PLAGIARIZED' : 'ORIGINAL',
      highestSimilarity: results.length > 0 ? Math.max(...results.map(m => m.similarity || 0)) : 0,
      timestamp: new Date().toISOString(),
      searchMethod: 'Google Images (Selenium)'
    };

  } catch (error) {
    console.error('Reverse image search error:', error);
    return {
      foundMatches: 0,
      matches: [],
      verdict: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
}

/**
 * Extracts search results from Google Images page
 * @param {WebDriver} driver - Selenium WebDriver instance
 * @returns {Promise<Array>} Array of match results
 */
async function extractSearchResults(driver) {
  const results = [];
  
  try {
    // Wait for results to load
    await driver.sleep(2000);

    // Find result links
    const resultElements = await driver.findElements(By.css('div[data-ved] a[href*="http"]'));
    
    for (let i = 0; i < Math.min(resultElements.length, 10); i++) {
      try {
        const element = resultElements[i];
        const url = await element.getAttribute('href');
        const text = await element.getText();
        
        if (url && url.startsWith('http')) {
          // Extract domain from URL
          const domain = new URL(url).hostname;
          
          results.push({
            url: url,
            domain: domain,
            title: text || 'No title',
            similarity: 85, // Google doesn't provide exact similarity, estimate
            source: 'Google Images'
          });
        }
      } catch (e) {
        // Skip invalid elements
        continue;
      }
    }

    // Alternative: Try to get "Pages that include matching images" section
    try {
      const matchingPages = await driver.findElements(By.css('div[data-ved] h3'));
      for (const page of matchingPages.slice(0, 5)) {
        const title = await page.getText();
        const parent = await page.findElement(By.xpath('..'));
        const link = await parent.findElement(By.css('a'));
        const url = await link.getAttribute('href');
        
        if (url) {
          results.push({
            url: url,
            domain: new URL(url).hostname,
            title: title,
            similarity: 90,
            source: 'Google Images - Matching Pages'
          });
        }
      }
    } catch (e) {
      // Section might not exist, continue
    }

  } catch (error) {
    console.error('Error extracting results:', error);
  }

  return results;
}

/**
 * Alternative method: Use Google's search by image URL directly
 * This is faster but may be less reliable
 */
export async function reverseImageSearchByUrl(imageUrl) {
  try {
    const searchUrl = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(imageUrl)}`;
    
    // Use axios to fetch and parse the page (simpler but less reliable)
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Parse HTML for results (basic implementation)
    const html = response.data;
    const urlMatches = html.match(/https?:\/\/[^\s"<>]+/g) || [];
    
    const uniqueUrls = [...new Set(urlMatches)]
      .filter(url => url.startsWith('http') && !url.includes('google.com'))
      .slice(0, 10);

    return {
      foundMatches: uniqueUrls.length,
      matches: uniqueUrls.map(url => ({
        url: url,
        domain: new URL(url).hostname,
        similarity: 80,
        source: 'Google Images (URL Method)'
      })),
      verdict: uniqueUrls.length > 0 ? 'LIKELY_PLAGIARIZED' : 'ORIGINAL',
      highestSimilarity: uniqueUrls.length > 0 ? 80 : 0,
      timestamp: new Date().toISOString(),
      searchMethod: 'Google Images (URL)'
    };

  } catch (error) {
    console.error('Reverse image search by URL error:', error);
    return {
      foundMatches: 0,
      matches: [],
      verdict: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

