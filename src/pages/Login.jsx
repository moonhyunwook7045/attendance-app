import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Login({ role = 'employee', notice = '', onBack }) {
  const isAdmin = role === 'admin'
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // 역할 불일치 안내 메시지를 에러 영역에 표시
  useEffect(() => {
    if (notice) setError(notice)
  }, [notice])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(translate(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })
      if (error) {
        setError(translate(error.message))
      } else if (!data.session) {
        setInfo('가입 완료! 관리자에게 이메일 확인 설정을 꺼달라고 하거나, 메일함을 확인하세요.')
      }
    }
    setLoading(false)
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setInfo('')
  }

  const inputWrapClass =
    'flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 transition duration-200 focus-within:border-fuchsia-400/60 focus-within:bg-white/[0.08] focus-within:ring-4 focus-within:ring-fuchsia-500/15'
  const inputClass =
    'w-full bg-transparent py-3 text-slate-100 placeholder-slate-500 focus:outline-none'

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      <style>{`
        @keyframes login-rise { from { opacity: 0; transform: translateY(16px);} to { opacity: 1; transform: translateY(0);} }
        @keyframes blob-float-a { 0%,100%{transform:translate(0,0);} 50%{transform:translate(-24px,20px);} }
        @keyframes blob-float-b { 0%,100%{transform:translate(0,0);} 50%{transform:translate(20px,-18px);} }
        .login-rise { animation: login-rise 0.5s ease-out both; }
        .blob-a { animation: blob-float-a 14s ease-in-out infinite; }
        .blob-b { animation: blob-float-b 18s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .login-rise,.blob-a,.blob-b{animation:none;} }
      `}</style>

      <div className="blob-a pointer-events-none absolute -top-24 -right-20 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="blob-b pointer-events-none absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="blob-a pointer-events-none absolute top-1/2 left-1/3 h-52 w-52 rounded-full bg-purple-500/15 blur-3xl" />

      <div className="login-rise relative w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/50 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-fuchsia-400 via-indigo-500 to-sky-400" />

          <div className="p-8 pt-6">
            <button
              type="button"
              onClick={onBack}
              className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              뒤로
            </button>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 shadow-lg shadow-fuchsia-500/40 ring-[5px] ring-white/5">
                <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>

              <span
                className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ${
                  isAdmin ? 'bg-white/10 text-slate-200' : 'bg-indigo-500/20 text-indigo-300'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isAdmin ? 'bg-slate-300' : 'bg-indigo-400'}`} />
                {isAdmin ? '관리자 로그인' : '직원 로그인'}
              </span>

              <h1 className="text-2xl font-bold tracking-tight text-white">TIME TRACK</h1>
              <p className="mt-1.5 text-sm text-slate-400">
                {isAdmin
                  ? '직원 근태와 기록을 관리하세요'
                  : mode === 'login'
                    ? '로그인 후 사진으로 출퇴근하세요'
                    : '계정을 만들어주세요'}
              </p>
            </div>

            {!isAdmin && (
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`rounded-lg py-2 text-sm font-semibold transition duration-200 ${
                    mode === 'login' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  로그인
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`rounded-lg py-2 text-sm font-semibold transition duration-200 ${
                    mode === 'signup' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  회원가입
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">이름</label>
                  <div className={inputWrapClass}>
                    <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
                    </svg>
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="홍길동" />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">이메일</label>
                <div className={inputWrapClass}>
                  <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">비밀번호</label>
                <div className={inputWrapClass}>
                  <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="6자 이상"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                    className="shrink-0 text-slate-400 transition hover:text-slate-200 focus:outline-none"
                  >
                    {showPw ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a15 15 0 0 1-2.2 3.1M6.6 6.6A14.6 14.6 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                        <path d="m3 3 18 18" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
              )}
              {info && (
                <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{info}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/30 transition duration-200 hover:from-fuchsia-400 hover:to-indigo-400 hover:shadow-xl hover:shadow-fuchsia-500/40 focus:outline-none focus:ring-4 focus:ring-fuchsia-500/30 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
                {!loading && (
                  <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 flex justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
            <svg className="h-3.5 w-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 7h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            간편 출퇴근
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
            <svg className="h-3.5 w-3.5 text-fuchsia-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            실시간 기록
          </span>
        </div>
      </div>
    </div>
  )
}

// 자주 나오는 에러 메시지를 한국어로
function translate(msg) {
  if (msg.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (msg.includes('already registered')) return '이미 가입된 이메일입니다.'
  if (msg.includes('Password should be')) return '비밀번호는 6자 이상이어야 합니다.'
  return msg
}
