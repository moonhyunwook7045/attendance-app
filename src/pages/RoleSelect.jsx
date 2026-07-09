// 첫 화면: 관리자 / 직원 로그인 유형 선택
export default function RoleSelect({ onPick }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-24 -right-20 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 shadow-lg shadow-fuchsia-500/40">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-300 via-white to-sky-300 bg-clip-text text-transparent">
            TIME TRACK
          </h1>
          <p className="mt-2 text-sm text-slate-400">로그인 유형을 선택하세요</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onPick('employee')}
            className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-left shadow-xl shadow-black/30 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-sky-500/30">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white">직원 로그인</p>
              <p className="text-xs text-slate-400">사진으로 출퇴근을 인증해요</p>
            </div>
            <svg className="ml-auto h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button
            onClick={() => onPick('admin')}
            className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-left shadow-xl shadow-black/30 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-lg shadow-fuchsia-500/30">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white">관리자 로그인</p>
              <p className="text-xs text-slate-400">직원 근태와 기록을 관리해요</p>
            </div>
            <svg className="ml-auto h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
