import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function EmployeeHome({ session, profile }) {
  const userId = session.user.id
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [records, setRecords] = useState([])
  const [now, setNow] = useState(new Date())

  // 실시간 시계
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // 오늘 내 기록 불러오기
  useEffect(() => {
    loadToday()
  }, [])

  async function loadToday() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', start.toISOString())
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

      // 1) 사진 업로드
      const { error: upErr } = await supabase.storage
        .from('attendance-photos')
        .upload(path, file)
      if (upErr) throw upErr

      // 2) 공개 URL 가져오기
      const { data: urlData } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(path)

      // 3) 출퇴근 기록 저장
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

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      {/* 상단 바 */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">출퇴근 관리</p>
          <p className="font-semibold text-gray-800">{profile?.name || '직원'}님</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          로그아웃
        </button>
      </header>

      <main className="max-w-md mx-auto px-4">
        {/* 현재 시간 */}
        <div className="bg-white rounded-2xl shadow p-6 mt-4 text-center">
          <p className="text-gray-500 text-sm">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <p className="text-4xl font-bold text-gray-800 mt-1 tabular-nums">
            {now.toLocaleTimeString('ko-KR')}
          </p>
        </div>

        {/* 사진 촬영 */}
        <div className="bg-white rounded-2xl shadow p-6 mt-4">
          <h2 className="font-semibold text-gray-800 mb-3">📷 사진으로 인증</h2>

          {preview ? (
            <img src={preview} alt="촬영한 사진" className="w-full rounded-xl mb-3 object-cover" />
          ) : (
            <div className="w-full aspect-square bg-gray-100 rounded-xl mb-3 flex items-center justify-center text-gray-400 text-sm">
              사진을 촬영하면 여기에 표시됩니다
            </div>
          )}

          <label className="block w-full text-center bg-gray-800 hover:bg-gray-900 text-white font-medium py-2.5 rounded-lg cursor-pointer transition">
            {preview ? '다시 촬영' : '카메라 열기 / 사진 선택'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* 출근 / 퇴근 버튼 */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={() => handleCheck('check_in')}
              disabled={uploading || !file}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-3 rounded-lg transition"
            >
              {uploading ? '...' : '출근'}
            </button>
            <button
              onClick={() => handleCheck('check_out')}
              disabled={uploading || !file}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-3 rounded-lg transition"
            >
              {uploading ? '...' : '퇴근'}
            </button>
          </div>

          {message && (
            <p className="text-center text-sm mt-3 font-medium text-gray-700">{message}</p>
          )}
        </div>

        {/* 오늘 내 기록 */}
        <div className="bg-white rounded-2xl shadow p-6 mt-4">
          <h2 className="font-semibold text-gray-800 mb-3">오늘 내 기록</h2>
          {records.length === 0 ? (
            <p className="text-sm text-gray-400">아직 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {records.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <img src={r.photo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  <div className="flex-1">
                    <span
                      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${
                        r.type === 'check_in'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {r.type === 'check_in' ? '출근' : '퇴근'}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 tabular-nums">
                    {new Date(r.created_at).toLocaleTimeString('ko-KR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
