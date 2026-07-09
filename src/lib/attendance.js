// 출퇴근 계산 공유 유틸
// attendance 테이블 행: { type: 'check_in' | 'check_out', created_at: ISO string, ... }

export const pad = (n) => String(n).padStart(2, '0')

export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// ms -> "8시간 05분"
export function fmtHours(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}시간 ${pad(m)}분`
}

// check_in/check_out 쌍의 누적 근무시간(ms).
// records 는 created_at 오름차순이어야 한다.
// 마지막이 열린 출근이면 now 까지 진행중으로 계산.
export function totalMs(records, now = new Date()) {
  let sum = 0
  let openIn = null
  for (const r of records) {
    if (r.type === 'check_in') {
      openIn = new Date(r.created_at)
    } else if (r.type === 'check_out' && openIn) {
      sum += new Date(r.created_at) - openIn
      openIn = null
    }
  }
  if (openIn && now) sum += now - openIn
  return sum
}

// 날짜별 누적 근무시간 { 'YYYY-MM-DD': ms }.
// 완료된 구간은 출근한 날짜에 귀속시킨다.
export function dailyTotals(records, now = new Date()) {
  const totals = {}
  let openIn = null
  for (const r of records) {
    if (r.type === 'check_in') {
      openIn = new Date(r.created_at)
    } else if (r.type === 'check_out' && openIn) {
      const key = dateKey(openIn)
      totals[key] = (totals[key] || 0) + (new Date(r.created_at) - openIn)
      openIn = null
    }
  }
  if (openIn && now) {
    const key = dateKey(openIn)
    totals[key] = (totals[key] || 0) + (now - openIn)
  }
  return totals
}

// 두 좌표 사이 거리(m) — Haversine
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 현재 위치 Promise 래퍼
export function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 10000 }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저는 위치 정보를 지원하지 않아요.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      options,
    )
  })
}
