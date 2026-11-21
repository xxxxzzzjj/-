'use strict'

const $ = id => document.getElementById(id)
const state = { rows: [], selected: null, queryVersion: 0, saving: false }
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
function updateIssueScope() {
  const scope = $('issue-scope').value, trial = scope === 'trial'
  $('machine-label').hidden = scope !== 'fixed'; $('issue-devices-label').hidden = scope !== 'multi'
  $('trial-days-label').hidden = !trial; $('normal-duration').hidden = $('normal-expiry').hidden = trial
  $('issue-max-binds').disabled = $('issue-unlimited-binds').checked
}
$('issue-scope').addEventListener('change', updateIssueScope)
$('issue-unlimited-binds').addEventListener('change', updateIssueScope)
$('detail-unlimited-binds').addEventListener('change', () => { $('detail-max-binds').disabled = $('detail-unlimited-binds').checked })
$('detail-close').addEventListener('click', () => $('detail').close())
$('detail').addEventListener('click', event => { if (event.target === $('detail')) { const r = $('detail').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('detail').close() } })
updateIssueScope()
$('settings-open').addEventListener('click', () => $('settings').showModal())
$('settings-save').addEventListener('click', () => status('连接设置已应用，仅在当前页面有效；关闭页面后需要重新输入。'))

function activateMainTab(name) {
  $('workspace').hidden = name === 'settings'
  $('settings-panel').hidden = name !== 'settings'
  $('workspace').dataset.view = name === 'issue' ? 'issue' : 'records'
  document.querySelector('main').dataset.view = name
  document.querySelectorAll('[data-main-tab]').forEach(button => {
    const active = button.dataset.mainTab === name
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', String(active))
  })
}
document.querySelectorAll('[data-main-tab]').forEach(button => button.addEventListener('click', () => activateMainTab(button.dataset.mainTab)))
document.querySelectorAll('[data-settings-tab]').forEach(button => button.addEventListener('click', () => {
  const target = button.dataset.settingsTab
  document.querySelectorAll('[data-settings-tab]').forEach(tab => {
    const active = tab === button
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== target })
}))

function updateNoticePreview() {
  const preview = $('notice-preview')
  preview.textContent = $('notice-text').value || '公告预览'
  preview.style.color = $('notice-color').value
  preview.style.fontSize = `${Math.min(28, Math.max(10, Number($('notice-size').value) || 12))}px`
  preview.style.fontWeight = $('notice-bold').checked ? '700' : '400'
}
function noticeStatus(message, error = false) {
  const target = $('notice-status')
  if (target) { target.textContent = message; target.classList.toggle('error', error) }
  status(message, error)
}
for (const id of ['notice-text', 'notice-color', 'notice-size', 'notice-bold']) $(id).addEventListener('input', updateNoticePreview)
async function loadNotice() {
  noticeStatus('正在读取公告…')
  const result = await api('admin.notice.get')
  const notice = result.notice || {}
  $('notice-text').value = notice.text || ''
  $('notice-color').value = /^#[\da-f]{6}$/i.test(notice.color || '') ? notice.color : '#FF5555'
  $('notice-size').value = Number(notice.fontSize) >= 10 && Number(notice.fontSize) <= 28 ? Number(notice.fontSize) : 12
  $('notice-bold').checked = notice.bold === true
  updateNoticePreview()
  showNoticeImage(notice.imageUrl || '')
  noticeStatus('已读取云端公告。')
}
$('notice-load').addEventListener('click', async () => { try { await loadNotice() } catch (error) { handleError(error); noticeStatus($('status').textContent, true) } })
$('notice-save').addEventListener('click', async () => {
  const button = $('notice-save')
  try {
    const fontSize = Number($('notice-size').value)
    if (!Number.isInteger(fontSize) || fontSize < 10 || fontSize > 28) throw Error('字号请输入 10 至 28 的整数')
    if ($('notice-text').value.length > 4000) throw Error('公告最多 4000 个字符')
    button.disabled = true; button.textContent = '保存中…'; noticeStatus('正在保存公告…')
    await api('admin.notice.set', { text: $('notice-text').value, color: $('notice-color').value, fontSize, bold: $('notice-bold').checked })
    noticeStatus('公告已保存。插件会复用 6 小时本地缓存，需要立即同步可在公告内点击“刷新公告”。')
  } catch (error) { handleError(error); noticeStatus($('status').textContent, true) } finally { button.disabled = false; button.textContent = '保存公告' }
})
updateNoticePreview()

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
  $('refresh').disabled = true
  status('正在查询云端记录…')
  try {
    const rows = [], seen = new Set()
    const pageSize = 500
    for (let offset = 0; offset < 20000; offset += pageSize) {
      if (version !== state.queryVersion) return
      const result = await api('admin.query', { limit: pageSize, offset })
      if (version !== state.queryVersion) return
      if (!Array.isArray(result.licenses)) throw Error('云端返回的数据格式不正确')
      for (const row of result.licenses) {
        if (!row._id || seen.has(row._id)) throw Error('云端分页异常，请检查云函数')
        seen.add(row._id); rows.push(row)
      }
      if (result.licenses.length < pageSize) break
      if (offset === 20000 - pageSize) throw Error('记录超过 20000 条，请使用云端导出')
    }
    if (version !== state.queryVersion) return
    state.rows = rows.filter(row => !row.deleted).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    state.selected = state.rows.find(row => row._id === state.selected?._id) || null
    $('connection').textContent = '云端已连接'; $('connection').classList.add('online')
    render(); status(`已读取 ${rows.length} 条记录。`)
  } catch (error) { if (version === state.queryVersion) { $('connection').textContent = '连接失败'; $('connection').classList.remove('online'); handleError(error) } }
  finally { if (version === state.queryVersion) $('refresh').disabled = false }
}
$('refresh').addEventListener('click', refresh)

