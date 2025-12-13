const STOCKS_URL = './signals.json'

async function loadStocks(){
  try{
    const res = await fetch(STOCKS_URL,{cache:'no-store'})
    if(!res.ok) throw new Error('Failed to load')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }catch(e){console.error(e);return []}
}

function formatMoney(v){ if(v==null||v==='') return '-'; return typeof v==='number' ? v.toFixed(2) : v }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

// Theme handling
function applySavedTheme(){
  const t = localStorage.getItem('theme')
  if(t === 'light') document.documentElement.classList.add('light')
  else document.documentElement.classList.remove('light')
}

function toggleTheme(){
  // add a temporary class so transitions run smoothly
  document.documentElement.classList.add('theme-fade')
  const isLight = document.documentElement.classList.toggle('light')
  localStorage.setItem('theme', isLight ? 'light' : 'dark')
  // keep fade class a bit longer than CSS transition
  setTimeout(()=> document.documentElement.classList.remove('theme-fade'), 620)
}

// Sparkline utilities
function seededRandom(seed){
  let h = 2166136261 >>> 0
  for(let i=0;i<seed.length;i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  return function(){ h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967295 }
}

function drawSparkline(canvas, values, color='#00d1ff'){
  if(!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio||1)
  const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio||1)
  ctx.clearRect(0,0,w,h)
  if(!values || values.length===0) return
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  ctx.beginPath(); ctx.lineWidth = 2 * (window.devicePixelRatio||1); ctx.strokeStyle = color; ctx.lineJoin='round';
  values.forEach((v,i)=>{
    const x = (i/(values.length-1)) * w
    const y = h - ((v - min)/range) * h
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
  })
  ctx.stroke()
}

function seriesForTicker(ticker, n=20){
  const rng = seededRandom(String(ticker||'').toUpperCase())
  const base = 50 + Math.floor(rng()*40)
  const out = []
  for(let i=0;i<n;i++) out.push(base + (rng()-0.5)*6)
  return out
}

