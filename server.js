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

// 1. LATEST ENDPOINT (Fixed with Age Verification Cookie & Safe URL)
app.get('/api/v1/xnxx/latest', async (req, res) => {
    try {
        const pageNum = req.query.page || 1;
        const cacheKey = `xnxx_latest_page_${pageNum}`;

        if (appCache.has(cacheKey)) {
            console.log(`⚡ [CACHE HIT] Serving Latest Page: ${pageNum}`);
            return res.json(appCache.get(cacheKey));
        }

        const targetUrl = pageNum == 1 ? `${BASE_URL}/best` : `${BASE_URL}/best/${pageNum}`;
        console.log(`🔍 Fetching URL: ${targetUrl}`);

        const response = await axios.get(targetUrl, { 
            headers: {
                ...HEADERS,
                'Cookie': 'age_verified=1'
            }, 
            timeout: 30000 
        });
        
        const $ = cheerio.load(response.data);
        const results = [];

        $('.m-block, .mozaique .thumb-block').each((i, el) => {
            const title = $(el).find('.thumb-under a').attr('title') || $(el).find('a').attr('title') || 'No Title';
            const link = $(el).find('.thumb-under a').attr('href') || $(el).find('a').attr('href') || '';
            let image = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
            const duration = $(el).find('.metadata').text().trim() || $(el).find('.duration').text().trim() || 'N/A';

            if (link && title !== 'No Title') {
                results.push({
                    title: title.trim(),
                    duration: duration,
                    image: image,
                    link: link.startsWith('http') ? link : `${BASE_URL}${link}`
                });
            }
        });

        const responseData = { 
            status: true, 
            creator: "@Imalsha", 
            site: "xnxx", 
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

// 2. SEARCH ENDPOINT (With Page Number Support & Cookie)
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

        const response = await axios.get(searchUrl, { 
            headers: {
                ...HEADERS,
                'Cookie': 'age_verified=1'
            }, 
            timeout: 30000 
        });
        const $ = cheerio.load(response.data);
        const results = [];

        $('.mozaique .thumb-block, .m-block').each((i, el) => {
            const title = $(el).find('.thumb-under a').attr('title') || $(el).find('a').attr('title') || 'No Title';
            const link = $(el).find('.thumb-under a').attr('href') || $(el).find('a').attr('href') || '';
            let image = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
            const duration = $(el).find('.metadata').text().trim() || 'N/A';

            if (link && title !== 'No Title') {
                results.push({
                    title: title.trim(),
                    duration: duration,
                    image: image,
                    link: link.startsWith('http') ? link : `${BASE_URL}${link}`
                });
            }
        });

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
            headers: {
                ...HEADERS,
                'Cookie': 'age_verified=1'
            }, 
            timeout: 30000 
        });
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract metadata
        const title = $('meta[property="og:title"]').attr('content') || $('title').text().replace('- XNXX.COM', '').trim();
        const image = $('meta[property="og:image"]').attr('content') || '';
        const duration = $('meta[property="og:duration"]').attr('content') || 'N/A';

        // Extract Direct MP4 Download Links from Script Variables
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
                title: title,
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