function cardState(row) { return row.status === 'revoked' ? 'revoked' : Number(row.expiresUtc) <= Date.now() ? 'expired' : 'active' }
function stateText(row) { return { active: '正常', expired: '已到期', revoked: '已停用' }[cardState(row)] }
function isTrial(row) { return row.trial === true || String(row.signedPayload || '').startsWith('DSH-CDR|3|') }
function isMulti(row) { return !!row.multi || String(row.signedPayload || '').startsWith('DSH-CDR|2|') }
function cell(row, text) { const td = document.createElement('td'); td.textContent = text; row.append(td); return td }
function render() {
  const filter = $('filter').value.trim().toLowerCase(), mode = $('state-filter').value
  const rows = state.rows.filter(row => (mode === 'all' || cardState(row) === mode) && [row.note, row.displayTitle, row._id, row.boundMachine, ...(row.boundMachines || [])].some(v => String(v || '').toLowerCase().includes(filter)))
  $('record-count').textContent = `共 ${state.rows.length} 条记录 · 当前显示 ${rows.length} 条`
  const body = $('records'); body.replaceChildren()
  if (!rows.length) { const tr = document.createElement('tr'), td = cell(tr, state.rows.length ? '没有符合条件的记录' : '暂无记录'); td.colSpan = 5; td.className = 'empty'; body.append(tr) }
  for (const row of rows) {
    const tr = document.createElement('tr'); tr.classList.toggle('selected', row._id === state.selected?._id)
    const first = document.createElement('td'), name = document.createElement('strong'), id = document.createElement('small'); first.dataset.label = '名称 / 卡密 ID'
    name.textContent = row.note || '未填写备注'; id.textContent = row._id; first.append(name, id); tr.append(first)
    cell(tr, isTrial(row) ? '每台电脑体验一次' : isMulti(row) ? (row.maxDevices == null ? '多设备不限' : `${(row.boundMachines || []).length} / ${row.maxDevices} 台`) : row.boundMachine ? row.boundMachine.slice(0, 12) + '…' : '未绑定').dataset.label = '绑定状态'
    cell(tr, isTrial(row) ? '不重置体验' : `${row.bindCount ?? 0} / ${Number(row.maxBinds) === -1 ? '不限' : row.maxBinds ?? 1}`).dataset.label = '已用 / 允许解绑'; cell(tr, isTrial(row) ? `每机 ${row.trialDays || '?'} 天` : dateText(row.expiresUtc)).dataset.label = '到期时间'
    const last = document.createElement('td'), badge = document.createElement('span'); last.dataset.label = '状态'; badge.className = `badge ${cardState(row)}`; badge.textContent = stateText(row); last.append(badge); tr.append(last)
    tr.tabIndex = 0; tr.setAttribute('role', 'button'); tr.setAttribute('aria-label', `管理 ${row.note || row._id}`); const open = () => { if (state.saving) return; state.selected = row; $('logs').hidden = true; render(); if (!$('detail').open) $('detail').showModal(); loadPortalPassword() }; tr.addEventListener('click', open); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }); body.append(tr)
  }
  const row = state.selected
  if (!row && $('detail').open) $('detail').close()
  $('details-content').hidden = !row
  $('selected-label').textContent = row ? row.note || '未填写备注' : '选择一条记录进行管理'
  $('selected-state').textContent = row ? stateText(row) : ''
  $('selected-state').className = row ? `badge ${cardState(row)}` : 'badge'
  if (row) {
    const trial = isTrial(row), multi = isMulti(row), devices = Array.isArray(row.boundMachines) ? row.boundMachines : []
    $('detail-id').textContent = row._id; $('detail-machine').textContent = multi ? (row.maxDevices == null ? '旧版不限设备' : `已绑定 ${devices.length} 台`) : row.boundMachine || '未绑定'; $('detail-signed-expiry').textContent = dateText(row.sigExpiresUtc); $('detail-max-binds').value = Number(row.maxBinds) === -1 ? 1 : row.maxBinds ?? 1; $('detail-unlimited-binds').checked = Number(row.maxBinds) === -1; $('detail-max-binds').disabled = Number(row.maxBinds) === -1; $('detail-binds-used').textContent = `已使用 ${row.bindCount ?? 0} 次`
    $('portal-password-setting').hidden = !multi || trial; $('portal-new-password').value = ''; $('portal-new-password').type = 'password'; $('portal-password-visible').textContent = '显示'
    $('detail-note').value = row.note || ''; $('detail-display-title').value = row.displayTitle || ''
    $('trial-help').hidden = !trial; $('detail-bind-settings').hidden = trial; $('device-settings').hidden = !multi || trial; $('detail-max-devices').value = row.maxDevices ?? 2; $('device-count').textContent = row.maxDevices == null ? '当前不限台数' : `已绑定 ${devices.length} 台`; $('device-list').replaceChildren()
    $('detail-signed-expiry').previousElementSibling.textContent = trial ? '体验期限' : '签名到期'
    if (trial) { $('detail-machine').textContent = '每台电脑独立体验一次'; $('detail-signed-expiry').textContent = `首次兑换起 ${row.trialDays || '?'} 天` }
    for (const machine of devices) { const line = document.createElement('div'), code = document.createElement('span'), button = document.createElement('button'); line.className = 'device-row'; code.textContent = machine; button.className = 'secondary'; button.textContent = '移除设备'; button.dataset.action = 'remove-device'; button.dataset.machine = machine; line.append(code, button); $('device-list').append(line) }
    document.querySelector('[data-action=rebind]').hidden = multi || trial
    document.querySelector('[data-action=expiry]').hidden = trial
  }
}
$('filter').addEventListener('input', render)
$('state-filter').addEventListener('change', render)

