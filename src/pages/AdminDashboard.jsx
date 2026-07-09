import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { pad, dateKey, fmtHours, totalMs, dailyTotals, getCurrentPosition } from '../lib/attendance'

export default function AdminDashboard({ profile }) {
  const [records, setRecords] = useState([])
  const [names, setNames] = useState({})
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null) // 크게 볼 사진 URL
  const [deleting, setDeleting] = useState(null) // 삭제 중인 세션 key

  // 사업장 위치 설정
  const [office, setOffice] = useState({ name: '', lat: '', lng: '', radius: 100 })
  const [savingOffice, setSavingOffice] = useState(false)
  const [officeMsg, setOfficeMsg] = useState('')

  useEffect(() => {
    load()
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

    // 사업장 설정 (테이블이 아직 없어도 앱은 정상 동작)
    const { data: cfg } = await supabase
      .from('office_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (cfg) {
      setOffice({
        name: cfg.name || '',
        lat: cfg.lat ?? '',
        lng: cfg.lng ?? '',
        radius: cfg.radius ?? 100,
      })
    }

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

    // 오름차순 정렬본을 사용자별로 그룹핑
    const asc = [...records].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    )
    const byUser = {}
    for (const r of asc) {
      ;(byUser[r.user_id] ||= []).push(r)
    }

    return profiles.map((p) => {
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
      // 1) 출퇴근 기록 삭제 → 통계·캘린더에서도 사라짐
      const { error } = await supabase.from('attendance').delete().in('id', s.ids)
      if (error) throw error
      // 2) 사진 파일 삭제 (실패해도 기록은 이미 삭제됨)
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

  async function useMyLocation() {
    try {
      const c = await getCurrentPosition()
      setOffice((o) => ({ ...o, lat: c.lat, lng: c.lng }))
    } catch {
      setOfficeMsg('❌ 현재 위치를 가져오지 못했어요.')
    }
  }

  async function saveOffice() {
    setSavingOffice(true)
    setOfficeMsg('')
    try {
      const cfg = {
        id: 1,
        name: office.name || '사업장',
        lat: parseFloat(office.lat),
        lng: parseFloat(office.lng),
        radius: parseInt(office.radius, 10) || 100,
      }
      if (Number.isNaN(cfg.lat) || Number.isNaN(cfg.lng)) {
        setOfficeMsg('❌ 위도/경도를 입력하거나 "내 위치 사용"을 눌러주세요.')
        return
      }
      const { error } = await supabase.from('office_config').upsert(cfg)
      if (error) throw error
      setOfficeMsg('✅ 사업장 위치가 저장되었어요.')
    } catch (err) {
      setOfficeMsg('❌ 오류: ' + err.message + ' (office_config 테이블 SQL을 실행했는지 확인하세요)')
    } finally {
      setSavingOffice(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">관리자</p>
          <p className="font-semibold text-gray-800">{profile?.name || '관리자'}님</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-sm text-blue-600 hover:underline">
            새로고침
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
        {/* 요약 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl shadow p-4 text-center">
            <div className="text-xs text-gray-400 mb-1">전체 직원</div>
            <div className="text-xl font-bold text-gray-800">{profiles.length}명</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4 text-center">
            <div className="text-xs text-gray-400 mb-1">현재 근무 중</div>
            <div className="text-xl font-bold text-amber-600">{workingNow}명</div>
          </div>
        </div>

        {/* 사업장 위치 설정 */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-3">⚙️ 사업장 위치 설정</h2>
          <input
            value={office.name}
            onChange={(e) => setOffice((o) => ({ ...o, name: e.target.value }))}
            placeholder="사업장 이름"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input
              value={office.lat}
              onChange={(e) => setOffice((o) => ({ ...o, lat: e.target.value }))}
              placeholder="위도"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={office.lng}
              onChange={(e) => setOffice((o) => ({ ...o, lng: e.target.value }))}
              placeholder="경도"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={office.radius}
              onChange={(e) => setOffice((o) => ({ ...o, radius: e.target.value }))}
              placeholder="반경(m)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={useMyLocation}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg text-sm transition"
            >
              내 현재 위치 사용
            </button>
            <button
              onClick={saveOffice}
              disabled={savingOffice}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition"
            >
              {savingOffice ? '저장 중…' : '저장'}
            </button>
          </div>
          {officeMsg && <p className="text-sm mt-2 text-gray-700">{officeMsg}</p>}
        </div>

        {/* 직원 근태 현황 */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-gray-800 mb-3">직원 근태 현황</h2>
          {summary.length === 0 ? (
            <p className="text-sm text-gray-400">아직 등록된 직원이 없습니다.</p>
          ) : (
            <div className="divide-y">
              <div className="grid grid-cols-4 gap-2 text-[11px] text-gray-400 pb-2">
                <span>이름</span>
                <span>오늘 상태</span>
                <span className="text-right">오늘</span>
                <span className="text-right">이번 달</span>
              </div>
              {summary.map((s) => (
                <div key={s.id} className="grid grid-cols-4 gap-2 items-center py-2.5 text-sm">
                  <span className="text-gray-800 truncate">
                    {s.name}
                    {s.id === profile?.id ? ' (나)' : ''}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      s.todayStatus === 'working'
                        ? 'text-amber-600'
                        : s.todayStatus === 'done'
                          ? 'text-green-600'
                          : 'text-gray-400'
                    }`}
                  >
                    {{ before: '출근 전', working: '근무 중', done: '종료' }[s.todayStatus]}
                  </span>
                  <span className="text-right text-gray-600 tabular-nums">
                    {fmtHours(s.todayMs)}
                  </span>
                  <span className="text-right text-gray-600 tabular-nums">
                    {fmtHours(s.monthMs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 직원별 근무 캘린더 */}
        <EmployeeCalendar records={records} profiles={profiles} />

        {/* 전체 근무 기록 (출근·퇴근 세트, 관리자 삭제 가능) */}
        <div>
          <h1 className="text-lg font-bold text-gray-800 mb-1">전체 근무 기록</h1>
          <p className="text-xs text-gray-400 mb-3">
            출근·퇴근을 한 세트로 관리합니다. 삭제하면 사진과 기록이 함께 지워지고 통계·캘린더에도 반영돼요.
          </p>
          {loading ? (
            <p className="text-gray-500">불러오는 중...</p>
          ) : sessions.length === 0 ? (
            <p className="text-gray-400">아직 기록이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div key={s.key} className="bg-white rounded-2xl shadow p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">
                        {names[s.userId] || '알 수 없음'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.date.toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                        {s.durationMs != null ? (
                          <span className="ml-2 font-medium text-blue-600">
                            · {fmtHours(s.durationMs)}
                          </span>
                        ) : (
                          <span className="ml-2 text-amber-600">· 미퇴근</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteSession(s)}
                      disabled={deleting === s.key}
                      className="shrink-0 text-sm text-red-600 border border-red-200 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      {deleting === s.key ? '삭제 중…' : '🗑 삭제'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <PunchCell label="출근" record={s.checkIn} color="blue" onZoom={setZoom} />
                    <PunchCell label="퇴근" record={s.checkOut} color="orange" onZoom={setZoom} />
                  </div>
                </div>
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
  const badge = color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
  return (
    <div className="rounded-xl border border-gray-100 p-2">
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
              className="mt-2 w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80"
            />
          ) : (
            <div className="mt-2 w-full aspect-square rounded-lg bg-gray-100 flex items-center justify-center text-2xl text-gray-400">
              📍
            </div>
          )}
          <p className="mt-1 text-xs text-gray-600 tabular-nums">
            {new Date(record.created_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {record.distance != null && (
              <span className="text-gray-400"> · {record.distance}m</span>
            )}
          </p>
        </>
      ) : (
        <div className="mt-2 w-full aspect-square rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-300">
          기록 없음
        </div>
      )}
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
    <div className="bg-white rounded-2xl shadow p-5">
      <h2 className="font-semibold text-gray-800 mb-3">📅 직원별 근무 캘린더</h2>

      {/* 직원 선택 */}
      {employees.length === 0 ? (
        <p className="text-sm text-gray-400">직원이 없습니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {employees.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  selectedId === p.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.name || '이름없음'}
              </button>
            ))}
          </div>

          {/* 월 이동 */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600"
            >
              ‹
            </button>
            <div className="font-bold text-gray-800">
              {year}년 {month + 1}월
            </div>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <div key={d} className="text-center text-[11px] text-gray-400 pb-1">
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
                    worked ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <span className={worked ? 'text-gray-800' : 'text-gray-400'}>{d}</span>
                  {worked && (
                    <span className="text-[9px] font-bold text-green-600">
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
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-center">
      <div className="text-[10px] text-gray-400 mb-1">{label}</div>
      <div className="text-sm font-bold text-gray-800">{value}</div>
    </div>
  )
}