// Returns {c: [...closes], t: [...timestamps]} on success, or null on failure.
// Browser fallback: use header-based auth if key exists (less reliable than server proxy)
async function fetchFinnhubCandles(symbol, days=30, resolution='D'){
  try{
    const key = window.FINNHUB_API_KEY
    if(!key) return null
    const to = Math.floor(Date.now()/1000)
    const from = to - (days * 24 * 60 * 60)
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}`
    const res = await fetch(url, { headers: { 'X-Finnhub-Token': key } })
    if(!res.ok) return null
    const data = await res.json()
    // expected data.s === 'ok' and data.c (closes) and data.t (timestamps)
    if(data && data.s === 'ok' && Array.isArray(data.c) && data.c.length>0){
      return { c: data.c, t: Array.isArray(data.t) ? data.t : null }
    }
    return null
  }catch(e){ console.error('Finnhub fetch error', e); return null }
}

// Preferred: call the Netlify function proxy which keeps the API key server-side
async function fetchCandlesProxy(symbol, days=30, resolution='D'){
  try{
    const path = `/.netlify/functions/finnhub-candles?symbol=${encodeURIComponent(symbol)}&days=${days}&resolution=${encodeURIComponent(resolution)}`
    const res = await fetch(path)
    if(!res.ok) return null
    const data = await res.json()
    if(data && data.s === 'ok' && Array.isArray(data.c) && data.c.length>0) return { c: data.c, t: Array.isArray(data.t) ? data.t : null }
    return null
  }catch(e){ console.error('Proxy fetch error', e); return null }
}

// Draw a detailed chart with axes, gridlines and optional highlight price line.
function drawDetailChart(canvas, data, options={}){
  if(!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  canvas.width = Math.max(320, cw * dpr)
  canvas.height = Math.max(140, ch * dpr)
  ctx.clearRect(0,0,canvas.width,canvas.height)

  // Extract closes and timestamps
  let closes = []
  let times = null
  if(Array.isArray(data)) closes = data.slice()
  else if(data && data.c) { closes = data.c.slice(); times = data.t ? data.t.slice() : null }
  if(!closes || closes.length===0) return

  const padding = {left:56* dpr, right:12* dpr, top:12* dpr, bottom:28* dpr}
  const plotW = canvas.width - padding.left - padding.right
  const plotH = canvas.height - padding.top - padding.bottom

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = (max - min) || 1

  // gridlines and axes styles
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00d1ff'
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#9a9a9a'
  ctx.save()

  // draw background (transparent)
  // draw horizontal grid lines and y-axis labels
  ctx.font = `${12 * dpr}px Inter, Arial`;
  ctx.fillStyle = muted
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const gridCount = 4
  for(let i=0;i<=gridCount;i++){
    const y = padding.top + (i/gridCount) * plotH
    ctx.beginPath(); ctx.strokeStyle = 'rgba(128,128,128,0.08)'; ctx.lineWidth = 1 * dpr; ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + plotW, y); ctx.stroke()
    const val = (max - (i/gridCount)*range)
    ctx.fillText(val.toFixed(2), padding.left - 8 * dpr, y)
  }

  // draw x-axis labels (few)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const ticks = 4
  for(let i=0;i<=ticks;i++){
    const ix = Math.floor((i/ticks) * (closes.length-1))
    const x = padding.left + (ix/(closes.length-1)) * plotW
    let label = ''
    if(times && times[ix]){
      const dt = new Date(times[ix]*1000)
      label = dt.toLocaleDateString(undefined, {month:'short',day:'numeric'})
    } else {
      label = ix.toString()
    }
    ctx.fillText(label, x, padding.top + plotH + 6 * dpr)
  }

  // draw price line
  ctx.beginPath(); ctx.lineWidth = 2.2 * dpr; ctx.strokeStyle = accent; ctx.lineJoin='round';
  for(let i=0;i<closes.length;i++){
    const x = padding.left + (i/(closes.length-1)) * plotW
    const y = padding.top + ((max - closes[i]) / range) * plotH
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y)
  }
  ctx.stroke()

  // draw last point marker
  const lastX = padding.left + ((closes.length-1)/(closes.length-1)) * plotW
  const lastY = padding.top + ((max - closes[closes.length-1]) / range) * plotH
  ctx.beginPath(); ctx.fillStyle = accent; ctx.arc(lastX, lastY, 3 * dpr, 0, Math.PI*2); ctx.fill()

  // highlight signal price if provided
  if(options && typeof options.highlightPrice === 'number'){
    const hp = options.highlightPrice
    const hy = padding.top + ((max - hp) / range) * plotH
    ctx.beginPath(); ctx.setLineDash([4 * dpr,4 * dpr]); ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.lineWidth = 1 * dpr; ctx.moveTo(padding.left, hy); ctx.lineTo(padding.left + plotW, hy); ctx.stroke(); ctx.setLineDash([])
    // label
    ctx.fillStyle = 'rgba(255,80,80,0.95)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`Signal ${hp}`, padding.left + 6 * dpr, hy)
  }

  ctx.restore()
}

// Build simple OHLC bars from closes for a nice demo in LightweightCharts
function buildOHLCFromCloses(series){
  const out = []
  for(let i=0;i<series.length;i++){
    const cur = series[i]
    const close = Number(cur.v)
    const timeMs = Number(cur.t)
    const time = Math.floor(timeMs/1000)
    let open = close
    if(i>0) open = Number(series[i-1].v)
    const diff = Math.abs(close - open)
    const vol = Math.max(0.1, diff * 0.6)
    const high = Math.max(open, close) + vol
    const low = Math.min(open, close) - vol
    out.push({ time, open: open, high: Number(high.toFixed(2)), low: Number(low.toFixed(2)), close: Number(close.toFixed(2)) })
  }
  return out
}

let __lwChart = null
let __lwSeries = null
function renderLightweightChart(containerId, series){
  if(!window.LightweightCharts) return
  const el = document.getElementById(containerId)
  if(!el) return
  // destroy previous
  if(__lwChart){ try{ __lwChart.remove(); }catch(e){}; __lwChart = null; __lwSeries = null }
  __lwChart = LightweightCharts.createChart(el, { layout: { background: { color: getComputedStyle(document.documentElement).getPropertyValue('--card') || '#fff' }, textColor: getComputedStyle(document.documentElement).getPropertyValue('--text') || '#000' }, grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } }, width: el.clientWidth, height: el.clientHeight })
  __lwSeries = __lwChart.addCandlestickSeries()
  const ohlc = buildOHLCFromCloses(series)
  __lwSeries.setData(ohlc)
}

function renderStockCard(s){
  const el = document.createElement('div'); el.className='card'; el.tabIndex=0; el.role='button'
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div>
        <div class="ticker">${escapeHtml(s.ticker)} <span class="small">${escapeHtml(s.exchange||'')}</span></div>
        <div class="name">${escapeHtml(s.name||'')}</div>
      </div>
      <canvas class="sparkline" aria-hidden="true"></canvas>
    </div>
    <div class="meta">
      <div class="small">${escapeHtml(s.action || s.type || '')} ${s.buy_amount ?? ''} @ <span class="price">${formatMoney(s.buy_price)}</span></div>
      <div class="small">${escapeHtml(s.notes||'')}</div>
    </div>
  `
  // draw sparkline after insertion
  setTimeout(()=>{
    const c = el.querySelector('canvas.sparkline')
    if(c) drawSparkline(c, seriesForTicker(s.ticker), getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#00d1ff')
  },0)
  // open detail on click / enter
  el.addEventListener('click', ()=> openDetail(s))
  el.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(s) } })
  return el
}