$('issue-form').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const trial = $('issue-scope').value === 'trial', trialDays = Number($('trial-days').value)
    if (trial && (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 36500)) throw Error('体验天数请输入 1 至 36500 的整数')
    const signing = signingToken(), starts = new Date($('starts').value).getTime(), permanent = trial || $('permanent').checked
    const expires = permanent ? null : new Date($('expires').value).getTime()
    if (!Number.isFinite(starts) || (!permanent && !Number.isFinite(expires))) throw Error('请选择有效的生效时间和到期时间')
    const machine = $('issue-scope').value === 'multi' ? 'MULTI' : $('issue-scope').value === 'fixed' ? $('issue-machine').value.trim() : ''
    if ($('issue-scope').value === 'fixed' && !machine) throw Error('请输入客户机器码')
    $('issue-form').querySelector('[type=submit]').disabled = true; status('正在签发…')
    const maxBinds = $('issue-unlimited-binds').checked ? -1 : Number($('issue-max-binds').value), maxDevices = Number($('issue-max-devices').value)
    if (!Number.isInteger(maxBinds) || maxBinds < -1 || maxBinds > 99) throw Error('允许解绑次数请输入 0 至 99 的整数')
    if (machine === 'MULTI' && (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 99)) throw Error('最多绑定电脑数请输入 1 至 99 的整数')
    const result = await api('admin.issue', { signingToken: signing, machine, trial, trialDays, maxBinds, maxDevices, startsUtc: starts, expiresUtc: expires, permanent, note: $('issue-note').value.trim() })
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
  if (!action || !row || state.saving) return
  state.saving = true; document.querySelectorAll('#details-content button').forEach(b => { b.disabled = true })
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
      for (const device of result.devices || []) { const line = document.createElement('div'); line.textContent = `设备：${device.deviceName || '名称未知'}　设备机器码：${device.machine}　${device.isBound ? '绑定中' : '已解绑'}　最近绑定：${dateText(device.boundAtUtc || device.lastBoundUtc)}`; $('logs').append(line) }
      for (const entry of result.trials || []) { const line = document.createElement('div'); line.textContent = `${entry.machine}　首次：${dateText(entry.firstBoundUtc)}　到期：${dateText(entry.expiresUtc)}　${entry.bound ? '已绑定' : '已解绑'}`; $('logs').append(line) }
      for (const entry of result.logs || []) { const line = document.createElement('div'); line.textContent = `${dateText(entry.ts)}　${entry.machine || '—'}　${entry.ver || ''}`; $('logs').append(line) }
      if (!$('logs').childNodes.length) $('logs').textContent = '暂无联网验证记录。'
      $('logs').hidden = !$('logs').hidden; return
    }
    let op, extra = {}
    if (action === 'note') { const value = $('detail-note').value.trim(); if (value.length > 200) throw Error('备注最多 200 个字符'); op = 'setNote'; extra.note = value }
    if (action === 'display-title') { const value = $('detail-display-title').value.trim(); if (value.length > 40) throw Error('显示称号最多 40 个字符'); op = 'setDisplayTitle'; extra.displayTitle = value }
    if (action === 'rebind') { if (!confirm('确定解绑？指定机器码签发的卡仍只能用于原电脑。')) return; op = 'rebind' }
    if (action === 'binds') { const value = $('detail-max-binds').value; if (!$('detail-unlimited-binds').checked && (!/^\d+$/.test(value) || +value > 99)) throw Error('请输入 0 至 99 的整数'); op = 'setMaxBinds'; extra.maxBinds = $('detail-unlimited-binds').checked ? -1 : +value }
    if (action === 'devices') { const value = $('detail-max-devices').value; if (!/^\d+$/.test(value) || +value < 1 || +value > 99) throw Error('请输入 1 至 99 的整数'); if (row.maxDevices == null && !confirm('旧卡此前没有记录设备名单。设置上限后，原有用户需要重新兑换，按先后占用设备名额。继续？')) return; op = 'setMaxDevices'; extra.maxDevices = +value }
    if (action === 'remove-device') { if (!confirm('移除这台电脑？联网后该设备将无法继续使用，名额可供其他电脑兑换。')) return; op = 'removeDevice'; extra.machine = event.target.dataset.machine }
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
  } catch (error) { handleError(error) } finally { state.saving = false; document.querySelectorAll('#details-content button').forEach(b => { b.disabled = false }) }
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

