import { ethers } from "ethers"
import { CHAINS, DEFAULT_CHAIN_ID, isSupportedChain, toHexChainId } from "./shared/chains"
import { getState, patchState } from "./shared/storage"
import type { OmniMsg, PendingRequest } from "./shared/types"
import { toBigIntFromHexOrNumber } from "./utils/format"

type RuntimeState = {
  unlocked: boolean
  wallet?: ethers.Wallet
  selectedChainId: number
}

const runtime: RuntimeState = {
  unlocked: false,
  wallet: undefined,
  selectedChainId: DEFAULT_CHAIN_ID
}

type PendingEntry = PendingRequest & {
  resolve: (v: any) => void
  reject: (e: any) => void
}

const pending = new Map<string, PendingEntry>()

function getProvider(chainId: number) {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error("Unsupported chain")
  return new ethers.JsonRpcProvider(chain.rpcUrls[0], chainId)
}

async function loadPersisted() {
  const s = await getState()
  runtime.selectedChainId = s.selectedChainId ?? DEFAULT_CHAIN_ID
}
loadPersisted()

async function ensureConnectionsMap() {
  const s = await getState()
  if (!s.connections) await patchState({ connections: {} })
}

async function isConnected(origin: string) {
  const s = await getState()
  return Boolean(s.connections?.[origin])
}

async function setConnected(origin: string, yes: boolean) {
  const s = await getState()
  const connections = { ...(s.connections ?? {}) }
  connections[origin] = yes
  await patchState({ connections })
}

function broadcastEventToAllTabs(event: "chainChanged" | "accountsChanged", payload: any) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue
      chrome.tabs.sendMessage(tab.id, { type: "OMNI_EVENT", event, payload })
    }
  })
}

function openApprovalWindow(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.windows.create(
      {
        url,
        type: "popup",
        width: 420,
        height: 640
      },
      (w) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError)
        if (!w?.id) return reject(new Error("Failed to open approval window"))
        resolve(w.id)
      }
    )
  })
}

async function requireUnlocked() {
  if (!runtime.unlocked || !runtime.wallet) throw new Error("Wallet locked")
  return runtime.wallet
}

async function getAddress() {
  const s = await getState()
  return s.wallet?.address ?? ""
}

async function getEncryptedWalletJson() {
  const s = await getState()
  return s.wallet?.encryptedJson ?? ""
}

async function handleCreateWallet(password: string) {
  const w = ethers.Wallet.createRandom()
  const encryptedJson = await w.encrypt(password)
  await patchState({
    wallet: { encryptedJson, address: w.address }
  })
  runtime.wallet = w
  runtime.unlocked = true
  broadcastEventToAllTabs("accountsChanged", [w.address])
  return { address: w.address, mnemonic: w.mnemonic?.phrase ?? "" }
}

async function handleImportPrivateKey(privateKey: string, password: string) {
  const w = new ethers.Wallet(privateKey.trim())
  const encryptedJson = await w.encrypt(password)
  await patchState({
    wallet: { encryptedJson, address: w.address }
  })
  runtime.wallet = w
  runtime.unlocked = true
  broadcastEventToAllTabs("accountsChanged", [w.address])
  return { address: w.address }
}

async function handleUnlock(password: string) {
  const encryptedJson = await getEncryptedWalletJson()
  if (!encryptedJson) throw new Error("No wallet found")
  const w = await ethers.Wallet.fromEncryptedJson(encryptedJson, password)
  runtime.wallet = w
  runtime.unlocked = true
  broadcastEventToAllTabs("accountsChanged", [w.address])
  return { address: w.address }
}

async function handleLock() {
  runtime.wallet = undefined
  runtime.unlocked = false
  broadcastEventToAllTabs("accountsChanged", [])
  return { ok: true }
}

async function handleSetChain(chainId: number) {
  if (!isSupportedChain(chainId)) throw new Error("Unsupported chain")
  runtime.selectedChainId = chainId
  await patchState({ selectedChainId: chainId })
  broadcastEventToAllTabs("chainChanged", toHexChainId(chainId))
  return { chainId }
}

async function handleGetBalance() {
  const addr = await getAddress()
  if (!addr) return { balance: "0" }
  const provider = getProvider(runtime.selectedChainId)
  const bal = await provider.getBalance(addr)
  return { balance: ethers.formatEther(bal) }
}

