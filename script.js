const STOCKS_URL = './signals.json'
const CLOSED_TRADES_URL = './closed_trades.json'

function formatMoney(v){ if(v==null||v==='') return '-'; return typeof v==='number' ? v.toFixed(2) : v }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function formatNotesHtml(s){ return escapeHtml(s).replace(/\n/g, '<br>') }

// Theme handling
function applySavedTheme(){
  const t = localStorage.getItem('theme')
  if(t === 'light') document.documentElement.classList.add('light')
  else document.documentElement.classList.remove('light')
}
function toggleTheme(){
  document.documentElement.classList.add('theme-fade')
  const isLight = document.documentElement.classList.toggle('light')
  localStorage.setItem('theme', isLight ? 'light' : 'dark')
  // keep fade class a bit longer than CSS transition
  setTimeout(()=> document.documentElement.classList.remove('theme-fade'), 620)
}

// sparkline helpers (same approach as viewer)
function seededRandom(seed){
  let h = 2166136261 >>> 0
  for(let i=0;i<seed.length;i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  return function(){ h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967295 }
}
function seriesForTicker(ticker, n=20){ const rng = seededRandom(String(ticker||'').toUpperCase()); const base = 50 + Math.floor(rng()*40); const out=[]; for(let i=0;i<n;i++) out.push(base + (rng()-0.5)*6); return out }
function drawSparkline(canvas, values, color='#00d1ff'){
  if(!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio||1)
  const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio||1)
  ctx.clearRect(0,0,w,h)
  if(!values || values.length===0) return
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  ctx.beginPath(); ctx.lineWidth = 2 * (window.devicePixelRatio||1); ctx.strokeStyle = color; values.forEach((v,i)=>{ const x=(i/(values.length-1))*w; const y = h - ((v-min)/range)*h; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y) }); ctx.stroke()
}

async function loadStocks(){
  try{
    const res = await fetch(STOCKS_URL,{cache:'no-store'})
    if(!res.ok) throw new Error('Failed to load')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }catch(e){console.error(e);return []}
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
    list = list.filter(s => (s.ticker||'').toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q))
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

function renderStockCard(s, idx, onOpen){
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
      <div class="small">Buy ${s.buy_amount ?? ''} @ <span class="price">${formatMoney(s.buy_price)}</span></div>
      <div class="small">${formatNotesHtml(s.notes||'')}</div>
    </div>
  `
  setTimeout(()=>{ const c = el.querySelector('canvas.sparkline'); if(c) drawSparkline(c, seriesForTicker(s.ticker), getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#00d1ff') },0)
  el.addEventListener('click', ()=> onOpen(idx))
  return el
}

function renderClosedCard(t, idx, onOpen){
  const profit = (t.close_price!=null && t.buy_price!=null && t.buy_amount!=null) ? (t.close_price - t.buy_price) * t.buy_amount : null
  const profitColor = (profit != null && profit < 0) ? 'rgba(255,80,80,0.9)' : 'var(--accent)'
  const signedProfit = (profit != null) ? ((profit < 0 ? '-' : '+') + Math.abs(profit).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })) : '-'
  const el = document.createElement('div'); el.className='card'; el.tabIndex=0; el.role='button'
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div>
        <div class="ticker">${escapeHtml(t.ticker)} <span class="small">${escapeHtml(t.exchange||'')}</span></div>
        <div class="name">${escapeHtml(t.name||'')}</div>
      </div>
      <div class="small" style="color:${profitColor}">${signedProfit}</div>
    </div>
    <div class="meta">
      <div class="small">Open ${formatMoney(t.buy_price)} â†’ Close ${formatMoney(t.close_price)}</div>
      <div class="small">${formatNotesHtml(t.notes||'')}</div>
    </div>
  `
  el.addEventListener('click', ()=> onOpen(idx))
  return el
}

