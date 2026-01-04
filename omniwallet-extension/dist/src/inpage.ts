/**
 * Runs in the page context.
 * Provides a minimal EIP-1193 provider: window.ethereum.request(...)
 * NOTE: This is MVP-level. Many dapps will work for connect/read/send.
 */

type Listener = (...args: any[]) => void

class Emitter {
  private listeners = new Map<string, Set<Listener>>()

  on(event: string, fn: Listener) {
    const set = this.listeners.get(event) ?? new Set()
    set.add(fn)
    this.listeners.set(event, set)
  }

  removeListener(event: string, fn: Listener) {
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(fn)
  }

  emit(event: string, ...args: any[]) {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of set) {
      try { fn(...args) } catch {}
    }
  }
}

const emitter = new Emitter()

function nextId() {
  return crypto.randomUUID()
}

function postRequest(id: string, method: string, params?: any[]) {
  window.postMessage({ type: "OMNI_WALLET_REQUEST", id, method, params }, "*")
}

function waitResponse(id: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      const msg = event.data
      if (!msg || msg.type !== "OMNI_WALLET_RESPONSE" || msg.id !== id) return
      window.removeEventListener("message", handler)
      if (msg.error) reject(new Error(msg.error))
      else resolve(msg.result)
    }
    window.addEventListener("message", handler)
  })
}

// Listen for events from extension
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (!msg || msg.type !== "OMNI_WALLET_EVENT") return
  emitter.emit(msg.event, msg.payload)
})

// EIP-1193 provider
const ethereum = {
  isOmniWallet: true,
  isMetaMask: false, // don't lie
  selectedAddress: null as string | null,
  chainId: null as string | null,

  request: async ({ method, params }: { method: string; params?: any[] }) => {
    const id = nextId()
    postRequest(id, method, params)
    const res = await waitResponse(id)

    // update cached properties for common calls
    if (method === "eth_requestAccounts" || method === "eth_accounts") {
      ethereum.selectedAddress = Array.isArray(res) ? res[0] ?? null : null
      emitter.emit("accountsChanged", Array.isArray(res) ? res : [])
    }
    if (method === "eth_chainId") {
      ethereum.chainId = res ?? null
    }
    return res
  },

  // legacy
  enable: async () => {
    return ethereum.request({ method: "eth_requestAccounts" })
  },

  on: (event: string, fn: Listener) => {
    emitter.on(event, fn)
  },

  removeListener: (event: string, fn: Listener) => {
    emitter.removeListener(event, fn)
  }
}

// Initialize cached values best-effort
ethereum.request({ method: "eth_chainId" }).catch(() => {})
ethereum.request({ method: "eth_accounts" }).catch(() => {})

;(window as any).ethereum = ethereum
;(window as any).omniwallet = ethereum
