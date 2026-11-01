const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

// Cache setup - 12 Hours TTL
const appCache = new NodeCache({ stdTTL: 43200 });

const BASE_URL = 'https://www.xnxx.com';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.xnxx.com/'
};

// Root Route
app.get('/', (req, res) => {
    res.json({
        status: true,
        message: "IMALSHA XNXX FAST API is Live 🚀",
        endpoints: {
            latest: "/api/v1/xnxx/latest?page=1",
            search: "/api/v1/xnxx/search?q=query&page=1",
            infodl: "/api/v1/xnxx/infodl?url=video_page_url"
        }
    });
});

// Helper function to extract and clean video items properly (Fixed for Images)
function extractVideos(html, $) {
    const results = [];
    
    $('.thumb-block, .m-block').each((i, el) => {
        const titleAnchor = $(el).find('.thumb-under a, .title a, a[href*="/video-"]').first();
        const href = titleAnchor.attr('href') || $(el).find('a[href*="/video-"]').attr('href') || '';
        
        let title = titleAnchor.attr('title') || titleAnchor.text().trim() || $(el).find('img').attr('alt') || '';
        
        // Thumbnail Image එක (data-src-small, data-src හෝ src) හරියටම අල්ලා ගැනීම
        const imgEl = $(el).find('img');
        let img = imgEl.attr('data-src') || 
                  imgEl.attr('data-src-small') || 
                  imgEl.attr('src') || '';

        // Duration එක ලබාගැනීම
        let duration = $(el).find('.metadata, .duration, .metadata .flag').text().trim() || 'N/A';

        // Title එක පිරිසිදු කිරීම
        const cleanTitle = title.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

        if (href && cleanTitle && !results.some(r => r.link === href)) {
            const fullLink = href.startsWith('http') ? href : `${BASE_URL}${href}`;

            results.push({
                title: cleanTitle,
                duration: duration.replace(/[\t\n\r]+/g, ' ').trim(),
                image: img,
                link: fullLink
            });
        }
    });

    // Fallback in case container selector misses anything
    if (results.length === 0) {
        $('a[href*="/video-"]').each((i, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).attr('title') || $(el).find('img').attr('alt') || $(el).text().trim();
            const parent = $(el).closest('.thumb-block, .m-block, div');
            
            let img = parent.find('img').attr('data-src') || 
                      parent.find('img').attr('data-src-small') || 
                      parent.find('img').attr('src') || 
                      $(el).find('img').attr('src') || '';

            let duration = parent.find('.metadata, .duration').text().trim() || 'N/A';
            const cleanTitle = title.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

            if (href && cleanTitle && cleanTitle.length > 2 && !results.some(r => r.link === href)) {
                results.push({
                    title: cleanTitle,
                    duration: duration.replace(/[\t\n\r]+/g, ' ').trim(),
                    image: img,
                    link: href.startsWith('http') ? href : `${BASE_URL}${href}`
                });
            }
        });
    }

    return results;
}

// 1. LATEST ENDPOINT
app.get('/api/v1/xnxx/latest', async (req, res) => {
    try {
        const pageNum = req.query.page || 1;
        const monthYear = req.query.month;
        
        let targetUrl = pageNum == 1 ? `${BASE_URL}/best` : `${BASE_URL}/best/?p=${pageNum}`;
        if (monthYear) {
            targetUrl = pageNum == 1 ? `${BASE_URL}/best/${monthYear}` : `${BASE_URL}/best/${monthYear}/?p=${pageNum}`;
        }

        const cacheKey = `xnxx_latest_${monthYear || 'general'}_page_${pageNum}`;
        if (appCache.has(cacheKey)) {
            console.log(`⚡ [CACHE HIT] Serving: ${targetUrl}`);
            return res.json(appCache.get(cacheKey));
        }

        console.log(`🔍 Fetching URL: ${targetUrl}`);
        const response = await axios.get(targetUrl, { 
            headers: { ...HEADERS, 'Cookie': 'age_verified=1' }, 
            timeout: 30000 
        });
        
        const $ = cheerio.load(response.data);
        const results = extractVideos(response.data, $);

        const responseData = { 
            status: true, 
            creator: "@Imalsha", 
            site: "xnxx", 
            period: monthYear || "latest",
            page: Number(pageNum), 
            count: results.length, 
            data: results 
        };
        appCache.set(cacheKey, responseData);

        res.json(responseData);
    } catch (err) {
        console.error(`❌ Error in latest: ${err.message}`);
        res.status(500).json({ status: false, error: err.message });
    }
});