async function accessRequest(save) {
  const buttons = [$('access-load'), $('access-save')]
  if (buttons.some(b => b.disabled)) return
  buttons.forEach(b => { b.disabled = true })
  try {
    const result = await api(save ? 'admin.trial.access.set' : 'admin.trial.access.get', save ? { text: $('access-text').value } : {})
    $('access-text').value = result.access?.text || ''
    $('access-status').textContent = save ? '已保存。用户下次有效点击将复制最新内容；空内容将提示暂未提供。' : '已读取云端最新内容。'
    $('access-status').classList.remove('error'); status($('access-status').textContent)
  } catch (error) { handleError(error); $('access-status').textContent = $('status').textContent; $('access-status').classList.add('error') }
  finally { buttons.forEach(b => { b.disabled = false }) }
}
$('access-load').addEventListener('click', () => accessRequest(false))
$('access-save').addEventListener('click', () => accessRequest(true))

function updateContributorsPreview() {
  const preview = $('contributors-preview')
  preview.textContent = $('contributors-text').value || '参与大佬预览'
  preview.style.color = $('contributors-color').value
  preview.style.fontSize = `${Math.min(28, Math.max(10, Number($('contributors-size').value) || 12))}px`
  preview.style.fontWeight = $('contributors-bold').checked ? '700' : '400'
}
function contributorsStatus(message, error = false) {
  const target = $('contributors-status')
  if (target) { target.textContent = message; target.classList.toggle('error', error) }
  status(message, error)
}
for (const id of ['contributors-text', 'contributors-color', 'contributors-size', 'contributors-bold']) $(id).addEventListener('input', updateContributorsPreview)
async function loadContributors() {
  contributorsStatus('正在读取参与大佬…')
  const result = await api('admin.contributors.get')
  const notice = result.notice || {}
  $('contributors-text').value = notice.text || ''
  $('contributors-color').value = /^#[\da-f]{6}$/i.test(notice.color || '') ? notice.color : '#FF5555'
  $('contributors-size').value = Number(notice.fontSize) >= 10 && Number(notice.fontSize) <= 28 ? Number(notice.fontSize) : 12
  $('contributors-bold').checked = notice.bold === true
  updateContributorsPreview()
  contributorsStatus('已读取云端参与大佬。')
}
$('contributors-load').addEventListener('click', async () => { try { await loadContributors() } catch (error) { handleError(error); contributorsStatus($('status').textContent, true) } })
$('contributors-save').addEventListener('click', async () => {
  const button = $('contributors-save')
  try {
    const fontSize = Number($('contributors-size').value)
    if (!Number.isInteger(fontSize) || fontSize < 10 || fontSize > 28) throw Error('字号请输入 10 至 28 的整数')
    if ($('contributors-text').value.length > 4000) throw Error('参与大佬最多 4000 个字符')
    button.disabled = true; button.textContent = '保存中…'; contributorsStatus('正在保存参与大佬…')
    await api('admin.contributors.set', { text: $('contributors-text').value, color: $('contributors-color').value, fontSize, bold: $('contributors-bold').checked })
    contributorsStatus('参与大佬已保存。插件会复用 6 小时本地缓存，需要立即同步可在参与大佬内点击“刷新参与大佬”。')
  } catch (error) { handleError(error); contributorsStatus($('status').textContent, true) } finally { button.disabled = false; button.textContent = '保存参与大佬' }
})
updateContributorsPreview()


