import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경변수가 없습니다. .env.local 확인 후 dev 서버를 재시작하세요.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
