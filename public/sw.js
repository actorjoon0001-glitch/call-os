/**
 * CALL-OS Service Worker
 *
 * 전략:
 * - 정적 자산: stale-while-revalidate (빠른 로딩 + 백그라운드 갱신)
 * - HTML 네비게이션: network-first (최신 빌드 우선, 오프라인 시 캐시)
 * - API/Supabase 호출: 캐시하지 않음 (실시간 데이터 무결성)
 */

const VERSION = 'v1'
const STATIC_CACHE = `call-os-static-${VERSION}`
const RUNTIME_CACHE = `call-os-runtime-${VERSION}`

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 외부 API (Supabase 등)는 캐시 우회
  if (url.origin !== self.location.origin) return

  // SPA 네비게이션 → network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((m) => m || caches.match('/')))
    )
    return
  }

  // 정적 자산 → stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || fetchPromise
    })
  )
})