function updateAdminStatus(text, error = false) { const e = $('update-status'); e.textContent = text; e.classList.toggle('error', error) }
for (const [id, title, fallback] of [['current', '已是最新版时的弹窗内容', '当前已经是最新版本。'], ['available', '发现新版本时的提示内容', '发现新版本，请保存文档并关闭所有 CorelDRAW 后开始更新。']]) {
  const box = document.createElement('div'); box.className = 'notice-editor'
  const heading = document.createElement('h3'); heading.textContent = title; box.append(heading)
  const text = document.createElement('textarea'); text.id = `update-${id}-text`; text.maxLength = 4000; text.value = fallback; text.rows = 3; box.append(text)
  const options = document.createElement('div'); options.className = 'notice-options'
  options.innerHTML = `<label>文字颜色<input id="update-${id}-color" type="color" value="#2FC7B5"></label><label>字号<input id="update-${id}-size" type="number" min="10" max="28" value="12"></label><label class="check-label"><input id="update-${id}-bold" type="checkbox">加粗</label>`
  box.append(options); const preview = document.createElement('div'); preview.className = 'notice-preview'; box.append(preview)
  const render = () => { preview.textContent = text.value; preview.style.color = $(`update-${id}-color`).value; preview.style.fontSize = `${Math.max(10, Math.min(28, +$(`update-${id}-size`).value || 12))}px`; preview.style.fontWeight = $(`update-${id}-bold`).checked ? '700' : '400' }
  box.addEventListener('input', render); $('update-message-editors').append(box); render()
}
function readUpdateMessage(id) {
  const fontSize = Number($(`update-${id}-size`).value)
  if (!Number.isInteger(fontSize) || fontSize < 10 || fontSize > 28) throw Error('字号请输入 10 至 28 的整数')
  return { text: $(`update-${id}-text`).value, color: $(`update-${id}-color`).value, fontSize, bold: $(`update-${id}-bold`).checked }
}
$('update-load').addEventListener('click', async () => {
  const button = $('update-load'); button.disabled = true
  try { const { update = {} } = await api('admin.update.get'); $('update-hour').value = update.releaseHour ? update.releaseHour.slice(0, 13) + ':00' : ''; $('update-page').value = update.pageUrl || $('update-page').defaultValue
    for (const id of ['current', 'available']) { const row = update[id] || {}; $(`update-${id}-text`).value = row.text || ''; $(`update-${id}-color`).value = row.color || '#2FC7B5'; $(`update-${id}-size`).value = row.fontSize || 12; $(`update-${id}-bold`).checked = row.bold === true; $(`update-${id}-text`).dispatchEvent(new Event('input', { bubbles: true })) }
    updateAdminStatus('已读取云端更新设置。')
  } catch (error) { handleError(error); updateAdminStatus($('status').textContent, true) } finally { button.disabled = false }
})
$('update-save').addEventListener('click', async () => {
  const button = $('update-save'); button.disabled = true
  try { const releaseHour = $('update-hour').value.slice(0, 13), pageUrl = new URL($('update-page').value.trim())
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(releaseHour)) throw Error('请填写更新时间')
    if (pageUrl.protocol !== 'https:') throw Error('更新页面必须使用 HTTPS')
    await api('admin.update.set', { releaseHour, pageUrl: pageUrl.href, current: readUpdateMessage('current'), available: readUpdateMessage('available') }); $('update-hour').value = releaseHour + ':00'; updateAdminStatus('更新设置已保存。客户端按北京时间的年月日和小时比较版本。')
  } catch (error) { handleError(error); updateAdminStatus($('status').textContent, true) } finally { button.disabled = false }
})


