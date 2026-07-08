import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import EmployeeHome from './pages/EmployeeHome'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)

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

  if (!ready) {
    return <Loading />
  }

  if (!session) {
    return <Login />
  }

  if (!profile) {
    return <Loading />
  }

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
