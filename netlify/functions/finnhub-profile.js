// Netlify function to proxy Finnhub company profile requests (for ticker logos) and keep API key server-side
// Place this file in netlify/functions/ and set an env var named `API_KEY` or `FINNHUB_API_KEY`.

const fetchFn = globalThis.fetch || require('node-fetch')

exports.handler = async function (event) {
  try {
    const params = event.queryStringParameters || {}
    const symbol = params.symbol
    if (!symbol) return { statusCode: 400, body: 'Missing symbol' }

    const key = process.env.API_KEY || process.env.FINNHUB_API_KEY
    if (!key) return { statusCode: 500, body: 'Missing API key environment variable (set API_KEY or FINNHUB_API_KEY)' }

    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}`
    const res = await fetchFn(url, { headers: { 'X-Finnhub-Token': key } })
    const text = await res.text()
    if (!res.ok) return { statusCode: res.status, body: text }

    return {
      statusCode: 200,
      body: text,
      headers: {
        'Content-Type': 'application/json',
        // cache a bit at the edge; logos rarely change
        'Cache-Control': 'public, max-age=3600',
      },
    }
  } catch (err) {
    return { statusCode: 500, body: String(err && err.message ? err.message : err) }
  }
}

