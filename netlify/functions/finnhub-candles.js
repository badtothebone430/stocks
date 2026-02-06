// Netlify function to proxy Finnhub candle requests and keep API key server-side
// Place this file in netlify/functions/ and set an env var named `API_KEY` or `FINNHUB_API_KEY`.

const fetchFn = globalThis.fetch || require('node-fetch')

exports.handler = async function (event) {
  try {
    const params = event.queryStringParameters || {}
    const symbol = params.symbol
    const days = parseInt(params.days || '30', 10)
    const resolution = params.resolution || 'D'
    const fromParam = params.from ? parseInt(params.from, 10) : null
    const toParam = params.to ? parseInt(params.to, 10) : null
    if (!symbol) return { statusCode: 400, body: 'Missing symbol' }

    // Accept either API_KEY or FINNHUB_API_KEY for flexibility
    const key = process.env.API_KEY || process.env.FINNHUB_API_KEY
    if (!key) return { statusCode: 500, body: 'Missing API key environment variable (set API_KEY or FINNHUB_API_KEY)' }

    const to = (Number.isFinite(toParam) && toParam) ? toParam : Math.floor(Date.now() / 1000)
    const from = (Number.isFinite(fromParam) && fromParam) ? fromParam : (to - (days * 24 * 60 * 60))

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}`

    const res = await fetchFn(url, { headers: { 'X-Finnhub-Token': key } })
    const text = await res.text()
    if (!res.ok) return { statusCode: res.status, body: text }

    return { statusCode: 200, body: text, headers: { 'Content-Type': 'application/json' } }
  } catch (err) {
    return { statusCode: 500, body: String(err && err.message ? err.message : err) }
  }
}
