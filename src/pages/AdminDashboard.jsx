import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { pad, dateKey, fmtHours, totalMs, dailyTotals, getCurrentPosition } from '../lib/attendance'
import * as XLSX from 'xlsx'

const CARD = 'rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-xl shadow-black/20'
const INPUT =
  'rounded-lg border border-white/10 bg-white/5 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-500/20'

export default function AdminDashboard({ profile }) {
  const [records, setRecords] = useState([])
  const [names, setNames] = useState({})
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null) // 크게 볼 사진 URL
  const [deleting, setDeleting] = useState(null) // 삭제 중인 세션 key
  const [openUserId, setOpenUserId] = useState(null) // 폴더 열어본 직원

  // 근무지 목록 + 추가 폼
  const [offices, setOffices] = useState([])
  const [newOffice, setNewOffice] = useState({ name: '', lat: '', lng: '', radius: 100 })
  const [editingId, setEditingId] = useState(null) // 인라인 수정 중인 근무지 id
  const [editForm, setEditForm] = useState({ name: '', lat: '', lng: '', radius: 100 })
  const [savingOffice, setSavingOffice] = useState(false)
  const [officeMsg, setOfficeMsg] = useState('')

  // 수기 출퇴근 입력 폼 (관리자 보정용)
  const [manual, setManual] = useState({ userId: '', date: '', checkIn: '', checkOut: '' })
  const [savingManual, setSavingManual] = useState(false)
  const [manualMsg, setManualMsg] = useState('')

  // 내 계정 설정 (관리자 본인 이메일/비밀번호 변경)
  const [account, setAccount] = useState({ email: '', password: '', password2: '' })
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountMsg, setAccountMsg] = useState('')

  useEffect(() => {
    load()
  }, [])

  // 현재 로그인한 관리자의 이메일을 폼에 채워둠
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setAccount((a) => ({ ...a, email: data.user.email }))
      }
    })
  }, [])

  async function load() {
    setLoading(true)

    // 전체 출퇴근 기록 (관리자는 RLS 정책상 전체 조회 가능)
    const { data: att } = await supabase
      .from('attendance')
      .select('*')
      .order('created_at', { ascending: false })

    // 직원 프로필
    const { data: profs } = await supabase.from('profiles').select('id, name, role')
    const map = {}
    ;(profs || []).forEach((p) => {
      map[p.id] = p.name
    })

    // 근무지 목록 (테이블이 아직 없어도 앱은 정상 동작)
    const { data: offs } = await supabase
      .from('offices')
      .select('*')
      .order('created_at', { ascending: true })
    setOffices(offs || [])

    setNames(map)
    setProfiles(profs || [])
    setRecords(att || [])
    setLoading(false)
  }

  // 직원별 오늘/이번 달 누적 근무시간
  const summary = useMemo(() => {
    const now = new Date()
    const todayKey = dateKey(now)
    const monthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-`

    const asc = [...records].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )
    const byUser = {}
    for (const r of asc) {
      ;(byUser[r.user_id] ||= []).push(r)
    }

    return profiles
      .filter((p) => p.role === 'employee')
      .map((p) => {
      const rows = byUser[p.id] || []
      const today = rows.filter((r) => dateKey(new Date(r.created_at)) === todayKey)
      const month = rows.filter((r) =>
        dateKey(new Date(r.created_at)).startsWith(monthPrefix),
      )
      const last = today[today.length - 1]
      const todayStatus = !last ? 'before' : last.type === 'check_in' ? 'working' : 'done'
      return {
        id: p.id,
        name: p.name || p.id,
        todayStatus,
        todayMs: totalMs(today, now),
        monthMs: totalMs(month, now),
      }
    })
  }, [records, profiles])

  const workingNow = summary.filter((s) => s.todayStatus === 'working').length

  // 출근→퇴근을 한 세트(세션)로 그룹핑
  const sessions = useMemo(() => {
    const asc = [...records].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )
    const byUser = {}
    for (const r of asc) (byUser[r.user_id] ||= []).push(r)

    const make = (uid, ci, co) => {
      const anchor = ci || co
      return {
        key: `${ci?.id || 'x'}_${co?.id || 'x'}`,
        userId: uid,
        checkIn: ci,
        checkOut: co,
        date: new Date(anchor.created_at),
        durationMs: ci && co ? new Date(co.created_at) - new Date(ci.created_at) : null,
        sortTime: new Date((co || ci).created_at).getTime(),
        ids: [ci?.id, co?.id].filter(Boolean),
        photoUrls: [ci?.photo_url, co?.photo_url].filter(Boolean),
      }
    }

    const out = []
    for (const [uid, rows] of Object.entries(byUser)) {
      let open = null
      for (const r of rows) {
        if (r.type === 'check_in') {
          if (open) out.push(make(uid, open, null))
          open = r
        } else {
          if (open) {
            out.push(make(uid, open, r))
            open = null
          } else {
            out.push(make(uid, null, r))
          }
        }
      }
      if (open) out.push(make(uid, open, null))
    }
    return out.sort((a, b) => b.sortTime - a.sortTime)
  }, [records])

  // 직원별로 세션 그룹핑 (폴더)
  const sessionsByUser = useMemo(() => {
    const map = {}
    for (const s of sessions) (map[s.userId] ||= []).push(s)
    return map
  }, [sessions])

  const folderList = useMemo(
    () =>
      Object.keys(sessionsByUser)
        .map((uid) => ({
          userId: uid,
          name: names[uid] || '알 수 없음',
          count: sessionsByUser[uid].length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [sessionsByUser, names],
  )

  // 세션(출근+퇴근 세트) 삭제 → 기록 + 사진 함께 삭제
  async function deleteSession(s) {
    const who = names[s.userId] || '직원'
    const dateStr = s.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    if (
      !window.confirm(
        `${who}님의 ${dateStr} 근무 기록(출근·퇴근)을 삭제할까요?\n사진과 기록이 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    )
      return

    setDeleting(s.key)
    try {
      const { error } = await supabase.from('attendance').delete().in('id', s.ids)
      if (error) throw error
      const paths = s.photoUrls.map(extractStoragePath).filter(Boolean)
      if (paths.length) {
        await supabase.storage.from('attendance-photos').remove(paths)
      }
      await load()
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  // 근무 기록 엑셀(.xlsx) 다운로드
  function downloadExcel() {
    const fmtTime = (r) =>
      r
        ? new Date(r.created_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : ''
    const header = ['이름', '날짜', '출근', '퇴근', '근무시간', '근무시간(시간)']
    const data = [...sessions]
      .sort((a, b) => {
        // 사람별로 묶고(이름 순), 같은 사람 안에서는 시간 순
        const na = names[a.userId] || ''
        const nb = names[b.userId] || ''
        if (na !== nb) return na.localeCompare(nb, 'ko')
        return a.sortTime - b.sortTime
      })
      .map((s) => {
        const name = names[s.userId] || '알 수 없음'
        const dateStr = `${s.date.getFullYear()}-${pad(s.date.getMonth() + 1)}-${pad(s.date.getDate())}`
        const dur = s.durationMs != null ? fmtHours(s.durationMs) : ''
        const hours = s.durationMs != null ? Number((s.durationMs / 3600000).toFixed(2)) : ''
        return [name, dateStr, fmtTime(s.checkIn), fmtTime(s.checkOut), dur, hours]
      })
    const ws = XLSX.utils.aoa_to_sheet([header, ...data])
    ws['!cols'] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 8 },
      { wch: 8 },
      { wch: 12 },
      { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '근무기록')
    const now = new Date()
    XLSX.writeFile(
      wb,
      `근무기록_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`,
    )
  }

  async function useMyLocation() {
    try {
      const c = await getCurrentPosition()
      setNewOffice((o) => ({ ...o, lat: c.lat, lng: c.lng }))
    } catch {
      setOfficeMsg('❌ 현재 위치를 가져오지 못했어요.')
    }
  }

  function startEdit(o) {
    setEditingId(o.id)
    setEditForm({
      name: o.name || '',
      lat: o.lat ?? '',
      lng: o.lng ?? '',
      radius: o.radius ?? 100,
    })
    setOfficeMsg('')
  }

  function cancelEdit() {
    setEditingId(null)
    setOfficeMsg('')
  }

  async function editUseMyLocation() {
    try {
      const c = await getCurrentPosition()
      setEditForm((f) => ({ ...f, lat: c.lat, lng: c.lng }))
    } catch {
      setOfficeMsg('❌ 현재 위치를 가져오지 못했어요.')
    }
  }

  async function addOffice() {
    setSavingOffice(true)
    setOfficeMsg('')
    try {
      const lat = parseFloat(newOffice.lat)
      const lng = parseFloat(newOffice.lng)
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setOfficeMsg('❌ 위도/경도를 입력하거나 "내 위치 사용"을 눌러주세요.')
        return
      }
      const { error } = await supabase.from('offices').insert({
        name: newOffice.name || '근무지',
        lat,
        lng,
        radius: parseInt(newOffice.radius, 10) || 100,
      })
      if (error) throw error
      setNewOffice({ name: '', lat: '', lng: '', radius: 100 })
      setOfficeMsg('✅ 근무지가 추가되었어요.')
      await load()
    } catch (err) {
      setOfficeMsg('❌ 오류: ' + err.message + ' (offices 테이블 SQL을 실행했는지 확인하세요)')
    } finally {
      setSavingOffice(false)
    }
  }

  async function saveEdit() {
    setSavingOffice(true)
    setOfficeMsg('')
    try {
      const lat = parseFloat(editForm.lat)
      const lng = parseFloat(editForm.lng)
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setOfficeMsg('❌ 위도/경도를 입력하거나 "내 위치 사용"을 눌러주세요.')
        return
      }
      const { error } = await supabase
        .from('offices')
        .update({
          name: editForm.name || '근무지',
          lat,
          lng,
          radius: parseInt(editForm.radius, 10) || 100,
        })
        .eq('id', editingId)
      if (error) throw error
      setEditingId(null)
      setOfficeMsg('✅ 근무지가 수정되었어요.')
      await load()
    } catch (err) {
      setOfficeMsg('❌ 오류: ' + err.message)
    } finally {
      setSavingOffice(false)
    }
  }

  async function deleteOffice(id) {
    if (!window.confirm('이 근무지를 삭제할까요?')) return
    const { error } = await supabase.from('offices').delete().eq('id', id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    await load()
  }

  // 관리자 수기 출퇴근 입력: 직원이 깜빡한 날을 관리자가 채워넣음
  async function addManualRecord() {
    setSavingManual(true)
    setManualMsg('')
    try {
      if (!manual.userId) {
        setManualMsg('❌ 직원을 선택해주세요.')
        return
      }
      if (!manual.date) {
        setManualMsg('❌ 날짜를 선택해주세요.')
        return
      }
      if (!manual.checkIn && !manual.checkOut) {
        setManualMsg('❌ 출근 또는 퇴근 시각을 하나 이상 입력해주세요.')
        return
      }
      // 출근·퇴근 둘 다 넣을 땐 퇴근이 출근보다 빠르면 막기
      if (manual.checkIn && manual.checkOut && manual.checkOut <= manual.checkIn) {
        setManualMsg('❌ 퇴근 시각이 출근 시각보다 빠를 수 없어요.')
        return
      }

      // "YYYY-MM-DD" + "HH:MM" → 한국시간(+09:00) 기준 → DB에는 ISO(UTC)로 저장됨
      const toTs = (time) => new Date(`${manual.date}T${time}:00+09:00`).toISOString()

      const rows = []
      if (manual.checkIn) {
        rows.push({ user_id: manual.userId, type: 'check_in', created_at: toTs(manual.checkIn) })
      }
      if (manual.checkOut) {
        rows.push({ user_id: manual.userId, type: 'check_out', created_at: toTs(manual.checkOut) })
      }

      const { error } = await supabase.from('attendance').insert(rows)
      if (error) throw error

      setManual({ userId: '', date: '', checkIn: '', checkOut: '' })
      setManualMsg('✅ 근무 기록이 추가되었어요.')
      await load()
    } catch (err) {
      setManualMsg('❌ 오류: ' + err.message)
    } finally {
      setSavingManual(false)
    }
  }

  // 관리자 본인 이메일 변경
  async function updateEmail() {
    setSavingAccount(true)
    setAccountMsg('')
    try {
      if (!account.email) {
        setAccountMsg('❌ 이메일을 입력해주세요.')
        return
      }
      const { error } = await supabase.auth.updateUser({ email: account.email })
      if (error) throw error
      setAccountMsg('✅ 이메일 변경 요청됨. 새 이메일로 온 확인 메일의 링크를 눌러야 최종 적용돼요.')
    } catch (err) {
      setAccountMsg('❌ 오류: ' + err.message)
    } finally {
      setSavingAccount(false)
    }
  }

  // 관리자 본인 비밀번호 변경
  async function updatePassword() {
    setSavingAccount(true)
    setAccountMsg('')
    try {
      if (!account.password || account.password.length < 6) {
        setAccountMsg('❌ 비밀번호는 6자 이상이어야 해요.')
        return
      }
      if (account.password !== account.password2) {
        setAccountMsg('❌ 두 비밀번호가 일치하지 않아요.')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: account.password })
      if (error) throw error
      setAccount((a) => ({ ...a, password: '', password2: '' }))
      setAccountMsg('✅ 비밀번호가 변경되었어요.')
    } catch (err) {
      setAccountMsg('❌ 오류: ' + err.message)
    } finally {
      setSavingAccount(false)
    }
  }

  return (
    <div className="min-h-screen pb-10">
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">관리자</p>
          <p className="font-semibold text-white">{profile?.name || '관리자'}님</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-sm text-fuchsia-400 hover:text-fuchsia-300">
            새로고침
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
        {/* 요약 */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`${CARD} p-4 text-center`}>
            <div className="text-xs text-slate-500 mb-1">전체 직원</div>
            <div className="text-xl font-bold text-white">{summary.length}명</div>
          </div>
          <div className={`${CARD} p-4 text-center`}>
            <div className="text-xs text-slate-500 mb-1">현재 근무 중</div>
            <div className="text-xl font-bold text-amber-300">{workingNow}명</div>
          </div>
        </div>

        {/* 사업장 위치 설정 */}
        <div className={`${CARD} p-5`}>
          <h2 className="font-semibold text-white mb-3">근무지 위치설정</h2>

          {/* 등록된 근무지 목록 */}
          {offices.length > 0 && (
            <ul className="space-y-2 mb-4">
              {offices.map((o) => (
                <li key={o.id} className="rounded-lg border border-white/10 bg-white/5">
                  {editingId === o.id ? (
                    // 인라인 수정 폼
                    <div className="p-3 space-y-2">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="근무지 이름"
                        className={`w-full ${INPUT}`}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={editForm.lat}
                          onChange={(e) => setEditForm((f) => ({ ...f, lat: e.target.value }))}
                          placeholder="위도"
                          className={INPUT}
                        />
                        <input
                          value={editForm.lng}
                          onChange={(e) => setEditForm((f) => ({ ...f, lng: e.target.value }))}
                          placeholder="경도"
                          className={INPUT}
                        />
                        <input
                          value={editForm.radius}
                          onChange={(e) => setEditForm((f) => ({ ...f, radius: e.target.value }))}
                          placeholder="반경(m)"
                          className={INPUT}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={editUseMyLocation}
                          className="bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 text-xs font-medium py-2 rounded-lg transition"
                        >
                          내 위치
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={savingOffice}
                          className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition"
                        >
                          {savingOffice ? '저장 중…' : '저장'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-medium py-2 rounded-lg transition"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    // 일반 표시
                    <div className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{o.name || '근무지'}</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {Number(o.lat).toFixed(5)}, {Number(o.lng).toFixed(5)} · 반경 {o.radius || 100}m
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => startEdit(o)}
                          className="text-xs text-sky-300 border border-sky-400/30 hover:bg-sky-500 hover:text-white px-2.5 py-1 rounded-lg transition"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => deleteOffice(o.id)}
                          className="text-xs text-rose-300 border border-rose-400/30 hover:bg-rose-500 hover:text-white px-2.5 py-1 rounded-lg transition"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* 근무지 추가 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
              <span className="text-fuchsia-300 text-lg leading-none">＋</span> 근무지 추가
            </div>
            <input
              value={newOffice.name}
              onChange={(e) => setNewOffice((o) => ({ ...o, name: e.target.value }))}
              placeholder="근무지 이름 (예: 본사)"
              className={`w-full mb-2 ${INPUT}`}
            />
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input
                value={newOffice.lat}
                onChange={(e) => setNewOffice((o) => ({ ...o, lat: e.target.value }))}
                placeholder="위도"
                className={INPUT}
              />
              <input
                value={newOffice.lng}
                onChange={(e) => setNewOffice((o) => ({ ...o, lng: e.target.value }))}
                placeholder="경도"
                className={INPUT}
              />
              <input
                value={newOffice.radius}
                onChange={(e) => setNewOffice((o) => ({ ...o, radius: e.target.value }))}
                placeholder="반경(m)"
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={useMyLocation}
                className="bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 font-medium py-2.5 rounded-lg text-sm transition"
              >
                내 현재 위치 사용
              </button>
              <button
                onClick={addOffice}
                disabled={savingOffice}
                className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm shadow-lg shadow-fuchsia-500/20 transition"
              >
                {savingOffice ? '추가 중…' : '＋ 근무지 추가'}
              </button>
            </div>
          </div>
          {officeMsg && <p className="text-sm mt-2 text-slate-200">{officeMsg}</p>}
        </div>

        {/* 직원 근태 현황 (상태별 3칸) */}
        <div className={`${CARD} p-5`}>
          <h2 className="font-semibold text-white mb-4">직원 근무 현황</h2>
          {summary.length === 0 ? (
            <p className="text-sm text-slate-400">아직 등록된 직원이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatusColumn
                title="출근 전"
                color="slate"
                people={summary.filter((s) => s.todayStatus === 'before')}
              />
              <StatusColumn
                title="근무 중"
                color="amber"
                people={summary.filter((s) => s.todayStatus === 'working')}
              />
              <StatusColumn
                title="퇴근"
                color="emerald"
                people={summary.filter((s) => s.todayStatus === 'done')}
              />
            </div>
          )}
        </div>

        {/* 수기 출퇴근 입력 (관리자 보정용) */}
        <div className={`${CARD} p-5`}>
          <h2 className="font-semibold text-white mb-1">출퇴근 기록 수기 입력</h2>
          <p className="text-xs text-slate-400 mb-3">
            직원이 체크를 깜빡한 날, 관리자가 출근·퇴근 시각을 직접 입력해 기록을 채워넣을 수 있어요.
          </p>

          <div className="space-y-2">
            {/* 직원 선택 */}
            <select
              value={manual.userId}
              onChange={(e) => setManual((m) => ({ ...m, userId: e.target.value }))}
              className={`w-full ${INPUT}`}
            >
              <option value="">직원 선택…</option>
              {profiles
                .filter((p) => p.role === 'employee')
                .map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-800">
                    {p.name || '이름없음'}
                  </option>
                ))}
            </select>

            {/* 날짜 */}
            <input
              type="date"
              value={manual.date}
              onChange={(e) => setManual((m) => ({ ...m, date: e.target.value }))}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className={`w-full cursor-pointer ${INPUT}`}
            />

            {/* 출근 / 퇴근 시각 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">출근 시각</label>
                <input
                  type="time"
                  value={manual.checkIn}
                  onChange={(e) => setManual((m) => ({ ...m, checkIn: e.target.value }))}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className={`w-full cursor-pointer ${INPUT}`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">퇴근 시각</label>
                <input
                  type="time"
                  value={manual.checkOut}
                  onChange={(e) => setManual((m) => ({ ...m, checkOut: e.target.value }))}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className={`w-full cursor-pointer ${INPUT}`}
                />
              </div>
            </div>

            <button
              onClick={addManualRecord}
              disabled={savingManual}
              className="w-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm shadow-lg shadow-fuchsia-500/20 transition"
            >
              {savingManual ? '추가 중…' : '＋ 기록 추가'}
            </button>
          </div>

          {manualMsg && <p className="text-sm mt-2 text-slate-200">{manualMsg}</p>}
        </div>

        {/* 내 계정 설정 (관리자 본인 이메일/비밀번호 변경) */}
        <div className={`${CARD} p-5`}>
          <h2 className="font-semibold text-white mb-1">내 계정 설정</h2>
          <p className="text-xs text-slate-400 mb-3">
            로그인에 쓰는 이메일과 비밀번호를 변경할 수 있어요.
          </p>

          {/* 이메일 변경 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-3">
            <div className="text-sm font-semibold text-slate-200 mb-2">이메일 변경</div>
            <input
              type="email"
              value={account.email}
              onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              placeholder="새 이메일 주소"
              className={`w-full mb-2 ${INPUT}`}
            />
            <button
              onClick={updateEmail}
              disabled={savingAccount}
              className="w-full bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 font-medium py-2.5 rounded-lg text-sm transition disabled:opacity-50"
            >
              {savingAccount ? '처리 중…' : '이메일 변경'}
            </button>
          </div>

          {/* 비밀번호 변경 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-sm font-semibold text-slate-200 mb-2">비밀번호 변경</div>
            <input
              type="password"
              value={account.password}
              onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
              placeholder="새 비밀번호 (6자 이상)"
              className={`w-full mb-2 ${INPUT}`}
            />
            <input
              type="password"
              value={account.password2}
              onChange={(e) => setAccount((a) => ({ ...a, password2: e.target.value }))}
              placeholder="새 비밀번호 확인"
              className={`w-full mb-2 ${INPUT}`}
            />
            <button
              onClick={updatePassword}
              disabled={savingAccount}
              className="w-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm shadow-lg shadow-fuchsia-500/20 transition"
            >
              {savingAccount ? '처리 중…' : '비밀번호 변경'}
            </button>
          </div>

          {accountMsg && <p className="text-sm mt-3 text-slate-200">{accountMsg}</p>}
        </div>

        {/* 직원별 근무 캘린더 */}
        <EmployeeCalendar records={records} profiles={profiles} />

        {/* 전체 근무 기록 (출근·퇴근 세트, 관리자 삭제 가능) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-lg font-bold text-white">전체 근무 기록</h1>
            <button
              onClick={downloadExcel}
              disabled={sessions.length === 0}
              className="text-sm text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500 hover:text-white px-3 py-1.5 rounded-lg transition disabled:opacity-40"
            >
              ⬇ 엑셀 다운로드
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            직원을 선택하면 해당 직원의 근무 기록을 볼 수 있어요. 삭제하면 사진·기록이 함께 지워지고 통계·캘린더에도 반영돼요.
          </p>
          {loading ? (
            <p className="text-slate-400">불러오는 중...</p>
          ) : folderList.length === 0 ? (
            <p className="text-slate-500">아직 기록이 없습니다.</p>
          ) : openUserId ? (
            <div>
              <button
                onClick={() => setOpenUserId(null)}
                className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/15 hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                직원 목록으로 돌아가기
              </button>
              <p className="font-semibold text-white mb-3">
                {names[openUserId] || '알 수 없음'}
                <span className="ml-2 text-xs text-slate-400">
                  {(sessionsByUser[openUserId] || []).length}건
                </span>
              </p>
              {(sessionsByUser[openUserId] || []).length === 0 ? (
                <p className="text-slate-500 text-sm">기록이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {(sessionsByUser[openUserId] || []).map((s) => (
                    <SessionCard
                      key={s.key}
                      s={s}
                      name={names[openUserId] || '알 수 없음'}
                      deleting={deleting}
                      onDelete={deleteSession}
                      onZoom={setZoom}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {folderList.map((f) => (
                <button
                  key={f.userId}
                  onClick={() => setOpenUserId(f.userId)}
                  className={`${CARD} w-full flex items-center gap-3 p-4 text-left transition hover:bg-white/[0.09]`}
                >
                  <span className="text-2xl">📁</span>
                  <span className="font-semibold text-white">{f.name}</span>
                  <span className="text-xs text-slate-400">{f.count}건</span>
                  <svg
                    className="ml-auto h-5 w-5 text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 사진 크게 보기 */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
        >
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}

// 공개 URL에서 스토리지 경로(userId/파일명) 추출
function extractStoragePath(publicUrl) {
  if (!publicUrl) return null
  const marker = '/attendance-photos/'
  const i = publicUrl.indexOf(marker)
  return i === -1 ? null : publicUrl.slice(i + marker.length)
}

// 출근/퇴근 한 칸 (사진 + 시간)
function PunchCell({ label, record, color, onZoom }) {
  const badge =
    color === 'blue' ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'
  return (
    <div className="rounded-xl border border-white/10 p-2">
      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${badge}`}>
        {label}
      </span>
      {record ? (
        <>
          {record.photo_url ? (
            <img
              src={record.photo_url}
              alt=""
              onClick={() => onZoom(record.photo_url)}
              className="mt-2 w-full aspect-[4/1] object-cover rounded-lg cursor-pointer hover:opacity-80"
            />
          ) : (
            <div className="mt-2 w-full aspect-[4/1] rounded-lg bg-white/10 flex items-center justify-center text-2xl text-slate-400">
              📍
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400 tabular-nums">
            {new Date(record.created_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {record.distance != null && (
              <span className="text-slate-500"> · {record.distance}m</span>
            )}
          </p>
        </>
      ) : (
        <div className="mt-2 w-full aspect-[4/1] rounded-lg bg-white/5 flex items-center justify-center text-xs text-slate-600">
          기록 없음
        </div>
      )}
    </div>
  )
}

// 근태 상태별 칸 (출근 전 / 근무 중 / 퇴근)
function StatusColumn({ title, color, people }) {
  const styles = {
    slate: 'bg-slate-400 text-slate-300',
    amber: 'bg-amber-400 text-amber-300',
    emerald: 'bg-emerald-400 text-emerald-300',
  }[color]
  const [dot, text] = styles.split(' ')
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className={`text-xs font-semibold ${text}`}>{title}</span>
        <span className="text-[11px] text-slate-500">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="text-[11px] text-slate-600 py-1">-</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li key={p.id} className="rounded-lg bg-white/5 px-2 py-1.5">
              <div className="text-sm text-slate-100 truncate">{p.name}</div>
              <div className="text-[11px] text-slate-400 tabular-nums">{fmtHours(p.todayMs)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 근무 세션 카드 (출근+퇴근 + 삭제)
function SessionCard({ s, name, deleting, onDelete, onZoom }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{name}</p>
          <p className="text-xs text-slate-400">
            {s.date.toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            })}
            {s.durationMs != null ? (
              <span className="ml-2 font-medium text-sky-300">· {fmtHours(s.durationMs)}</span>
            ) : (
              <span className="ml-2 text-amber-300">· 미퇴근</span>
            )}
          </p>
        </div>
        <button
          onClick={() => onDelete(s)}
          disabled={deleting === s.key}
          className="shrink-0 text-sm text-rose-300 border border-rose-400/30 hover:bg-rose-500 hover:text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          {deleting === s.key ? '삭제 중…' : '🗑 삭제'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PunchCell label="출근" record={s.checkIn} color="blue" onZoom={onZoom} />
        <PunchCell label="퇴근" record={s.checkOut} color="orange" onZoom={onZoom} />
      </div>
    </div>
  )
}

// 직원별 근무 캘린더 (관리자용): 직원 선택 → 월별 근무시간 달력
function EmployeeCalendar({ records, profiles }) {
  const [selectedId, setSelectedId] = useState('')
  const [cursor, setCursor] = useState(new Date())

  // 관리자 제외, 직원(employee)만 표시
  const employees = profiles.filter((p) => p.role === 'employee')

  // 직원 목록이 로드되면 첫 직원 자동 선택
  useEffect(() => {
    if (!selectedId && employees[0]) setSelectedId(employees[0].id)
  }, [profiles, selectedId])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const dayTotals = useMemo(() => {
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 1)
    const rows = records
      .filter(
        (r) =>
          r.user_id === selectedId &&
          new Date(r.created_at) >= start &&
          new Date(r.created_at) < end,
      )
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return dailyTotals(rows, new Date())
  }, [records, selectedId, year, month])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const workedDays = Object.keys(dayTotals).filter((k) => dayTotals[k] > 0)
  const monthTotalMs = workedDays.reduce((s, k) => s + dayTotals[k], 0)
  const avgMs = workedDays.length ? monthTotalMs / workedDays.length : 0

  return (
    <div className={`${CARD} p-5`}>
      <h2 className="font-semibold text-white mb-3">직원별 근무 캘린더</h2>

      {employees.length === 0 ? (
        <p className="text-sm text-slate-400">직원이 없습니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {employees.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  selectedId === p.id
                    ? 'bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white shadow-lg shadow-fuchsia-500/20'
                    : 'bg-white/10 text-slate-300 hover:bg-white/15'
                }`}
              >
                {p.name || '이름없음'}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="w-8 h-8 rounded-lg bg-white/10 text-slate-300"
            >
              ‹
            </button>
            <div className="font-bold text-white">
              {year}년 {month + 1}월
            </div>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="w-8 h-8 rounded-lg bg-white/10 text-slate-300"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <div key={d} className="text-center text-[11px] text-slate-500 pb-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="aspect-square" />
              const k = `${year}-${pad(month + 1)}-${pad(d)}`
              const ms = dayTotals[k] || 0
              const worked = ms > 0
              return (
                <div
                  key={i}
                  title={worked ? fmtHours(ms) : ''}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] ${
                    worked ? 'bg-emerald-500/15 border border-emerald-400/30' : 'bg-white/5'
                  }`}
                >
                  <span className={worked ? 'text-slate-100' : 'text-slate-500'}>{d}</span>
                  {worked && (
                    <span className="text-[9px] font-bold text-emerald-300">
                      {(ms / 3600000).toFixed(1)}h
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <AdminStat label="근무일" value={`${workedDays.length}일`} />
            <AdminStat label="총 근무시간" value={fmtHours(monthTotalMs)} />
            <AdminStat label="일 평균" value={fmtHours(avgMs)} />
          </div>
        </>
      )}
    </div>
  )
}

function AdminStat({ label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
      <div className="text-[10px] text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  )
}
