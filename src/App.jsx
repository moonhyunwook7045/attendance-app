import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import RoleSelect from './pages/RoleSelect'
import Login from './pages/Login'
import EmployeeHome from './pages/EmployeeHome'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [loginRole, setLoginRole] = useState(null) // 'admin' | 'employee' | null (선택한 로그인 유형)
  const [notice, setNotice] = useState('') // 역할 불일치 안내

  // 로그인 세션 감지
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 로그인한 사용자의 프로필(이름/역할) 불러오기
  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  // 선택한 로그인 유형과 실제 권한이 다르면 → 로그아웃 + 안내
  useEffect(() => {
    if (!session || !profile || !loginRole) return
    if (loginRole === profile.role) {
      // 통과 → 소비 (다음 로그아웃 때 역할 선택 화면부터 다시 시작)
      setLoginRole(null)
    } else {
      const msg =
        profile.role === 'admin'
          ? '이 계정은 관리자 계정이에요. "관리자 로그인"으로 들어와 주세요.'
          : '이 계정은 관리자 계정이 아니에요. "직원 로그인"으로 들어와 주세요.'
      supabase.auth.signOut().then(() => setNotice(msg))
    }
  }, [session, profile, loginRole])

  if (!ready) return <Loading />

  // 로그인 전: 역할 선택 → 로그인 폼
  if (!session) {
    if (!loginRole) {
      return <RoleSelect onPick={(r) => { setNotice(''); setLoginRole(r) }} />
    }
    return (
      <Login
        role={loginRole}
        notice={notice}
        onBack={() => { setLoginRole(null); setNotice('') }}
      />
    )
  }

  if (!profile) return <Loading />

  // 역할 불일치면 잠깐 대기 (위 effect가 로그아웃 처리)
  if (loginRole && loginRole !== profile.role) return <Loading />

  return profile.role === 'admin'
    ? <AdminDashboard profile={profile} />
    : <EmployeeHome session={session} profile={profile} />
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      불러오는 중...
    </div>
  )
}
