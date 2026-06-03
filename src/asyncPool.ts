/** 限制并发数，避免同时打太多 AI 请求触发限流 */
export async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let next = 0
  const runWorker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  const n = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: n }, () => runWorker()))
  return results
}