function extractTagsFromNotes(stocks){
  const set = new Set()
  for(const s of stocks){
    if(!s.notes) continue
    const parts = String(s.notes).split(',').map(t=>t.trim()).filter(Boolean)
    for(const p of parts) set.add(p)
  }
  return Array.from(set).sort()
}

function populateTagFilterUI(stocks){
  const sel = document.getElementById('tagFilter')
  if(!sel) return
  const tags = extractTagsFromNotes(stocks)
  const cur = sel.value
  sel.innerHTML = '<option value="">All tags</option>'
  for(const t of tags){
    const opt = document.createElement('option')
    opt.value = t
    opt.textContent = t
    sel.appendChild(opt)
  }
  if(cur) sel.value = cur
}

function applyFilter(stocks, q, tag){
  let list = stocks
  if(q){
    q = q.trim().toLowerCase()
    list = list.filter(s => (s.ticker||'').toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q) || (s.notes||'').toLowerCase().includes(q))
  }
  if(tag){
    const t = tag.toLowerCase()
    list = list.filter(s => {
      if(!s.notes) return false
      const parts = String(s.notes).split(',').map(x=>x.trim().toLowerCase())
      return parts.includes(t)
    })
  }
  return list
}

// Open detail modal (top-level so other functions can call it)
async function openDetail(stockOrTicker){
  const modal = document.getElementById('detailModal')
  const canvas = document.getElementById('detailChart')
  if(!modal || !canvas) return
  // normalize symbol
  const sym = typeof stockOrTicker === 'string' ? stockOrTicker : (stockOrTicker && stockOrTicker.ticker) ? stockOrTicker.ticker : ''
  if(!sym) return
  modal.style.display = 'flex'
  document.body.classList.add('modal-open')
  canvas.width = Math.min(window.innerWidth - 80, 1000)
  canvas.height = Math.min(window.innerHeight - 160, 420)
  // try server proxy first (preferred). If it fails, do NOT attempt a client-side Finnhub call
  // because that requires sending the API key from the browser and triggers CORS/preflight issues.
  let data = await fetchCandlesProxy(sym, 90, 'D').catch(err=>{ console.warn('Proxy error', err); return null })
  if(!data){
    console.warn('Proxy returned no data for', sym, '- falling back to seeded series')
    const seeded = seriesForTicker(sym, 90)
    drawDetailChart(canvas, seeded, { title: sym })
    try{ renderLightweightChart('tvChart', seeded) }catch(e){}
    return
  }
  // draw with fetched data
  const closes = data.c
  const timestamps = data.t || null
  const series = closes.map((v,i)=> ({ t: timestamps ? timestamps[i]*1000 : Date.now() - ((closes.length - i) * 24*60*60*1000), v }))
  drawDetailChart(canvas, series, { title: sym })
  // also render an embedded LightweightCharts candlestick view for more detail
  try{ renderLightweightChart('tvChart', series) }catch(e){ /* ignore if library missing */ }
}

document.addEventListener('DOMContentLoaded', async ()=>{
  applySavedTheme()
  const container = document.getElementById('stocks')
  const search = document.getElementById('search')
  const tagFilter = document.getElementById('tagFilter')
  const themeToggle = document.getElementById('themeToggle')
  if(themeToggle){
    // initialize pressed state and title
    themeToggle.setAttribute('aria-pressed', String(document.documentElement.classList.contains('light')))
    themeToggle.title = document.documentElement.classList.contains('light') ? 'Switch to dark' : 'Switch to light'
    themeToggle.addEventListener('click', ()=>{ toggleTheme(); const isLight = document.documentElement.classList.contains('light'); themeToggle.setAttribute('aria-pressed', String(isLight)); themeToggle.title = isLight ? 'Switch to dark' : 'Switch to light' })
  }

  // skeletons while loading
  container.innerHTML = ''
  for(let i=0;i<6;i++){ const s = document.createElement('div'); s.className='skeleton'; container.appendChild(s) }
  let stocks = await loadStocks()
  function redraw(){
    const q = search ? search.value : ''
    const tag = tagFilter ? tagFilter.value : ''
    container.innerHTML = ''
    const list = applyFilter(stocks, q, tag)
    if(list.length===0){ container.innerHTML = '<div class="small" style="padding:12px;color:var(--muted)">No signals found</div>'; return }
    for(const s of list){ container.appendChild(renderStockCard(s)) }
  }
  populateTagFilterUI(stocks)
  if(search) search.addEventListener('input', redraw)
  if(tagFilter) tagFilter.addEventListener('change', redraw)
  // detail modal handled by top-level `openDetail()`
  const closeBtn = document.getElementById('detailClose')
  const modalRoot = document.getElementById('detailModal')
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ if(modalRoot) modalRoot.style.display='none' })
  if(modalRoot) modalRoot.addEventListener('click', (e)=>{ if(e.target===modalRoot) modalRoot.style.display='none' })

  redraw()
})