let portalPasswordLoading = false
async function loadPortalPassword() {
  const row = state.selected
  if (!row || !isMulti(row) || isTrial(row)) return
  $('portal-password-status').textContent = '读取中…'
  try {
    const result = await api('admin.portal.password.get', { keyId: row._id })
    if (state.selected?._id !== row._id) return
    const setting = result.password || {}
    $('portal-password-status').textContent = setting.isSet ? `已设置 · 最近修改 ${dateText(setting.changedAtUtc)}` : '用户尚未设置，可直接为用户设置验证码'
  } catch (error) { if (state.selected?._id === row._id) $('portal-password-status').textContent = error.message }
}
$('portal-password-visible').addEventListener('click', () => {
  const show = $('portal-new-password').type === 'password'
  $('portal-new-password').type = show ? 'text' : 'password'
  $('portal-password-visible').textContent = show ? '隐藏' : '显示'
  $('portal-password-visible').setAttribute('aria-pressed', String(show))
})
$('portal-password-reset').addEventListener('click', async () => {
  const row = state.selected, input = $('portal-new-password'), button = $('portal-password-reset')
  if (!row || portalPasswordLoading) return
  if (input.value.length < 6 || input.value.length > 64) { $('portal-password-status').textContent = '请输入 6 至 64 个字符'; input.focus(); return }
  portalPasswordLoading = true; button.disabled = true; button.textContent = '保存中…'
  try {
    await api('admin.portal.password.reset', { keyId: row._id, newPassword: input.value })
    input.value = ''; input.type = 'password'; $('portal-password-visible').textContent = '显示'
    if (state.selected?._id === row._id) $('portal-password-status').textContent = '新验证码已保存，旧验证码立即失效'
  } catch (error) { $('portal-password-status').textContent = error.message }
  finally { portalPasswordLoading = false; button.disabled = false; button.textContent = '保存新验证码' }
})

