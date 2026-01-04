export async function bg<T = any>(msg: any): Promise<T> {
  const res = await chrome.runtime.sendMessage(msg)
  if (res?.error) throw new Error(res.error)
  return res as T
}
