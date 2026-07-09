import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import {
  pad,
  dateKey,
  fmtHours,
  dailyTotals,
  distanceMeters,
  getCurrentPosition,
} from '../lib/attendance'

const CARD = 'rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-xl shadow-black/20'

export default function EmployeeHome({ session, profile }) {
  const userId = session.user.id
  const [tab, setTab] = useState('punch')
  const [now, setNow] = useState(new Date())

  // 실시간 시계
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen pb-24">
      {/* 상단 바 */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">TIME TRACK</p>
          <p className="font-semibold text-white">{profile?.name || '직원'}님</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          로그아웃
        </button>
      </header>

      <main className="max-w-md mx-auto px-4">
        {tab === 'punch' && <PunchTab userId={userId} now={now} />}
        {tab === 'calendar' && <CalendarTab userId={userId} />}
        {tab === 'gps' && <GpsTab userId={userId} />}
      </main>

      {/* 하단 탭바 */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/5 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-md mx-auto grid grid-cols-3">
          {[
            { id: 'punch', label: '출퇴근', icon: '🕘' },
            { id: 'calendar', label: '통계', icon: '📅' },
            { id: 'gps', label: '위치체크인', icon: '📍' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-xs font-medium transition ${
                tab === t.id ? 'text-fuchsia-400' : 'text-slate-500'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 탭 1: 사진 인증 출퇴근 + 누적 근무시간
// ---------------------------------------------------------------------------
function PunchTab({ userId, now }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [records, setRecords] = useState([]) // 오늘 기록 (내림차순)

  useEffect(() => {
    loadToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadToday() {
    // 이번주·이번달 계산을 위해 (주 시작 or 월 시작 중 이른 날)부터 불러옴
    const n = new Date()
    const monthStart = new Date(n.getFullYear(), n.getMonth(), 1)
    const weekStart = new Date(n)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const rangeStart = weekStart < monthStart ? weekStart : monthStart
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', rangeStart.toISOString())
      .order('created_at', { ascending: false })
    setRecords(data || [])
  }

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setMessage('')
  }

  async function handleCheck(type) {
    if (!file) {
      setMessage('먼저 사진을 촬영해주세요.')
      return
    }
    setUploading(true)
    setMessage('')
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${userId}/${Date.now()}-${type}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('attendance-photos')
        .upload(path, file)
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(path)

      const { error: insErr } = await supabase.from('attendance').insert({
        user_id: userId,
        type,
        photo_url: urlData.publicUrl,
      })
      if (insErr) throw insErr

      setMessage(type === 'check_in' ? '✅ 출근 완료!' : '✅ 퇴근 완료!')
      setFile(null)
      setPreview(null)
      loadToday()
    } catch (err) {
      setMessage('❌ 오류: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  // 오늘/이번주/이번달 누적 근무시간
  const stats = useMemo(() => {
    const asc = [...records].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )
    const dt = dailyTotals(asc, now)
    const todayKey = dateKey(now)
    const monthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-`
    const ws = new Date(now)
    ws.setHours(0, 0, 0, 0)
    ws.setDate(ws.getDate() - ws.getDay())
    const weekStartKey = dateKey(ws)
    let today = 0
    let week = 0
    let month = 0
    for (const k in dt) {
      if (k === todayKey) today += dt[k]
      if (k >= weekStartKey) week += dt[k]
      if (k.startsWith(monthPrefix)) month += dt[k]
    }
    return { today, week, month }
  }, [records, now])

  // 오늘 기록만 (상태 배지 + 목록용, 최신순)
  const todayRecords = useMemo(() => {
    const tk = dateKey(now)
    return records
      .filter((r) => dateKey(new Date(r.created_at)) === tk)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [records, now])

  const last = todayRecords[0]
  const status = !last ? 'before' : last.type === 'check_in' ? 'working' : 'done'
  const statusLabel = { before: '출근 전', working: '근무 중', done: '퇴근' }[status]
  const statusColor = {
    before: 'bg-white/10 text-slate-400',
    working: 'bg-amber-500/20 text-amber-300',
    done: 'bg-emerald-500/20 text-emerald-300',
  }[status]

  return (
    <>
      {/* 현재 시간 + 상태 */}
      <div className={`${CARD} p-6 mt-4 text-center`}>
        <p className="text-slate-400 text-sm">
          {now.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </p>
        <p className="text-4xl font-bold text-white mt-1 tabular-nums">
          {now.toLocaleTimeString('ko-KR')}
        </p>
        <span
          className={`inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}
        >
          {statusLabel}
        </span>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="오늘" value={fmtHours(stats.today)} />
          <Stat label="이번주" value={fmtHours(stats.week)} />
          <Stat label="이번달" value={fmtHours(stats.month)} />
        </div>
      </div>

      {/* 사진 촬영 */}
      <div className={`${CARD} p-6 mt-4`}>
        <h2 className="font-semibold text-white mb-3">사진으로 인증</h2>

        {preview ? (
          <img src={preview} alt="촬영한 사진" className="w-full aspect-[2/1] rounded-xl mb-3 object-cover" />
        ) : (
          <div className="w-full aspect-[2/1] bg-white/5 border border-white/10 rounded-xl mb-3 flex items-center justify-center text-slate-500 text-sm">
            사진을 촬영하면 여기에 표시됩니다
          </div>
        )}

        <label className="block w-full text-center bg-white/10 hover:bg-white/15 border border-white/10 text-slate-100 font-medium py-2.5 rounded-lg cursor-pointer transition">
          {preview ? '다시 촬영' : '카메라 열기 / 사진 선택'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={() => handleCheck('check_in')}
            disabled={uploading || !file}
            className="bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-40 text-white font-semibold py-3 rounded-lg shadow-lg shadow-indigo-500/20 transition"
          >
            {uploading ? '...' : '출근'}
          </button>
          <button
            onClick={() => handleCheck('check_out')}
            disabled={uploading || !file}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-white font-semibold py-3 rounded-lg shadow-lg shadow-orange-500/20 transition"
          >
            {uploading ? '...' : '퇴근'}
          </button>
        </div>

        {message && (
          <p className="text-center text-sm mt-3 font-medium text-slate-200">{message}</p>
        )}
      </div>

      {/* 오늘 내 기록 */}
      <div className={`${CARD} p-6 mt-4`}>
        <h2 className="font-semibold text-white mb-3">오늘 내 기록</h2>
        {todayRecords.length === 0 ? (
          <p className="text-sm text-slate-400">아직 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {todayRecords.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                {r.photo_url ? (
                  <img src={r.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-slate-400">
                    📍
                  </div>
                )}
                <div className="flex-1">
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                      r.type === 'check_in'
                        ? 'bg-sky-500/20 text-sky-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {r.type === 'check_in' ? '출근' : '퇴근'}
                  </span>
                </div>
                <span className="text-sm text-slate-400 tabular-nums">
                  {new Date(r.created_at).toLocaleTimeString('ko-KR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 탭 2: 통계 / 캘린더
// ---------------------------------------------------------------------------
function CalendarTab({ userId }) {
  const [cursor, setCursor] = useState(new Date())
  const [dayTotals, setDayTotals] = useState({})
  const [loading, setLoading] = useState(true)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 1)
      const { data } = await supabase
        .from('attendance')
        .select('type, created_at')
        .eq('user_id', userId)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: true })
      if (!cancelled) {
        setDayTotals(dailyTotals(data || [], new Date()))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, year, month])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const workedDays = Object.keys(dayTotals).filter((k) => dayTotals[k] > 0)
  const monthTotalMs = workedDays.reduce((s, k) => s + dayTotals[k], 0)
  const avgMs = workedDays.length ? monthTotalMs / workedDays.length : 0

  return (
    <div className={`${CARD} p-5 mt-4`}>
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
        <Stat label="근무일" value={`${workedDays.length}일`} />
        <Stat label="총 근무시간" value={fmtHours(monthTotalMs)} />
        <Stat label="일 평균" value={fmtHours(avgMs)} />
      </div>
      {loading && <p className="text-sm text-slate-500 mt-3 text-center">불러오는 중...</p>}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
      <div className="text-[10px] text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 탭 3: GPS 위치 기반 체크인
// ---------------------------------------------------------------------------
function GpsTab({ userId }) {
  const [offices, setOffices] = useState([])
  const [coords, setCoords] = useState(null)
  const [nearest, setNearest] = useState(null) // { office, distance }
  const [status, setStatus] = useState('idle') // idle | locating | done | error
  const [errMsg, setErrMsg] = useState('')
  const [punching, setPunching] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('offices').select('*')
      setOffices(data || [])
    })()
  }, [])

  async function locate() {
    setStatus('locating')
    setErrMsg('')
    setMessage('')
    try {
      const c = await getCurrentPosition()
      setCoords(c)
      // 등록된 근무지 중 가장 가까운 곳 찾기
      let best = null
      for (const o of offices) {
        if (o.lat == null || o.lng == null) continue
        const d = distanceMeters(c.lat, c.lng, o.lat, o.lng)
        if (!best || d < best.distance) best = { office: o, distance: d }
      }
      setNearest(best)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrMsg(
        err.code === 1
          ? '위치 권한이 거부되었어요. 브라우저 설정에서 허용해주세요.'
          : '위치를 가져오지 못했어요.',
      )
    }
  }

  const withinRange = nearest && nearest.distance <= (nearest.office.radius || 100)

  async function punchWithLocation() {
    setPunching(true)
    setMessage('')
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const { data: today } = await supabase
        .from('attendance')
        .select('type, created_at')
        .eq('user_id', userId)
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
      const last = today && today[0]
      const type = last && last.type === 'check_in' ? 'check_out' : 'check_in'

      const { error } = await supabase.from('attendance').insert({
        user_id: userId,
        type,
        photo_url: null,
        lat: coords.lat,
        lng: coords.lng,
        distance: Math.round(nearest?.distance || 0),
      })
      if (error) throw error
      setMessage(
        `✅ ${type === 'check_in' ? '출근' : '퇴근'} 기록됨. '출퇴근' 탭에서 확인하세요.`,
      )
    } catch (err) {
      setMessage('❌ 오류: ' + err.message)
    } finally {
      setPunching(false)
    }
  }

  return (
    <div className={`${CARD} p-6 mt-4`}>
      <h2 className="font-semibold text-white mb-4">위치 기반 체크인</h2>

      {offices.length === 0 ? (
        <p className="text-sm text-slate-400">
          관리자가 아직 근무지를 설정하지 않았어요. 관리자에게 요청해주세요.
        </p>
      ) : (
        <>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-4">
            <div className="text-sm text-slate-300">
              등록된 근무지 <strong className="text-white">{offices.length}곳</strong>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              가장 가까운 근무지 기준으로 체크인돼요.
            </div>
          </div>

          <button
            onClick={locate}
            disabled={status === 'locating'}
            className="w-full bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50 text-slate-100 font-medium py-2.5 rounded-lg transition"
          >
            {status === 'locating' ? '위치 확인 중…' : '현재 위치 확인하기'}
          </button>

          {status === 'error' && <p className="text-sm text-rose-300 mt-3">{errMsg}</p>}

          {status === 'done' && nearest && (
            <div
              className={`mt-4 rounded-xl p-3 text-center ${
                withinRange ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              <div className="text-sm">
                <strong>{nearest.office.name || '근무지'}</strong>까지{' '}
                <strong>{Math.round(nearest.distance)}m</strong>
              </div>
              <div className="text-sm font-bold mt-1">
                {withinRange ? '✓ 근무지 범위 안에 있어요' : '✗ 근무지 범위를 벗어났어요'}
              </div>
            </div>
          )}

          {status === 'done' && coords && (
            <button
              onClick={punchWithLocation}
              disabled={punching}
              className={`w-full mt-3 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 ${
                withinRange
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 shadow-lg shadow-indigo-500/20'
                  : 'bg-rose-500 hover:bg-rose-600'
              }`}
            >
              {punching
                ? '기록 중…'
                : withinRange
                  ? '이 위치로 출퇴근 기록하기'
                  : '범위 밖이지만 그래도 기록하기'}
            </button>
          )}

          {message && (
            <p className="text-center text-sm mt-3 font-medium text-slate-200">{message}</p>
          )}
        </>
      )}
    </div>
  )
}
