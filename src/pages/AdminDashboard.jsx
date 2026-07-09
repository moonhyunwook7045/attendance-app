import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { pad, dateKey, fmtHours, totalMs, getCurrentPosition } from '../lib/attendance'

export default function AdminDashboard({ profile }) {
  const [records, setRecords] = useState([])
  const [names, setNames] = useState({})
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null) // 크게 볼 사진 URL

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

        {/* 전체 출퇴근 기록 */}
        <div>
          <h1 className="text-lg font-bold text-gray-800 mb-3">전체 출퇴근 기록</h1>
          {loading ? (
            <p className="text-gray-500">불러오는 중...</p>
          ) : records.length === 0 ? (
            <p className="text-gray-400">아직 기록이 없습니다.</p>
          ) : (
            <div className="bg-white rounded-2xl shadow divide-y">
              {records.map((r) => (
                <div key={r.id} className="flex items-center gap-4 p-4">
                  {r.photo_url ? (
                    <img
                      src={r.photo_url}
                      alt=""
                      onClick={() => setZoom(r.photo_url)}
                      className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xl">
                      📍
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {names[r.user_id] || '알 수 없음'}
                    </p>
                    <span
                      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mt-1 ${
                        r.type === 'check_in'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {r.type === 'check_in' ? '출근' : '퇴근'}
                    </span>
                    {r.distance != null && (
                      <span className="ml-2 text-[11px] text-gray-400">📍 {r.distance}m</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 text-right whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
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
