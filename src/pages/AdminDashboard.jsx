import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminDashboard({ profile }) {
  const [records, setRecords] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null) // 크게 볼 사진 URL

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

    // 직원 이름 매핑
    const { data: profs } = await supabase.from('profiles').select('id, name')
    const map = {}
    ;(profs || []).forEach((p) => {
      map[p.id] = p.name
    })

    setNames(map)
    setRecords(att || [])
    setLoading(false)
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

      <main className="max-w-3xl mx-auto px-4 mt-4">
        <h1 className="text-lg font-bold text-gray-800 mb-3">전체 출퇴근 기록</h1>

        {loading ? (
          <p className="text-gray-500">불러오는 중...</p>
        ) : records.length === 0 ? (
          <p className="text-gray-400">아직 기록이 없습니다.</p>
        ) : (
          <div className="bg-white rounded-2xl shadow divide-y">
            {records.map((r) => (
              <div key={r.id} className="flex items-center gap-4 p-4">
                <img
                  src={r.photo_url}
                  alt=""
                  onClick={() => setZoom(r.photo_url)}
                  className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80"
                />
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
