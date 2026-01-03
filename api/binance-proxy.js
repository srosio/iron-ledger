/**
 * Vercel Serverless Function: Binance Futures API CORS Proxy
 *
 * This function proxies requests to Binance Futures API and adds CORS headers.
 *
 * Usage:
 *   GET /api/binance-proxy?endpoint=/fapi/v1/premiumIndex?symbol=BTCUSDT
 *
 * This is the RECOMMENDED solution for production deployments on Vercel.
 * It's more reliable and faster than public CORS proxies.
 */

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get the endpoint from query parameters
    const { endpoint } = req.query;

    if (!endpoint) {
        return res.status(400).json({
            error: 'Missing endpoint parameter',
            usage: '/api/binance-proxy?endpoint=/fapi/v1/premiumIndex?symbol=BTCUSDT'
        });
    }

    try {
        // Fetch from Binance Futures API
        const binanceUrl = `https://fapi.binance.com${endpoint}`;
        console.log('Proxying request to:', binanceUrl);

        const response = await fetch(binanceUrl);

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Binance API error',
                status: response.status,
                statusText: response.statusText
            });
        }

        const data = await response.json();

        // Set CORS headers to allow browser access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate');

        // Return the data
        return res.status(200).json(data);

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({
            error: 'Proxy request failed',
            message: error.message
        });
    }
}
