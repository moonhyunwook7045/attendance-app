// 첫 화면: 관리자 / 직원 로그인 유형 선택
export default function RoleSelect({ onPick }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.12) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="pointer-events-none absolute -top-24 -right-20 h-80 w-80 rounded-full bg-sky-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-indigo-300/40 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 shadow-lg shadow-sky-400/40">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">출퇴근 관리</h1>
          <p className="mt-1.5 text-sm text-slate-500">로그인 유형을 선택하세요</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onPick('employee')}
            className="group flex w-full items-center gap-4 rounded-2xl border border-white/90 bg-white/80 p-5 text-left shadow-lg shadow-indigo-500/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900">직원 로그인</p>
              <p className="text-xs text-slate-500">사진으로 출퇴근을 인증해요</p>
            </div>
            <svg className="ml-auto h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button
            onClick={() => onPick('admin')}
            className="group flex w-full items-center gap-4 rounded-2xl border border-white/90 bg-white/80 p-5 text-left shadow-lg shadow-slate-500/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900">관리자 로그인</p>
              <p className="text-xs text-slate-500">직원 근태와 기록을 관리해요</p>
            </div>
            <svg className="ml-auto h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
