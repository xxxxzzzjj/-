'use strict'

const $ = id => document.getElementById(id)
const state = { rows: [], selected: null, queryVersion: 0 }
const endpointDefault = 'https://hundun-d0g97wc3v815cd196-1497599973.ap-shanghai.app.tcloudbase.com/license'
$('endpoint').value = endpointDefault

function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error) }
function localInput(ms) {
  const d = new Date(ms), n = v => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}T${n(d.getHours())}:${n(d.getMinutes())}`
}
function dateText(ms) {
  if (!ms) return '—'
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return '—'
  return d.getFullYear() >= 9000 ? '永久' : d.toLocaleString('zh-CN', { hour12: false })
}
function updateExpiry() {
  const start = new Date($('starts').value).getTime(), days = Number($('days').value)
  if (Number.isFinite(start) && Number.isInteger(days) && days > 0) $('expires').value = localInput(start + days * 86400000)
}
$('starts').value = localInput(Date.now())
updateExpiry()
$('days').addEventListener('input', updateExpiry)
$('starts').addEventListener('change', updateExpiry)
$('permanent').addEventListener('change', () => { $('days').disabled = $('expires').disabled = $('permanent').checked })
$('issue-scope').addEventListener('change', () => { $('machine-label').hidden = $('issue-scope').value !== 'fixed'; $('issue-binds-label').hidden = $('issue-scope').value === 'multi'; $('issue-max-binds').disabled = $('issue-scope').value === 'multi' })
$('settings-open').addEventListener('click', () => $('settings').showModal())
$('settings-save').addEventListener('click', () => status('连接设置已更新，点击刷新记录。'))

async function api(action, data = {}) {
  const target = new URL($('endpoint').value.trim())
  if (target.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(target.hostname) && target.protocol === 'http:')) throw Error('云函数地址必须使用 HTTPS')
  const token = $('admin-token').value.trim()
  if (!token) throw Error('请先在连接设置中输入管理令牌')
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(target.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data }), signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' })
    if (!response.ok) throw Error(`网络响应异常（${response.status}）`)
    const result = await response.json()
    if (!result.ok) throw Error((result.msg || '操作失败') + (result.code ? `（${result.code}）` : ''))
    return result
  } finally { clearTimeout(timer) }
}
function signingToken() {
  const token = $('signing-token').value
  if (!token) throw Error('请先在连接设置中输入发卡口令')
  return token
}
function handleError(error) {
  const message = error.name === 'AbortError' ? '连接超时，请检查云函数。'
    : error instanceof TypeError ? '连接失败，请检查网络、云函数地址和跨域设置。'
      : (error.message || '操作失败')
  status(message, true)
}

async function refresh() {
  const version = ++state.queryVersion
  status('正在查询云端记录…')
  try {
    const rows = [], seen = new Set()
    for (let offset = 0; offset < 20000; offset += 100) {
      const result = await api('admin.query', { limit: 100, offset })
      if (!Array.isArray(result.licenses)) throw Error('云端返回的数据格式不正确')
      for (const row of result.licenses) {
        if (!row._id || seen.has(row._id)) throw Error('云端分页异常，请检查云函数')
        seen.add(row._id); rows.push(row)
      }
      if (result.licenses.length < 100) break
      if (offset === 19900) throw Error('记录超过 20000 条，请使用云端导出')
    }
    if (version !== state.queryVersion) return
    state.rows = rows.filter(row => !row.deleted).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    state.selected = state.rows.find(row => row._id === state.selected?._id) || null
    $('connection').textContent = '云端已连接'; $('connection').classList.add('online')
    render(); status(`已读取 ${rows.length} 条记录。`)
  } catch (error) { if (version === state.queryVersion) { $('connection').textContent = '连接失败'; $('connection').classList.remove('online'); handleError(error) } }
}
$('refresh').addEventListener('click', refresh)

function cardState(row) { return row.status === 'revoked' ? 'revoked' : Number(row.expiresUtc) <= Date.now() ? 'expired' : 'active' }
function stateText(row) { return { active: '正常', expired: '已到期', revoked: '已停用' }[cardState(row)] }
function cell(row, text) { const td = document.createElement('td'); td.textContent = text; row.append(td); return td }
function render() {
  const filter = $('filter').value.trim().toLowerCase(), mode = $('state-filter').value
  const rows = state.rows.filter(row => (mode === 'all' || cardState(row) === mode) && [row.note, row._id, row.boundMachine].some(v => String(v || '').toLowerCase().includes(filter)))
  $('record-count').textContent = `共 ${state.rows.length} 条记录 · 当前显示 ${rows.length} 条`
  const body = $('records'); body.replaceChildren()
  if (!rows.length) { const tr = document.createElement('tr'), td = cell(tr, state.rows.length ? '没有符合条件的记录' : '暂无记录'); td.colSpan = 5; td.className = 'empty'; body.append(tr) }
  for (const row of rows) {
    const tr = document.createElement('tr'); tr.classList.toggle('selected', row._id === state.selected?._id)
    const first = document.createElement('td'), name = document.createElement('strong'), id = document.createElement('small'); first.dataset.label = '名称 / 卡密 ID'
    name.textContent = row.note || '未填写备注'; id.textContent = row._id; first.append(name, id); tr.append(first)
    cell(tr, row.boundMachine ? row.boundMachine.slice(0, 12) + '…' : '未绑定').dataset.label = '绑定状态'
    cell(tr, `${row.bindCount ?? 0} / ${row.maxBinds ?? 1}`).dataset.label = '已用 / 允许解绑'; cell(tr, dateText(row.expiresUtc)).dataset.label = '到期时间'
    const last = document.createElement('td'), badge = document.createElement('span'); last.dataset.label = '状态'; badge.className = `badge ${cardState(row)}`; badge.textContent = stateText(row); last.append(badge); tr.append(last)
    tr.addEventListener('click', () => { state.selected = row; $('logs').hidden = true; render() }); body.append(tr)
  }
  const row = state.selected
  $('details-content').hidden = !row
  $('selected-label').textContent = row ? row.note || '未填写备注' : '选择一条记录进行管理'
  $('selected-state').textContent = row ? stateText(row) : ''
  if (row) { $('detail-id').textContent = row._id; $('detail-machine').textContent = row.boundMachine || '未绑定'; $('detail-signed-expiry').textContent = dateText(row.sigExpiresUtc); $('detail-max-binds').value = row.maxBinds ?? 1; $('detail-binds-used').textContent = `已使用 ${row.bindCount ?? 0} 次` }
}
$('filter').addEventListener('input', render)
$('state-filter').addEventListener('change', render)

$('issue-form').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const signing = signingToken(), starts = new Date($('starts').value).getTime(), permanent = $('permanent').checked
    const expires = permanent ? null : new Date($('expires').value).getTime()
    if (!Number.isFinite(starts) || (!permanent && !Number.isFinite(expires))) throw Error('请选择有效的生效时间和到期时间')
    const machine = $('issue-scope').value === 'multi' ? 'MULTI' : $('issue-scope').value === 'fixed' ? $('issue-machine').value.trim() : ''
    if ($('issue-scope').value === 'fixed' && !machine) throw Error('请输入客户机器码')
    $('issue-form').querySelector('[type=submit]').disabled = true; status('正在签发…')
    const maxBinds = $('issue-scope').value === 'multi' ? 1 : Number($('issue-max-binds').value)
    if (!Number.isInteger(maxBinds) || maxBinds < 0 || maxBinds > 99) throw Error('允许解绑次数请输入 0 至 99 的整数')
    const result = await api('admin.issue', { signingToken: signing, machine, maxBinds, startsUtc: starts, expiresUtc: expires, permanent, note: $('issue-note').value.trim() })
    $('issued-key').value = result.key; $('copy-new').disabled = false
    await refresh(); status('签发成功，卡密已显示，可复制发送给客户。')
  } catch (error) { handleError(error) } finally { $('issue-form').querySelector('[type=submit]').disabled = false }
})
async function copyText(text) {
  if (!text) throw Error('没有可复制的卡密')
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return }
  $('issued-key').value = text; $('issued-key').focus(); $('issued-key').select()
  if (!document.execCommand('copy')) throw Error('无法自动复制，请手动复制签发结果')
}
$('copy-new').addEventListener('click', async () => { try { await copyText($('issued-key').value); status('卡密已复制。') } catch (e) { handleError(e) } })

document.querySelector('#details-content').addEventListener('click', async event => {
  const action = event.target.dataset.action, row = state.selected
  if (!action || !row) return
  try {
    if (action === 'copy') {
      const result = await api('admin.copy', { keyId: row._id, signingToken: signingToken() })
      $('issued-key').value = result.key; $('copy-new').disabled = false
      try { await copyText(result.key); status('卡密已复制。') } catch (_) { status('卡密已显示在左侧，请点击复制卡密。') }
      return
    }
    if (action === 'logs') {
      const result = await api('admin.query', { keyId: row._id, logLimit: 50 })
      $('logs').replaceChildren()
      for (const entry of result.logs || []) { const line = document.createElement('div'); line.textContent = `${dateText(entry.ts)}　${entry.machine || '—'}　${entry.ver || ''}`; $('logs').append(line) }
      if (!$('logs').childNodes.length) $('logs').textContent = '暂无联网验证记录。'
      $('logs').hidden = !$('logs').hidden; return
    }
    let op, extra = {}
    if (action === 'note') { const value = prompt('修改备注', row.note || ''); if (value === null) return; op = 'setNote'; extra.note = value }
    if (action === 'rebind') { if (!confirm('确定解绑？指定机器码签发的卡仍只能用于原电脑。')) return; op = 'rebind' }
    if (action === 'binds') { const value = $('detail-max-binds').value; if (!/^\d+$/.test(value) || +value > 99) throw Error('请输入 0 至 99 的整数'); op = 'setMaxBinds'; extra.maxBinds = +value }
    if (action === 'reset') { if (!confirm('确定将已使用的换绑次数归零？')) return; op = 'resetBinds' }
    if (action === 'delete') { if (!confirm('确定删除这张卡密？删除后卡密会被停用，记录将从列表隐藏。')) return; op = 'delete' }
    if (action === 'toggle') { op = row.status === 'revoked' ? 'restore' : 'revoke'; if (!confirm(op === 'revoke' ? '确定停用这张卡？' : '确定恢复这张卡？')) return }
    if (action === 'expiry') {
      const value = prompt('输入新的到期时间，例如 2027-12-31 23:59。不能超过签名原始到期时间。', localInput(row.expiresUtc).replace('T', ' '))
      if (value === null) return
      const ms = new Date(value.replace(' ', 'T')).getTime()
      if (!Number.isFinite(ms) || ms <= 0 || (row.sigExpiresUtc && ms > Number(row.sigExpiresUtc))) throw Error('到期时间无效或超过签名原始期限')
      op = 'setExpire'; extra.expiresUtc = ms
    }
    if (!op) return
    status('正在保存…'); await api('admin.mutate', { keyId: row._id, op, ...extra }); await refresh(); status('修改已保存。')
  } catch (error) { handleError(error) }
})

$('import').addEventListener('click', () => $('import-file').click())
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''
  if (!file) return
  try {
    if (file.size > 32 * 1024 * 1024) throw Error('历史文件超过 32 MB')
    const records = JSON.parse(await file.text())
    if (!Array.isArray(records)) throw Error('请选择发行器的卡密历史.json')
    const valid = records.filter(row => row && typeof row.Code === 'string' && row.Code.trim())
    if (!confirm(`将向云端导入 ${valid.length} 条旧卡密，已有记录的状态和绑定不会改变。继续？`)) return
    let done = 0, failed = 0
    for (const row of valid) { try { await api('admin.import', { key: row.Code, note: row.Name || '' }); done++ } catch (_) { failed++ }; status(`正在导入 ${done + failed} / ${valid.length}…`) }
    await refresh(); status(`导入完成：成功 ${done} 条，失败 ${failed} 条。`, failed > 0)
  } catch (error) { handleError(error) }
})
$('export').addEventListener('click', async () => {
  try {
    status('正在导出…'); const data = await api('admin.export')
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `皮蛋云端记录-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status(`已导出 ${data.count} 条云端记录。`)
  } catch (error) { handleError(error) }
})
