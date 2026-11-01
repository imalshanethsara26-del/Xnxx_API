const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Cache setup - 12 Hours TTL
const appCache = new NodeCache({ stdTTL: 43200 });

// --- RENDER FREE TIER PROTECTION: LIGHTWEIGHT RATE LIMITER ---
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 Minute window
const MAX_REQUESTS_PER_WINDOW = 40; // Max 40 requests per minute per IP

const rateLimiter = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, startTime: now });
    } else {
        const data = requestCounts.get(ip);
        if (now - data.startTime < RATE_LIMIT_WINDOW) {
            data.count++;
            if (data.count > MAX_REQUESTS_PER_WINDOW) {
                return res.status(429).json({
                    status: false,
                    error: "Too many requests. Please slow down.",
                    message: "⚠️ සර්වර් එක ඉතා කාර්යබහුලයි. කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න."
                });
            }
        } else {
            data.count = 1;
            data.startTime = now;
        }
    }
    next();
};

// Apply Rate Limiter to all API routes
app.use(rateLimiter);

// Cleanup old IP records from memory every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requestCounts.entries()) {
        if (now - data.startTime > RATE_LIMIT_WINDOW * 5) {
            requestCounts.delete(ip);
        }
    }
}, 300000);

const BASE_URL = 'https://www.xnxx.com';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.xnxx.com/'
};

// Root Route
app.get('/', (req, res) => {
    res.json({
        status: true,
        message: "IMALSHA XNXX FAST API is Live & Protected 🚀",
        endpoints: {
            latest: "/api/v1/xnxx/latest?page=1",
            search: "/api/v1/xnxx/search?q=query&page=1",
            infodl: "/api/v1/xnxx/infodl?url=video_page_url"
        }
    });
});

// Precise Video Extractor Function
function extractVideos(html, $) {
    const results = [];

    $('.thumb-block').each((i, el) => {
        const videoAnchor = $(el).find('a[href*="/video-"]').first();
        const href = videoAnchor.attr('href') || '';
        
        let title = videoAnchor.attr('title') || 
                    $(el).find('.thumb-under p.metadata a, .thumb-under p a').not('[href*="/porn-maker/"]').not('[href*="/profiles/"]').text().trim() ||
                    $(el).find('.thumb-under p a').first().text().trim() || 
                    $(el).find('img').attr('alt') || '';
        
        const imgEl = $(el).find('img');
        let img = imgEl.attr('data-src') || 
                  imgEl.attr('data-src-small') || 
                  imgEl.attr('src') || 
                  imgEl.attr('data-srcset') || '';

        if (!img || img.startsWith('data:image')) {
            const blockHtml = $(el).html() || '';
            const imgMatch = blockHtml.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/i);
            if (imgMatch) img = imgMatch[0];
        }

        let duration = $(el).find('.metadata, .duration, .metadata .flag').text().trim() || 'N/A';
        const cleanTitle = title.replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

        if (href && href.includes('/video-') && cleanTitle && !results.some(r => r.link.includes(href))) {
            const fullLink = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            results.push({
                title: cleanTitle,
                duration: duration.replace(/[\t\n\r]+/g, ' ').trim(),
                image: img,
                link: fullLink
            });
        }
    });

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
        res.status(500).json({ 
            status: false, 
            error: "Server temporarily busy", 
            message: "⚠️ සර්වර් එක තාවකාලිකව කාර්යබහුලයි. කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න." 
        });
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
        res.status(500).json({ 
            status: false, 
            error: "Server temporarily busy", 
            message: "⚠️ සර්වර් එක තාවකාලිකව කාර්යබහුලයි. කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න." 
        });
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
        res.status(500).json({ 
            status: false, 
            error: "Server temporarily busy", 
            message: "⚠️ සර්වර් එක තාවකාලිකව කාර්යබහුලයි. කරුණාකර තත්පර කිහිපයකින් නැවත උත්සාහ කරන්න." 
        });
    }
});

app.listen(PORT, () => console.log(`🚀 XNXX Protected API Server running on port ${PORT}`));