async function handleSendNative(to: string, amount: string) {
  const wallet = await requireUnlocked()
  const provider = getProvider(runtime.selectedChainId)
  const signer = wallet.connect(provider)
  const tx = await signer.sendTransaction({
    to: to.trim(),
    value: ethers.parseEther(amount)
  })
  const receipt = await tx.wait()
  return { hash: tx.hash, receipt }
}

function makePending(kind: PendingEntry["kind"], origin: string, method: string, params: any[] | undefined, details: Record<string, any>): PendingEntry {
  const id = crypto.randomUUID()
  let resolve!: (v: any) => void
  let reject!: (e: any) => void
  const p = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  // we store resolve/reject and return promise separately
  const entry: PendingEntry = {
    id,
    kind,
    origin,
    method,
    params,
    createdAt: Date.now(),
    details,
    resolve,
    reject
  } as any
  ;(entry as any)._promise = p
  pending.set(id, entry)
  return entry
}

async function approveConnect(origin: string) {
  await setConnected(origin, true)
  const addr = await getAddress()
  return addr ? [addr] : []
}

async function handleRpcRequest(id: string, origin: string, method: string, params: any[] | undefined) {
  await ensureConnectionsMap()
  const addr = await getAddress()

  // Basic provider surface
  if (method === "eth_chainId") return toHexChainId(runtime.selectedChainId)
  if (method === "net_version") return String(runtime.selectedChainId)
  if (method === "eth_accounts") {
    const ok = await isConnected(origin)
    return ok && addr ? [addr] : []
  }

  if (method === "eth_requestAccounts") {
    if (!addr) throw new Error("No wallet")
    const already = await isConnected(origin)
    if (already) return [addr]

    const entry = makePending(
      "connect",
      origin,
      method,
      params,
      { origin, address: addr }
    )
    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)

    // wait for user decision
    return await (entry as any)._promise
  }

  if (method === "wallet_switchEthereumChain") {
    // params: [{ chainId: "0x89" }]
    const targetHex = params?.[0]?.chainId as string | undefined
    if (!targetHex) throw new Error("Missing chainId")
    const target = Number(BigInt(targetHex))
    if (!isSupportedChain(target)) throw new Error("Chain not supported")

    const entry = makePending(
      "switchChain",
      origin,
      method,
      params,
      { origin, from: runtime.selectedChainId, to: target }
    )
    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)
    const approved = await (entry as any)._promise
    if (approved !== true) throw new Error("User rejected request")
    await handleSetChain(target)
    return null
  }

  // Anything that signs/sends should require:
  // 1) Wallet unlocked
  // 2) Origin connected
  const connected = await isConnected(origin)
  const needsConnection = ["eth_sendTransaction", "personal_sign", "eth_sign", "eth_signTransaction", "eth_signTypedData", "eth_signTypedData_v4"]
  if (needsConnection.includes(method) && !connected) {
    throw new Error("Not connected. Call eth_requestAccounts first.")
  }

  if (method === "personal_sign" || method === "eth_sign") {
    const wallet = await requireUnlocked()
    // common param shapes:
    // personal_sign: [message, address] OR [address, message]
    const p0 = params?.[0]
    const p1 = params?.[1]
    const message = (typeof p0 === "string" && p0.startsWith("0x")) ? ethers.getBytes(p0) : (typeof p0 === "string" ? p0 : "")
    const addressMaybe = typeof p1 === "string" ? p1 : ""

    const entry = makePending(
      "sign",
      origin,
      method,
      params,
      { origin, address: wallet.address, message: typeof message === "string" ? message : ethers.hexlify(message) }
    )
    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)
    const approved = await (entry as any)._promise
    if (approved !== true) throw new Error("User rejected signature")

    if (typeof message === "string") {
      // string message
      return await wallet.signMessage(message)
    }
    // bytes
    return await wallet.signMessage(message)
  }

  if (method === "eth_sendTransaction") {
    const wallet = await requireUnlocked()
    const tx0 = params?.[0] ?? {}
    const from = (tx0.from as string | undefined)?.toLowerCase()
    if (!from || from !== wallet.address.toLowerCase()) {
      throw new Error("Invalid from address")
    }

    const entry = makePending(
      "tx",
      origin,
      method,
      params,
      {
        origin,
        from: wallet.address,
        to: tx0.to,
        value: tx0.value ?? "0x0",
        data: tx0.data ?? "0x"
      }
    )
    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)
    const approved = await (entry as any)._promise
    if (approved !== true) throw new Error("User rejected transaction")

    const provider = getProvider(runtime.selectedChainId)
    const signer = wallet.connect(provider)

    const txReq: ethers.TransactionRequest = {
      to: tx0.to,
      from: wallet.address,
      data: tx0.data,
      value: toBigIntFromHexOrNumber(tx0.value) ?? 0n,
      gasLimit: toBigIntFromHexOrNumber(tx0.gas) ?? undefined,
      maxFeePerGas: toBigIntFromHexOrNumber(tx0.maxFeePerGas) ?? undefined,
      maxPriorityFeePerGas: toBigIntFromHexOrNumber(tx0.maxPriorityFeePerGas) ?? undefined,
      gasPrice: toBigIntFromHexOrNumber(tx0.gasPrice) ?? undefined,
      nonce: toBigIntFromHexOrNumber(tx0.nonce) != null ? Number(toBigIntFromHexOrNumber(tx0.nonce)) : undefined,
      chainId: runtime.selectedChainId
    }

    const sent = await signer.sendTransaction(txReq)
    return sent.hash
  }

  // Read-only passthrough to RPC
  // This is enough for many dapps to at least *read* chain state.
  const provider = getProvider(runtime.selectedChainId)
  return await provider.send(method, params ?? [])
}

