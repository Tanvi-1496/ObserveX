import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const refresh = useAppStore(s => s.refresh)
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    setLoading(true); setError(false)
    fetcher().then(setData).catch(() => setError(true)).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(load, [load])
  useEffect(() => {
    if (!refresh) return
    const id = window.setInterval(() => fetcher().then(setData), refresh * 1000)
    return () => window.clearInterval(id)
  }, [fetcher, refresh])
  return { data, loading, error, retry: load, setData }
}
