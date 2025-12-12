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
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

function renderStockCard(s){
  const el = document.createElement('div'); el.className='card'
  el.innerHTML = `
    <div class="ticker">${escapeHtml(s.ticker)} <span class="small">${escapeHtml(s.exchange||'')}</span></div>
    <div class="name">${escapeHtml(s.name||'')}</div>
    <div class="meta">
      <div class="small">${escapeHtml(s.action || s.type || '')} ${s.buy_amount ?? ''} @ <span class="price">${formatMoney(s.buy_price)}</span></div>
      <div class="small">${escapeHtml(s.notes||'')}</div>
    </div>
  `
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

document.addEventListener('DOMContentLoaded', async ()=>{
  const container = document.getElementById('stocks')
  const search = document.getElementById('search')
  const tagFilter = document.getElementById('tagFilter')
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
  redraw()
})