async function loadClosedTrades(){
  try{
    const res = await fetch(CLOSED_TRADES_URL,{cache:'no-store'})
    if(!res.ok) throw new Error('Failed to load')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }catch(e){console.error(e);return []}
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const container = document.getElementById('stocks')
  const closedContainer = document.getElementById('closedTrades')
  const search = document.getElementById('search')
  const addBtn = document.getElementById('addBtn')
  const importBtn = document.getElementById('importBtn')
  const exportBtn = document.getElementById('exportBtn')
  const importFile = document.getElementById('importFile')
  const testToggle = document.getElementById('testToggle')

  applySavedTheme()
  const themeToggle = document.getElementById('themeToggle')
  if(themeToggle){
    themeToggle.setAttribute('aria-pressed', String(document.documentElement.classList.contains('light')))
    themeToggle.title = document.documentElement.classList.contains('light') ? 'Switch to dark' : 'Switch to light'
    themeToggle.addEventListener('click', ()=>{ toggleTheme(); const isLight = document.documentElement.classList.contains('light'); themeToggle.setAttribute('aria-pressed', String(isLight)); themeToggle.title = isLight ? 'Switch to dark' : 'Switch to light' })
  }

  const modal = document.getElementById('modal')
  const modalTitle = document.getElementById('modalTitle')
  const m_ticker = document.getElementById('m_ticker')
  const m_exchange = document.getElementById('m_exchange')
  const m_name = document.getElementById('m_name')
  const m_buy_price = document.getElementById('m_buy_price')
  const m_expected_profit = document.getElementById('m_expected_profit')
  const m_max_risk = document.getElementById('m_max_risk')
  const m_target_price = document.getElementById('m_target_price')
  const m_stop_loss = document.getElementById('m_stop_loss')
  const m_buy_amount = document.getElementById('m_buy_amount')
  const m_action = document.getElementById('m_action')
  const m_created_at = document.getElementById('m_created_at')
  const m_notes = document.getElementById('m_notes')
  const m_close_price = document.getElementById('m_close_price')
  const m_closed_at = document.getElementById('m_closed_at')
  const m_profit = document.getElementById('m_profit')
  const m_cancel = document.getElementById('m_cancel')
  const m_save = document.getElementById('m_save')
  const m_delete = document.getElementById('m_delete')
  const m_close = document.getElementById('m_close')
  const m_duplicate = document.getElementById('m_duplicate')

  const closeModalEl = document.getElementById('closeModal')
  const closeDateInput = document.getElementById('close_date')
  const closePriceInput = document.getElementById('close_price')
  const closeCancel = document.getElementById('close_cancel')
  const closeConfirm = document.getElementById('close_confirm')

  let stocks = await loadStocks()
  let closedTrades = await loadClosedTrades()
  let editingIndex = null
  let editingList = 'signals'
  let testMode = false

  if(testToggle){
    testMode = testToggle.checked
    testToggle.addEventListener('change', ()=>{ testMode = testToggle.checked })
  }
  // admin lock: optional. If `window.ADMIN_HASH` is set (hex SHA-256), require password to unlock.
  function hexFromBuffer(buf){
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
  }

  async function sha256Hex(msg){
    const enc = new TextEncoder().encode(msg)
    const hash = await crypto.subtle.digest('SHA-256', enc)
    return hexFromBuffer(hash)
  }

  async function ensureAdmin(){
    // if no admin hash configured, allow by default
    if(!window.ADMIN_HASH) return true
    if(sessionStorage.getItem('admin_unlocked') === '1') return true
    const pw = prompt('Enter editor password')
    if(!pw) return false
    try{
      const h = await sha256Hex(pw)
      if(h === (window.ADMIN_HASH||'').toLowerCase()){
        sessionStorage.setItem('admin_unlocked','1')
        return true
      }
    }catch(e){console.error(e)}
    alert('Invalid password')
    return false
  }

  const tagFilter = document.getElementById('tagFilter')
  const tabs = document.querySelectorAll('.tab')
  let activeTab = 'signals'

  function redrawSignals(){
    const q = search.value
    const tag = tagFilter ? tagFilter.value : ''
    container.innerHTML = ''
    const list = applyFilter(stocks, q, tag)
    if(list.length===0){ container.innerHTML = '<div class="small" style="padding:12px;color:var(--muted)">No signals found</div>'; return }
    list.forEach((s)=>{
      const origIndex = stocks.indexOf(s)
      container.appendChild(renderStockCard(s, origIndex, openEdit))
    })
    populateTagFilterUI(stocks)
  }

  function redrawClosed(){
    if(!closedContainer) return
    const q = search.value
    closedContainer.innerHTML = ''
    const list = applyFilter(closedTrades, q, '')
    if(list.length===0){ closedContainer.innerHTML = '<div class="small" style="padding:12px;color:var(--muted)">No closed trades found</div>'; return }
    list.forEach((t)=>{
      const origIndex = closedTrades.indexOf(t)
      closedContainer.appendChild(renderClosedCard(t, origIndex, openClosedEdit))
    })
  }

  function setActiveTab(tab){
    activeTab = tab
    const panels = document.querySelectorAll('.tab-panel')
    for(const p of panels) p.classList.toggle('active', p.id === `tab-${tab}`)
    for(const t of tabs){
      const isActive = t.dataset.tab === tab
      t.classList.toggle('active', isActive)
      t.setAttribute('aria-selected', String(isActive))
    }
    // tag filter only relevant for signals
    if(tagFilter) tagFilter.style.display = (tab === 'signals') ? '' : 'none'
    if(tab === 'signals') redrawSignals()
    else redrawClosed()
  }

  function openEdit(idx){
    editingIndex = idx
    editingList = 'signals'
    const s = stocks[idx] || {}
    modalTitle.textContent = s.ticker ? `Edit ${s.ticker}` : 'Add Signal'
    m_ticker.value = s.ticker || ''
    m_exchange.value = s.exchange || ''
    m_name.value = s.name || ''
    m_buy_price.value = s.buy_price ?? ''
    m_expected_profit.value = s.expected_profit ?? ''
    m_max_risk.value = s.max_risk ?? ''
    m_target_price.value = s.target_price ?? ''
    m_stop_loss.value = s.stop_loss ?? ''
    m_buy_amount.value = s.buy_amount ?? ''
    m_action.value = s.action || s.type || s.side || 'buy'
    // convert ISO created_at to datetime-local value
    m_created_at.value = s.created_at ? new Date(s.created_at).toISOString().slice(0,16) : ''
    m_notes.value = s.notes || ''
    if(m_close_price) m_close_price.value = s.close_price ?? ''
    if(m_closed_at) m_closed_at.value = s.closed_at ? new Date(s.closed_at).toISOString().slice(0,16) : ''
    if(m_profit) m_profit.value = s.profit ?? ''
    m_delete.style.display = s.ticker ? 'inline-block' : 'none'
    if(m_close) m_close.style.display = s.ticker ? 'inline-block' : 'none'
    if(m_duplicate) m_duplicate.style.display = s.ticker ? 'inline-block' : 'none'
    modal.style.display = 'flex'
    setTimeout(()=> m_ticker.focus(), 50)
  }

  function openClosedEdit(idx){
    editingIndex = idx
    editingList = 'closed'
    const s = closedTrades[idx] || {}
    modalTitle.textContent = s.ticker ? `Edit ${s.ticker}` : 'Edit Closed Trade'
    m_ticker.value = s.ticker || ''
    m_exchange.value = s.exchange || ''
    m_name.value = s.name || ''
    m_buy_price.value = s.buy_price ?? ''
    m_expected_profit.value = s.expected_profit ?? ''
    m_max_risk.value = s.max_risk ?? ''
    m_target_price.value = s.target_price ?? ''
    m_stop_loss.value = s.stop_loss ?? ''
    m_buy_amount.value = s.buy_amount ?? ''
    m_action.value = s.action || s.type || s.side || 'buy'
    m_created_at.value = s.created_at ? new Date(s.created_at).toISOString().slice(0,16) : ''
    m_notes.value = s.notes || ''
    if(m_close_price) m_close_price.value = s.close_price ?? ''
    if(m_closed_at) m_closed_at.value = s.closed_at ? new Date(s.closed_at).toISOString().slice(0,16) : ''
    if(m_profit) m_profit.value = s.profit ?? ''
    m_delete.style.display = s.ticker ? 'inline-block' : 'none'
    if(m_close) m_close.style.display = 'none'
    if(m_duplicate) m_duplicate.style.display = s.ticker ? 'inline-block' : 'none'
    modal.style.display = 'flex'
    setTimeout(()=> m_ticker.focus(), 50)
  }

  function closeModal(){ editingIndex = null; modal.style.display = 'none' }
  function closeCloseModal(){ if(closeModalEl) closeModalEl.style.display = 'none' }

  function saveFromForm(){
    const rec = {
      ticker: (m_ticker.value||'').toUpperCase(),
      exchange: m_exchange.value||'',
      name: m_name.value||'',
      buy_price: m_buy_price.value ? Number(m_buy_price.value) : null,
      expected_profit: m_expected_profit.value ? Number(m_expected_profit.value) : null,
      max_risk: m_max_risk.value ? Number(m_max_risk.value) : null,
      target_price: m_target_price.value ? Number(m_target_price.value) : null,
      stop_loss: m_stop_loss.value ? Number(m_stop_loss.value) : null,
      buy_amount: m_buy_amount.value ? Number(m_buy_amount.value) : null,
      action: m_action ? m_action.value : 'buy',
      notes: m_notes.value||'',
      // if datetime-local provided, convert to ISO; otherwise current time
      created_at: m_created_at && m_created_at.value ? new Date(m_created_at.value).toISOString() : new Date().toISOString(),
      close_price: m_close_price && m_close_price.value ? Number(m_close_price.value) : null,
      closed_at: m_closed_at && m_closed_at.value ? new Date(m_closed_at.value).toISOString() : null,
      profit: m_profit && m_profit.value ? Number(m_profit.value) : null
    }
    if(!rec.ticker){ alert('Ticker is required'); return }
    const list = (editingList === 'closed') ? closedTrades : stocks
    if(editingIndex!=null && list[editingIndex]){
      list[editingIndex] = Object.assign({}, list[editingIndex], rec)
    } else {
      // prevent duplicates
      const exists = list.find(s => (s.ticker||'').toUpperCase() === rec.ticker)
      if(exists){ alert('Ticker already exists; edit it instead'); return }
      list.push(rec)
    }
    closeModal(); (activeTab === 'signals') ? redrawSignals() : redrawClosed()
  }

  function deleteCurrent(){
    if(editingIndex==null) return
    const ok = confirm('Remove this item?')
    if(!ok) return
    const list = (editingList === 'closed') ? closedTrades : stocks
    list.splice(editingIndex, 1)
    closeModal(); (activeTab === 'signals') ? redrawSignals() : redrawClosed()
  }

  function duplicateCurrent(){
    if(editingIndex==null) return
    const list = (editingList === 'closed') ? closedTrades : stocks
    const s = list[editingIndex]
    if(!s) return
    const copy = Object.assign({}, s)
    list.push(copy)
    closeModal(); (activeTab === 'signals') ? redrawSignals() : redrawClosed()
  }

  async function closeCurrent(){
    if(editingIndex==null) return
    if(editingList !== 'signals') return
    if(!(await ensureAdmin())) return
    const s = stocks[editingIndex]
    if(!s) return
    if(!s.buy_amount || !s.buy_price){
      alert('Close requires a buy price and buy amount.')
      return
    }
    if(closeDateInput){
      const today = new Date().toISOString().slice(0,10)
      closeDateInput.value = today
    }
    if(closePriceInput){
      closePriceInput.value = (s.buy_price != null) ? String(s.buy_price) : ''
    }
    if(closeModalEl) closeModalEl.style.display = 'flex'
  }

  async function confirmClose(){
    if(editingIndex==null) return
    const s = stocks[editingIndex]
    if(!s) return
    const dateStr = closeDateInput ? closeDateInput.value : ''
    if(!dateStr){ alert('Please select a close date.'); return }
    const manual = closePriceInput ? closePriceInput.value : ''
    if(!manual){ alert('Please enter a close price.'); return }
    const closePrice = Number(manual)
    if(!Number.isFinite(closePrice)){ alert('Invalid close price'); return }
    const profit = (closePrice - s.buy_price) * s.buy_amount
    const closedAtIso = new Date(`${dateStr}T00:00:00Z`).toISOString()
    const record = Object.assign({}, s, {
      closed_at: closedAtIso,
      close_price: closePrice,
      profit: profit
    })
    closedTrades.push(record)
    if(!testMode) stocks.splice(editingIndex, 1)
    closeCloseModal()
    closeModal()
    (activeTab === 'signals') ? redrawSignals() : redrawClosed()
  }

  function exportJSON(){
    const blob = new Blob([JSON.stringify(stocks, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'signals.json'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  // Attempt to write to a local file using File System Access API (available on secure origins / localhost)
  async function pushToFile(){
    const content = JSON.stringify(stocks, null, 2)
    const closedContent = JSON.stringify(closedTrades, null, 2)
    // If a default directory handle is stored, try to write directly there
    try{
      const dir = await getStoredHandle('default-dir')
      if(dir){
        const fh = await dir.getFileHandle('signals.json', {create:true})
        const writable = await fh.createWritable()
        await writable.write(content)
        await writable.close()
        const fhClosed = await dir.getFileHandle('closed_trades.json', {create:true})
        const writableClosed = await fhClosed.createWritable()
        await writableClosed.write(closedContent)
        await writableClosed.close()
        alert('signals.json written successfully to default folder')
        return
      }
    }catch(e){ console.error('write to default dir failed', e) }

    // Prefer directory picker to write both files
    if(window.showDirectoryPicker){
      try{
        const dir = await window.showDirectoryPicker()
        const fh = await dir.getFileHandle('signals.json', {create:true})
        const writable = await fh.createWritable()
        await writable.write(content)
        await writable.close()
        const fhClosed = await dir.getFileHandle('closed_trades.json', {create:true})
        const writableClosed = await fhClosed.createWritable()
        await writableClosed.write(closedContent)
        await writableClosed.close()
        alert('signals.json and closed_trades.json written successfully')
        return
      }catch(e){ console.error(e); alert('Failed to write file: '+(e.message||e)) }
    }

    // Fallback: export as download
    exportJSON()
    const blob = new Blob([closedContent], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'closed_trades.json'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    alert('File downloads started as fallback. Save them to overwrite signals.json and closed_trades.json in your repo.')
  }

  // --- IndexedDB helpers for storing file handles ---
  function openDB(){
    return new Promise((res, rej)=>{
      const r = indexedDB.open('loki-file-handles', 1)
      r.onupgradeneeded = ()=> r.result.createObjectStore('handles')
      r.onsuccess = ()=> res(r.result)
      r.onerror = ()=> rej(r.error)
    })
  }

  async function storeHandle(key, handle){
    try{
      const db = await openDB()
      return new Promise((res, rej)=>{
        const tx = db.transaction('handles','readwrite')
        tx.objectStore('handles').put(handle, key)
        tx.oncomplete = ()=> res(true)
        tx.onerror = ()=> rej(tx.error)
      })
    }catch(e){ console.error('storeHandle error', e); throw e }
  }

  async function getStoredHandle(key){
    try{
      const db = await openDB()
      return new Promise((res, rej)=>{
        const tx = db.transaction('handles','readonly')
        const req = tx.objectStore('handles').get(key)
        req.onsuccess = ()=> res(req.result)
        req.onerror = ()=> rej(req.error)
      })
    }catch(e){ console.error('getStoredHandle error', e); return null }
  }

  async function clearStoredHandle(key){
    try{
      const db = await openDB()
      return new Promise((res, rej)=>{
        const tx = db.transaction('handles','readwrite')
        tx.objectStore('handles').delete(key)
        tx.oncomplete = ()=> res(true)
        tx.onerror = ()=> rej(tx.error)
      })
    }catch(e){ console.error(e) }
  }

  function importJSONFile(file){
    const r = new FileReader()
    r.onload = () => {
      try{
        const parsed = JSON.parse(r.result)
        if(!Array.isArray(parsed)) throw new Error('JSON must be an array')
        if(!confirm('Replace current signals with imported file?')) return
        stocks = parsed
        setActiveTab('signals')
      }catch(e){ alert('Failed to import JSON: '+e.message) }
    }
    r.readAsText(file)
  }

  // wire UI
  search.addEventListener('input', ()=>{ activeTab === 'signals' ? redrawSignals() : redrawClosed() })
  if(tagFilter) tagFilter.addEventListener('change', redrawSignals)
  addBtn.addEventListener('click', async ()=> {
    if(!(await ensureAdmin())) return
    editingIndex = null
    editingList = 'signals'
    m_ticker.value=''; m_exchange.value=''; m_name.value=''; m_buy_price.value=''; m_buy_amount.value='';
    if(m_action) m_action.value = 'buy'
    if(m_created_at) m_created_at.value = new Date().toISOString().slice(0,16)
    m_notes.value=''; if(m_close_price) m_close_price.value=''; if(m_closed_at) m_closed_at.value=''; if(m_profit) m_profit.value='';
    m_delete.style.display='none'; if(m_close) m_close.style.display='none'; if(m_duplicate) m_duplicate.style.display='none';
    modalTitle.textContent='Add Signal'; modal.style.display='flex'; setTimeout(()=> m_ticker.focus(),50)
  })
  m_cancel.addEventListener('click', closeModal)
  m_save.addEventListener('click', saveFromForm)
  m_delete.addEventListener('click', async ()=>{ if(await ensureAdmin()) deleteCurrent() })
  if(m_duplicate) m_duplicate.addEventListener('click', async ()=>{ if(await ensureAdmin()) duplicateCurrent() })
  if(m_close) m_close.addEventListener('click', closeCurrent)
  if(closeCancel) closeCancel.addEventListener('click', closeCloseModal)
  if(closeConfirm) closeConfirm.addEventListener('click', confirmClose)
  exportBtn.addEventListener('click', async ()=>{ if(await ensureAdmin()) exportJSON() })
  importBtn.addEventListener('click', async ()=>{ if(await ensureAdmin()) importFile.click() })
  importFile.addEventListener('change', (ev)=>{ if(ev.target.files && ev.target.files[0]) importJSONFile(ev.target.files[0]); importFile.value = '' })

  // push button (write signals.json locally)
  const pushBtn = document.getElementById('pushBtn')
  if(pushBtn){
    pushBtn.addEventListener('click', async ()=>{
      if(!(await ensureAdmin())) return
      // confirm and push
      if(!confirm('Push current changes to local signals.json and closed_trades.json files (this will prompt you to choose where to save). Continue?')) return
      await pushToFile()
    })
  }

  // set default folder button
  const setDefaultBtn = document.getElementById('setDefaultBtn')
  if(setDefaultBtn){
    setDefaultBtn.addEventListener('click', async ()=>{
      if(!(await ensureAdmin())) return
      if(!window.showDirectoryPicker){
        alert('Your browser does not support selecting a default folder. You can still use Push Changes which will prompt for a save location.')
        return
      }
      try{
        const dir = await window.showDirectoryPicker()
        await storeHandle('default-dir', dir)
        alert('Default folder saved. Future Push operations will write to that folder. You may need to grant permission if prompted.')
      }catch(e){ console.error(e); alert('Failed to set default folder: '+(e.message||e)) }
    })
  }

  // close modal on backdrop click
  modal.addEventListener('click', (e)=>{ if(e.target===modal) closeModal() })
  if(closeModalEl) closeModalEl.addEventListener('click', (e)=>{ if(e.target===closeModalEl) closeCloseModal() })

  for(const t of tabs){
    t.addEventListener('click', ()=> setActiveTab(t.dataset.tab))
  }
  setActiveTab('signals')
})