let selectedNoticeImage = null, noticeImageObjectUrl = '', noticeImageBusy = false
function showNoticeImage(url) { const image = $('notice-image-preview'); image.hidden = !url; if (url) image.src = url; else image.removeAttribute('src') }
$('notice-image-file').addEventListener('change', async event => {
  let file = event.target.files[0]; if (!file) return
  try {
    const image = await createImageBitmap(file)
    if (file.type === 'image/webp') {
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw Error('图片转换失败，请选择 PNG 图片')
      file = new File([blob], file.name.replace(/\.webp$/i, '') + '.png', { type: 'image/png' })
    }
    image.close(); selectedNoticeImage = file
    if (noticeImageObjectUrl) URL.revokeObjectURL(noticeImageObjectUrl)
    noticeImageObjectUrl = URL.createObjectURL(file); showNoticeImage(noticeImageObjectUrl)
    $('notice-image-name').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`
    $('notice-image-upload').disabled = false; $('notice-image-status').textContent = '预览就绪，点击「上传并发布图片」同步给用户'
  } catch (_) { selectedNoticeImage = null; $('notice-image-upload').disabled = true; $('notice-image-status').textContent = '无法读取这张图片，请选择有效的 PNG、JPG、WebP、GIF 或 BMP 图片' }
})
function directImageUpload(upload, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(), form = new FormData()
    form.append('Signature', upload.authorization); form.append('x-cos-security-token', upload.token); form.append('x-cos-meta-fileid', upload.cosFileId); form.append('key', upload.cloudPath); form.append('file', file)
    xhr.open('POST', upload.url)
    xhr.upload.onprogress = event => { if (event.lengthComputable) { const percent = Math.floor(event.loaded * 100 / event.total); $('notice-image-progress').value = percent; $('notice-image-status').textContent = `正在上传 ${percent}%` } }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(Error(`云存储上传失败（${xhr.status}），请检查存储跨域和目录权限`))
    xhr.onerror = () => reject(Error('云存储连接失败，请检查网络和存储跨域设置')); xhr.send(form)
  })
}
$('notice-image-upload').addEventListener('click', async () => {
  if (!selectedNoticeImage || noticeImageBusy) return
  noticeImageBusy = true; $('notice-image-upload').disabled = $('notice-image-remove').disabled = true; $('notice-image-progress').hidden = false; $('notice-image-progress').value = 0
  try {
    const file = selectedNoticeImage
    const result = await api('admin.notice.image.begin', { contentType: file.type || ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp'}[file.name.split('.').pop().toLowerCase()]) })
    await directImageUpload(result.upload, file)
    const published = await api('admin.notice.image.commit', { receipt: result.upload.receipt })
    $('notice-image-status').textContent = '图片已发布。插件打开公告时使用缓存，可点击「刷新公告」立即同步。'; showNoticeImage(published.image.url)
  } catch (error) { $('notice-image-status').textContent = error.message }
  finally { noticeImageBusy = false; $('notice-image-upload').disabled = !selectedNoticeImage; $('notice-image-remove').disabled = false; $('notice-image-progress').hidden = true }
})
$('notice-image-remove').addEventListener('click', async () => {
  if (noticeImageBusy || !confirm('移除统一公告图片？用户下次刷新公告后不再显示该图片。')) return
  noticeImageBusy = true; $('notice-image-remove').disabled = true
  try { await api('admin.notice.image.remove'); showNoticeImage(''); $('notice-image-status').textContent = '云端图片已移除' }
  catch (error) { $('notice-image-status').textContent = error.message }
  finally { noticeImageBusy = false; $('notice-image-remove').disabled = false }
})
