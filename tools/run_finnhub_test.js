// Simple runner to invoke the Netlify function handler locally.
// Usage: `node tools/run_finnhub_test.js`

const path = require('path')

async function run(){
  const fnPath = path.join(__dirname, '..', 'netlify', 'functions', 'finnhub-candles.js')
  const fn = require(fnPath)

  const event = { queryStringParameters: { symbol: 'AAPL', days: '5', resolution: 'D' } }
  try{
    const res = await fn.handler(event, {})
    console.log('Status:', res.statusCode)
    if(res.headers) console.log('Headers:', res.headers)
    try{
      const parsed = JSON.parse(res.body)
      console.log('Body (parsed):', JSON.stringify(parsed, null, 2))
    }catch(e){
      console.log('Body:', res.body)
    }
  }catch(err){
    console.error('Handler error:', err)
    process.exit(1)
  }
}

run()