chrome.runtime.onMessage.addListener((message: OmniMsg, sender, sendResponse) => {
  ;(async () => {
    try {
      switch (message.type) {
        case "GET_STATE": {
          const s = await getState()
          sendResponse({
            hasWallet: Boolean(s.wallet?.encryptedJson),
            address: s.wallet?.address ?? "",
            unlocked: runtime.unlocked,
            chainId: runtime.selectedChainId,
            chainName: CHAINS[runtime.selectedChainId]?.name ?? "Unknown"
          })
          return
        }
        case "CREATE_WALLET":
          sendResponse(await handleCreateWallet(message.password))
          return
        case "IMPORT_PRIVATE_KEY":
          sendResponse(await handleImportPrivateKey(message.privateKey, message.password))
          return
        case "UNLOCK":
          sendResponse(await handleUnlock(message.password))
          return
        case "LOCK":
          sendResponse(await handleLock())
          return
        case "SET_CHAIN":
          sendResponse(await handleSetChain(message.chainId))
          return
        case "GET_BALANCE":
          sendResponse(await handleGetBalance())
          return
        case "SEND_NATIVE":
          sendResponse(await handleSendNative(message.to, message.amount))
          return
        case "RPC_REQUEST": {
          const result = await handleRpcRequest(message.id, message.origin, message.method, message.params)
          sendResponse({ id: message.id, result })
          return
        }
        case "APPROVAL_GET": {
          const entry = pending.get(message.requestId)
          if (!entry) throw new Error("Request not found/expired")
          sendResponse({
            id: entry.id,
            kind: entry.kind,
            origin: entry.origin,
            method: entry.method,
            params: entry.params,
            createdAt: entry.createdAt,
            details: entry.details
          })
          return
        }
        case "APPROVAL_DECISION": {
          const entry = pending.get(message.requestId)
          if (!entry) throw new Error("Request not found/expired")
          pending.delete(entry.id)

          try {
            if (entry.windowId) chrome.windows.remove(entry.windowId)
          } catch {}

          if (!message.approved) {
            // Reject
            if (entry.kind === "connect") entry.reject(new Error("User rejected connection"))
            else if (entry.kind === "switchChain") entry.resolve(false)
            else if (entry.kind === "tx") entry.resolve(false)
            else if (entry.kind === "sign") entry.resolve(false)
            else entry.resolve(false)
            sendResponse({ ok: true })
            return
          }

          // Approve
          if (entry.kind === "connect") {
            const accounts = await approveConnect(entry.origin)
            entry.resolve(accounts)
          } else if (entry.kind === "switchChain") {
            entry.resolve(true)
          } else if (entry.kind === "tx") {
            entry.resolve(true)
          } else if (entry.kind === "sign") {
            entry.resolve(true)
          } else {
            entry.resolve(true)
          }
          sendResponse({ ok: true })
          return
        }
        default:
          throw new Error("Unknown message")
      }
    } catch (e: any) {
      sendResponse({ error: e?.message ?? String(e) })
    }
  })()
  return true
})