// 2. SEARCH ENDPOINT
app.get('/api/v1/xnxx/search', async (req, res) => {
    try {
        const query = req.query.q;
        const pageNum = req.query.page || 1;

        if (!query) return res.status(400).json({ status: false, message: "Search query 'q' required" });

        const cacheKey = `xnxx_search_${query.toLowerCase().trim()}_p${pageNum}`;
        if (appCache.has(cacheKey)) {
            console.log(`⚡ [CACHE HIT] Serving Search: ${query}, Page: ${pageNum}`);
            return res.json(appCache.get(cacheKey));
        }

        const searchUrl = pageNum == 1 
            ? `${BASE_URL}/search/${encodeURIComponent(query)}` 
            : `${BASE_URL}/search/${encodeURIComponent(query)}/${pageNum}`;

        console.log(`🔍 Fetching Search URL: ${searchUrl}`);
        const response = await axios.get(searchUrl, { 
            headers: { ...HEADERS, 'Cookie': 'age_verified=1' }, 
            timeout: 30000 
        });
        
        const $ = cheerio.load(response.data);
        const results = extractVideos(response.data, $);

        const responseData = { 
            status: true, 
            creator: "@Imalsha", 
            site: "xnxx", 
            query: query, 
            page: Number(pageNum), 
            count: results.length, 
            data: results 
        };
        appCache.set(cacheKey, responseData);

        res.json(responseData);
    } catch (err) {
        console.error(`❌ Error in search: ${err.message}`);
        res.status(500).json({ status: false, error: err.message });
    }
});

// 3. INFO & DIRECT DOWNLOAD ENDPOINT
app.get('/api/v1/xnxx/infodl', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ status: false, message: "Video URL required" });

    const cacheKey = `xnxx_infodl_${videoUrl}`;
    if (appCache.has(cacheKey)) {
        console.log(`⚡ [CACHE HIT] Serving Video Info`);
        return res.json(appCache.get(cacheKey));
    }

    try {
        const response = await axios.get(videoUrl, { 
            headers: { ...HEADERS, 'Cookie': 'age_verified=1' }, 
            timeout: 30000 
        });
        const html = response.data;
        const $ = cheerio.load(html);

        const title = $('meta[property="og:title"]').attr('content') || $('title').text().replace('- XNXX.COM', '').trim();
        const image = $('meta[property="og:image"]').attr('content') || '';
        const duration = $('meta[property="og:duration"]').attr('content') || 'N/A';

        let lowQuality = '';
        let highQuality = '';
        let hlsUrl = '';

        const lowMatch = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
        if (lowMatch) lowQuality = lowMatch[1];

        const highMatch = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
        if (highMatch) highQuality = highMatch[1];

        const hlsMatch = html.match(/html5player\.setVideoHLS\('([^']+)'\)/);
        if (hlsMatch) hlsUrl = hlsMatch[1];

        const responseData = {
            status: true,
            creator: "@Imalsha",
            site: "xnxx",
            url: videoUrl,
            data: {
                title: title.replace(/[\t\n\r]+/g, ' ').trim(),
                image: image,
                duration: duration,
                downloads: {
                    low: lowQuality || 'N/A',
                    high: highQuality || lowQuality,
                    hls: hlsUrl || 'N/A'
                }
            }
        };

        appCache.set(cacheKey, responseData);
        res.json(responseData);

    } catch (err) {
        console.error(`❌ Error in infodl: ${err.message}`);
        res.status(500).json({ status: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 XNXX API Server running on port ${PORT}`));
