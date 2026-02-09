const STOCKS_URL = './signals.json'
const CLOSED_TRADES_URL = './closed_trades.json'

// global stocks array so top-level functions like `openDetail` can access it
let stocks = []
let closedTrades = []
const ACHIEVEMENTS = [
  { cycle: 'Cycle 1', total: 83000, profit: 61000 },
  { cycle: 'Cycle 2', total: 166000, profit: 141000 },
  { cycle: 'Cycle 4', total: 525000, profit: 500000 }
]

async function loadStocks(){
  try{
    const res = await fetch(STOCKS_URL,{cache:'no-store'})
    if(!res.ok) throw new Error('Failed to load')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }catch(e){console.error(e);return []}
}

async function loadClosedTrades(){
  try{
    const res = await fetch(CLOSED_TRADES_URL,{cache:'no-store'})
    if(!res.ok) throw new Error('Failed to load')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }catch(e){console.error(e);return []}
}

function formatMoney(v){ if(v==null||v==='') return '-'; return typeof v==='number' ? v.toFixed(2) : v }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function formatNotesHtml(s){ return escapeHtml(s).replace(/\n/g, '<br>') }
function formatConfidence(v){
  if(typeof v !== 'number' || !Number.isFinite(v)) return '0'
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

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
// lightweight-charts helpers removed — modal now shows structured signal info only

function renderStockCard(s){
  const el = document.createElement('div'); el.className='card'; el.tabIndex=0; el.role='button'
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div>
        <div class="ticker">${escapeHtml(s.ticker)} <span class="small">${escapeHtml(s.exchange||'')}</span></div>
        <div class="name">${escapeHtml(s.name||'')}</div>
      </div>
      <div class="confidence" aria-label="Confidence score">
        <div class="confidence-label">Confidence</div>
        <div class="confidence-value">${formatConfidence(s.confidence_score)}/100</div>
      </div>
    </div>
    <div class="meta">
      <div class="small">${escapeHtml(s.action || s.type || '')} ${s.buy_amount ?? ''} @ <span class="price">${formatMoney(s.buy_price)}</span></div>
      <div class="small">${formatNotesHtml(s.notes||'')}</div>
    </div>
  `
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

function sortSignalsByRecent(list){
  return list.slice().sort((a,b)=>{
    const ad = a && a.created_at ? new Date(a.created_at).getTime() : 0
    const bd = b && b.created_at ? new Date(b.created_at).getTime() : 0
    if(Number.isNaN(ad) && Number.isNaN(bd)) return 0
    if(Number.isNaN(ad)) return 1
    if(Number.isNaN(bd)) return -1
    return bd - ad
  })
}

function sortSignals(list, key){
  const out = list.slice()
  if(key === 'oldest') return sortSignalsByRecent(out).reverse()
  if(key === 'name_az'){
    return out.sort((a,b)=> String(a.name || a.ticker || '').localeCompare(String(b.name || b.ticker || '')))
  }
  if(key === 'price_desc'){
    return out.sort((a,b)=> (Number(b.buy_price)||0) - (Number(a.buy_price)||0))
  }
  if(key === 'price_asc'){
    return out.sort((a,b)=> (Number(a.buy_price)||0) - (Number(b.buy_price)||0))
  }
  if(key === 'confidence_desc'){
    return out.sort((a,b)=> (Number(b.confidence_score)||0) - (Number(a.confidence_score)||0))
  }
  return sortSignalsByRecent(out)
}

function applySavedNeon(){
  const n = localStorage.getItem('neon')
  if(n === 'on') document.documentElement.classList.add('neon')
  else document.documentElement.classList.remove('neon')
}

function toggleNeon(){
  const isNeon = document.documentElement.classList.toggle('neon')
  localStorage.setItem('neon', isNeon ? 'on' : 'off')
}

function formatUsd(amount){
  if(typeof amount !== 'number') return '-'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatUsdFixed(amount){
  if(typeof amount !== 'number') return '-'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function formatSignedUsd(amount){
  if(typeof amount !== 'number') return '-'
  const sign = amount < 0 ? '-' : '+'
  const abs = Math.abs(amount)
  return sign + abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function formatSignedPct(pct){
  if(typeof pct !== 'number') return '-'
  const sign = pct < 0 ? '-' : '+'
  return sign + Math.abs(pct).toFixed(2) + '%'
}

function getClosedView(){
  return localStorage.getItem('closed_view') || 'usd'
}

function setClosedView(view){
  localStorage.setItem('closed_view', view)
  const btn = document.getElementById('closedViewToggle')
  if(btn){
    btn.setAttribute('aria-pressed', String(view === 'pct'))
    btn.classList.toggle('is-pct', view === 'pct')
    btn.classList.toggle('is-usd', view === 'usd')
  }
}

function renderAchievements(){
  const list = document.getElementById('achList')
  const summary = document.getElementById('achSummary')
  if(!list || !summary) return
  list.innerHTML = ''
  const totalProfit = ACHIEVEMENTS.reduce((sum, a) => sum + (a.profit || 0), 0)
  const best = ACHIEVEMENTS.slice().sort((a,b)=> (b.total||0) - (a.total||0))[0]
  summary.innerHTML = `
    <div>Cycles: <strong>${ACHIEVEMENTS.length}</strong></div>
    <div>Total Profit: <strong>${formatUsd(totalProfit)}</strong></div>
    <div>Best Finish: <strong>${best ? best.cycle : '-'}</strong></div>
  `
  for(const a of ACHIEVEMENTS){
    const row = document.createElement('div')
    row.className = 'ach-item'
    row.innerHTML = `
      <div>
        <div class="label">${escapeHtml(a.cycle)}</div>
        <div class="ach-profit">Profit: ${formatUsd(a.profit)}</div>
      </div>
      <div class="ach-amount">${formatUsd(a.total)}</div>
    `
    list.appendChild(row)
  }
}

function applyClosedFilter(list, q){
  if(!q) return list
  const needle = q.trim().toLowerCase()
  return list.filter(t => {
    return (t.ticker||'').toLowerCase().includes(needle) ||
      (t.name||'').toLowerCase().includes(needle) ||
      (t.notes||'').toLowerCase().includes(needle)
  })
}

function sortClosedTrades(list, key){
  const out = list.slice()
  if(key === 'profit_asc') out.sort((a,b)=> (a.profit||0) - (b.profit||0))
  else if(key === 'profit_desc') out.sort((a,b)=> (b.profit||0) - (a.profit||0))
  else if(key === 'value_az') out.sort((a,b)=> {
    const av = (a.name || a.ticker || '').toString()
    const bv = (b.name || b.ticker || '').toString()
    return av.localeCompare(bv)
  })
  else if(key === 'value_za') out.sort((a,b)=> {
    const av = (a.name || a.ticker || '').toString()
    const bv = (b.name || b.ticker || '').toString()
    return bv.localeCompare(av)
  })
  return out
}

function renderClosedTrades(){
  const listEl = document.getElementById('closedList')
  const summaryEl = document.getElementById('closedSummary')
  if(!listEl) return
  const q = document.getElementById('closedSearch') ? document.getElementById('closedSearch').value : ''
  const sortKey = document.getElementById('closedSort') ? document.getElementById('closedSort').value : 'profit_desc'
  const filtered = applyClosedFilter(closedTrades, q)
  const sorted = sortClosedTrades(filtered, sortKey)
  listEl.innerHTML = ''
  if(summaryEl){
    const view = getClosedView()
    const now = new Date()
    const msDay = 24 * 60 * 60 * 1000
    const buckets = [
      { label: '1d', days: 1 },
      { label: '3d', days: 3 },
      { label: '7d', days: 7 },
      { label: '1m', days: 30 },
      { label: '3m', days: 90 },
      { label: '1y', days: 365 }
    ]
    const parts = buckets.map(b => {
      const cutoff = new Date(now.getTime() - b.days * msDay)
      const acc = closedTrades.reduce((out, t) => {
        if(!t.closed_at) return out
        const d = new Date(t.closed_at)
        if(Number.isNaN(d.getTime())) return out
        if(d >= cutoff){
          const profit = typeof t.profit === 'number' ? t.profit : ((t.close_price!=null && t.buy_price!=null && t.buy_amount!=null) ? (t.close_price - t.buy_price) * t.buy_amount : 0)
          const cost = (t.buy_price!=null && t.buy_amount!=null) ? (t.buy_price * t.buy_amount) : 0
          return { profit: out.profit + (profit || 0), cost: out.cost + (cost || 0) }
        }
        return out
      }, { profit: 0, cost: 0 })
      const value = (view === 'pct') ? (acc.cost ? (acc.profit / acc.cost) * 100 : null) : acc.profit
      const text = (view === 'pct') ? formatSignedPct(value) : formatSignedUsd(value)
      const color = (value != null && value < 0) ? 'var(--profit-neg)' : 'var(--profit-pos)'
      return `<span>${b.label}: <strong style="color:${color}">${text}</strong></span>`
    })
    summaryEl.innerHTML = `Total Profit/Loss from last: ${parts.join(' &nbsp; ')}`
  }
  if(sorted.length === 0){
    listEl.innerHTML = '<div class="small" style="padding:12px;color:var(--muted)">No closed trades found</div>'
    return
  }
  for(const t of sorted){
    const profit = typeof t.profit === 'number' ? t.profit : ((t.close_price!=null && t.buy_price!=null && t.buy_amount!=null) ? (t.close_price - t.buy_price) * t.buy_amount : null)
    const profitColor = (profit != null && profit < 0) ? 'var(--profit-neg)' : 'var(--profit-pos)'
    const profitPct = (t.close_price!=null && t.buy_price!=null && t.buy_price !== 0) ? ((t.close_price - t.buy_price) / t.buy_price) * 100 : null
    const profitPctText = profitPct!=null ? formatSignedPct(profitPct) : ''
    const view = getClosedView()
    const profitDisplay = view === 'pct' ? (profitPctText || '-') : (profit!=null ? formatSignedUsd(profit) : '-')
    const row = document.createElement('div')
    row.className = 'closed-item'
    row.tabIndex = 0
    row.role = 'button'
    row.innerHTML = `
      <div>
        <div class="ticker">${escapeHtml(t.ticker||'')} <span class="small">${escapeHtml(t.exchange||'')}</span></div>
        <div class="name">${escapeHtml(t.name||'')}</div>
        <div class="closed-meta small">
          <div>Opened: ${t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}</div>
          <div>Closed: ${t.closed_at ? new Date(t.closed_at).toLocaleDateString() : '-'}</div>
          <div>Shares: ${t.buy_amount ?? '-'}</div>
          <div>Open: ${t.buy_price!=null ? formatUsdFixed(t.buy_price) : '-'}</div>
          <div>Close: ${t.close_price!=null ? formatUsdFixed(t.close_price) : '-'}</div>
        </div>
      </div>
      <div class="closed-profit" style="color:${profitColor}">${profitDisplay}</div>
    `
    row.addEventListener('click', ()=> openDetail(t, 'closed'))
    row.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t, 'closed') } })
    listEl.appendChild(row)
  }
}

function setActiveTab(tab){
  const panels = document.querySelectorAll('.tab-panel')
  const tabs = document.querySelectorAll('.tab')
  for(const p of panels){
    const isTarget = p.id === `tab-${tab}`
    if(isTarget){
      p.classList.add('show')
    } else {
      p.classList.remove('show')
    }
  }
  for(const t of tabs){
    const isActive = t.dataset.tab === tab
    t.classList.toggle('active', isActive)
    t.setAttribute('aria-selected', String(isActive))
  }
  const search = document.getElementById('search')
  const tagFilter = document.getElementById('tagFilter')
  const closedSearch = document.getElementById('closedSearch')
  const closedSort = document.getElementById('closedSort')
  if(search) search.style.display = (tab === 'signals') ? '' : 'none'
  if(tagFilter) tagFilter.style.display = (tab === 'signals') ? '' : 'none'
  if(closedSearch) closedSearch.style.display = (tab === 'closed') ? '' : 'none'
  if(closedSort) closedSort.style.display = (tab === 'closed') ? '' : 'none'
}

// Open detail modal (top-level so other functions can call it)
async function openDetail(stockOrTicker, source='signals'){
  const modal = document.getElementById('detailModal')
  if(!modal) return
  // normalize symbol
  const sym = typeof stockOrTicker === 'string' ? stockOrTicker : (stockOrTicker && stockOrTicker.ticker) ? stockOrTicker.ticker : ''
  if(!sym) return
  modal.style.display = 'flex'
  requestAnimationFrame(()=> modal.classList.add('show'))
  document.body.classList.add('modal-open')
  // Render signal details from the stocks array / passed-in symbol
  const s = (typeof stockOrTicker === 'object' && stockOrTicker) ? stockOrTicker : (source === 'closed' ? (closedTrades.find(x => (x.ticker||'') === sym) || {}) : (stocks.find(x => (x.ticker||'') === sym) || {}))
  const setText = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = (v==null || v==='') ? '-' : String(v) }
  const setHtml = (id, v) => { const el = document.getElementById(id); if(el) el.innerHTML = (v==null || v==='') ? '-' : formatNotesHtml(v) }
  setText('d_ticker', s.ticker || sym)
  setText('d_exchange', s.exchange || '')
  setText('d_name', s.name || '')
  setText('d_buy_price', typeof s.buy_price === 'number' ? s.buy_price.toFixed(2) : (s.buy_price||'-'))
  setText('d_buy_amount', s.buy_amount ?? '-')
  setText('d_expected_profit', s.expected_profit != null ? (typeof s.expected_profit === 'number' ? s.expected_profit + '%' : s.expected_profit) : '-')
  setText('d_max_risk', s.max_risk != null ? (typeof s.max_risk === 'number' ? s.max_risk + '%' : s.max_risk) : '-')
  setText('d_target_price', s.target_price != null ? (typeof s.target_price === 'number' ? s.target_price.toFixed(2) : s.target_price) : '-')
  setText('d_stop_loss', s.stop_loss != null ? (typeof s.stop_loss === 'number' ? s.stop_loss.toFixed(2) : s.stop_loss) : '-')
  setText('d_confidence', s.confidence_score != null ? (formatConfidence(Number(s.confidence_score)) + '/100') : '0/100')
  setText('d_created_at', s.created_at ? new Date(s.created_at).toLocaleString() : '-')
  setText('d_close_price', s.close_price != null ? (typeof s.close_price === 'number' ? s.close_price.toFixed(2) : s.close_price) : '-')
  setText('d_closed_at', s.closed_at ? new Date(s.closed_at).toLocaleString() : '-')
  const view = getClosedView()
  const pct = (s.close_price!=null && s.buy_price!=null && s.buy_price !== 0) ? ((s.close_price - s.buy_price) / s.buy_price) * 100 : null
  const profitText = (view === 'pct') ? (pct!=null ? formatSignedPct(pct) : '-') : (s.profit != null ? (typeof s.profit === 'number' ? formatSignedUsd(s.profit) : s.profit) : '-')
  setText('d_profit', profitText)
  setHtml('d_notes', s.notes || '')
}

document.addEventListener('DOMContentLoaded', async ()=>{
  applySavedTheme()
  applySavedNeon()
  const container = document.getElementById('stocks')
  const search = document.getElementById('search')
  const tagFilter = document.getElementById('tagFilter')
  const closedSearch = document.getElementById('closedSearch')
  const closedSort = document.getElementById('closedSort')
  const closedViewToggle = document.getElementById('closedViewToggle')
  const sortSignalsSelect = document.getElementById('sortSignals')
  const tabs = document.querySelectorAll('.tab')
  const themeToggle = document.getElementById('themeToggle')
  const neonToggle = document.getElementById('neonToggle')
  if(themeToggle){
    // initialize pressed state and title
    themeToggle.setAttribute('aria-pressed', String(document.documentElement.classList.contains('light')))
    themeToggle.title = document.documentElement.classList.contains('light') ? 'Switch to dark' : 'Switch to light'
    themeToggle.addEventListener('click', ()=>{ toggleTheme(); const isLight = document.documentElement.classList.contains('light'); themeToggle.setAttribute('aria-pressed', String(isLight)); themeToggle.title = isLight ? 'Switch to dark' : 'Switch to light' })
  }

  // skeletons while loading
  container.innerHTML = ''
  for(let i=0;i<6;i++){ const s = document.createElement('div'); s.className='skeleton'; container.appendChild(s) }
  stocks = await loadStocks()
  closedTrades = await loadClosedTrades()
  function redraw(){
    const q = search ? search.value : ''
    const tag = tagFilter ? tagFilter.value : ''
    const sortKey = sortSignalsSelect ? sortSignalsSelect.value : 'newest'
    container.innerHTML = ''
    const list = sortSignals(applyFilter(stocks, q, tag), sortKey)
    if(list.length===0){ container.innerHTML = '<div class="small" style="padding:12px;color:var(--muted)">No signals found</div>'; return }
    for(const s of list){ container.appendChild(renderStockCard(s)) }
  }
  if(neonToggle){
    neonToggle.setAttribute('aria-pressed', String(document.documentElement.classList.contains('neon')))
    neonToggle.title = document.documentElement.classList.contains('neon') ? 'Disable neon' : 'Enable neon'
    neonToggle.addEventListener('click', ()=>{ toggleNeon(); const isNeon = document.documentElement.classList.contains('neon'); neonToggle.setAttribute('aria-pressed', String(isNeon)); neonToggle.title = isNeon ? 'Disable neon' : 'Enable neon' })
  }
  populateTagFilterUI(stocks)
  if(search) search.addEventListener('input', redraw)
  if(tagFilter) tagFilter.addEventListener('change', redraw)
  if(sortSignalsSelect) sortSignalsSelect.addEventListener('change', redraw)
  if(closedSearch) closedSearch.addEventListener('input', renderClosedTrades)
  if(closedSort) closedSort.addEventListener('change', renderClosedTrades)
  if(closedViewToggle) closedViewToggle.addEventListener('click', ()=>{
    const next = getClosedView() === 'usd' ? 'pct' : 'usd'
    setClosedView(next)
    renderClosedTrades()
  })
  // detail modal handled by top-level `openDetail()`
  const closeBtn = document.getElementById('detailClose')
  const modalRoot = document.getElementById('detailModal')
  if(closeBtn) closeBtn.addEventListener('click', ()=>{
    if(modalRoot){
      modalRoot.classList.remove('show')
      setTimeout(()=>{ modalRoot.style.display='none' }, 260)
    }
  })
  if(modalRoot) modalRoot.addEventListener('click', (e)=>{
    if(e.target===modalRoot){
      modalRoot.classList.remove('show')
      setTimeout(()=>{ modalRoot.style.display='none' }, 260)
    }
  })

  setClosedView(getClosedView())
  redraw()
  renderAchievements()
  renderClosedTrades()
  setActiveTab('signals')
  for(const t of tabs){
    t.addEventListener('click', ()=> setActiveTab(t.dataset.tab))
  }
})
