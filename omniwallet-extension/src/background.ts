import { ethers } from "ethers"
import {
  NETWORK_MODE,
  NetworkMode,
  ChainInfo,
  DEFAULT_CHAIN_ID,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
  toHexChainId,
  normalizeUrl,
  isValidHttpUrl
} from "./shared/chains"
import { getState, patchState } from "./shared/storage"
import type { PendingRequest } from "./shared/types"
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

/** ------------------------------
 * Custom Networks (persisted)
 * ------------------------------ */
const CUSTOM_NETWORKS_KEY = "omni.customNetworks.v1"

type CustomNetworksStore = {
  mainnet: Record<number, ChainInfo>
  testnet: Record<number, ChainInfo>
}

let customCache: CustomNetworksStore | null = null

async function readCustomNetworks(): Promise<CustomNetworksStore> {
  if (customCache) return customCache
  const res = await chrome.storage.local.get(CUSTOM_NETWORKS_KEY)
  const v = res[CUSTOM_NETWORKS_KEY] as CustomNetworksStore | undefined
  customCache = v ?? { mainnet: {}, testnet: {} }
  return customCache
}

async function writeCustomNetworks(store: CustomNetworksStore) {
  customCache = store
  await chrome.storage.local.set({ [CUSTOM_NETWORKS_KEY]: store })
}

function getBuiltins(mode: NetworkMode): Record<number, ChainInfo> {
  return mode === "mainnet" ? MAINNET_CHAINS : TESTNET_CHAINS
}

async function getMergedChains(mode: NetworkMode): Promise<Record<number, ChainInfo>> {
  const builtins = getBuiltins(mode)
  const store = await readCustomNetworks()
  const bucket = mode === "mainnet" ? store.mainnet : store.testnet

  const merged: Record<number, ChainInfo> = { ...builtins }
  for (const [idStr, chain] of Object.entries(bucket)) {
    const id = Number(idStr)
    merged[id] = { ...chain, isCustom: true }
  }
  return merged
}

async function getChainOrder(mode: NetworkMode): Promise<number[]> {
  const builtins = getBuiltins(mode)
  const merged = await getMergedChains(mode)

  const builtinOrder = Object.keys(builtins).map(Number)
  const customIds = Object.values(merged)
    .filter((c) => c.isCustom)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.chainId)

  const uniq = new Set<number>()
  const out: number[] = []
  for (const id of [...builtinOrder, ...customIds]) {
    if (!uniq.has(id)) {
      uniq.add(id)
      out.push(id)
    }
  }
  return out
}

function validateCustomChain(input: {
  mode: NetworkMode
  name: string
  rpcUrl: string
  chainId: number
  nativeSymbol: string
  blockExplorerUrl?: string
}): ChainInfo {
  const name = input.name.trim()
  const rpcUrl = normalizeUrl(input.rpcUrl)
  const nativeSymbol = input.nativeSymbol.trim().toUpperCase()
  const chainId = input.chainId

  if (!name) throw new Error("Network name is required.")
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error("Chain ID must be a positive integer.")
  if (!rpcUrl || !isValidHttpUrl(rpcUrl)) throw new Error("RPC URL must be a valid http(s) URL.")
  if (!nativeSymbol || nativeSymbol.length < 2 || nativeSymbol.length > 8) {
    throw new Error("Currency symbol must be 2–8 characters.")
  }

  const explorer = input.blockExplorerUrl?.trim()
  if (explorer && !isValidHttpUrl(explorer)) throw new Error("Block explorer URL must be a valid http(s) URL.")

  return {
    chainId,
    name,
    nativeSymbol,
    rpcUrls: [rpcUrl],
    blockExplorerUrl: explorer ? normalizeUrl(explorer) : undefined,
    isTestnet: input.mode === "testnet",
    isCustom: true
  }
}

async function isSupportedChainRuntime(chainId: number): Promise<boolean> {
  const chains = await getMergedChains(NETWORK_MODE)
  return Boolean(chains[chainId])
}

async function getChainOrThrow(chainId: number): Promise<ChainInfo> {
  const chains = await getMergedChains(NETWORK_MODE)
  const c = chains[chainId]
  if (!c) throw new Error("Unsupported chain")
  return c
}

/** ------------------------------
 * Provider / State bootstrap
 * ------------------------------ */
function getProvider(chainId: number) {
  // NOTE: must use merged chains, not static builtins
  // we rely on async fetch via cache, but provider builder must be sync
  // so we keep a tiny sync fallback by throwing if not present;
  // callers use getChainOrThrow before calling getProvider in practice.
  throw new Error("Use getProviderAsync instead.")
}

async function getProviderAsync(chainId: number) {
  const chain = await getChainOrThrow(chainId)
  return new ethers.JsonRpcProvider(chain.rpcUrls[0], chainId)
}

async function loadPersisted() {
  const s = await getState()
  runtime.selectedChainId = s.selectedChainId ?? DEFAULT_CHAIN_ID

  // If stored chain is not supported under current mode, reset.
  if (!(await isSupportedChainRuntime(runtime.selectedChainId))) {
    runtime.selectedChainId = DEFAULT_CHAIN_ID
    await patchState({ selectedChainId: DEFAULT_CHAIN_ID })
  }
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
      { url, type: "popup", width: 420, height: 640 },
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
  await patchState({ wallet: { encryptedJson, address: w.address } })
  runtime.wallet = w as unknown as ethers.Wallet
  runtime.unlocked = true
  broadcastEventToAllTabs("accountsChanged", [w.address])
  return { address: w.address, mnemonic: w.mnemonic?.phrase ?? "" }
}

async function handleImportPrivateKey(privateKey: string, password: string) {
  const w = new ethers.Wallet(privateKey.trim())
  const encryptedJson = await w.encrypt(password)
  await patchState({ wallet: { encryptedJson, address: w.address } })
  runtime.wallet = w
  runtime.unlocked = true
  broadcastEventToAllTabs("accountsChanged", [w.address])
  return { address: w.address }
}

async function handleUnlock(password: string) {
  const encryptedJson = await getEncryptedWalletJson()
  if (!encryptedJson) throw new Error("No wallet found")
  const w = await ethers.Wallet.fromEncryptedJson(encryptedJson, password)
  runtime.wallet = w as unknown as ethers.Wallet
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
  if (!(await isSupportedChainRuntime(chainId))) throw new Error("Unsupported chain")
  runtime.selectedChainId = chainId
  await patchState({ selectedChainId: chainId })
  broadcastEventToAllTabs("chainChanged", toHexChainId(chainId))
  return { chainId }
}

async function handleGetBalance() {
  const addr = await getAddress()
  if (!addr) return { balance: "0" }
  const provider = await getProviderAsync(runtime.selectedChainId)
  const bal = await provider.getBalance(addr)
  return { balance: ethers.formatEther(bal) }
}

async function handleSendNative(to: string, amount: string) {
  const wallet = await requireUnlocked()
  const provider = await getProviderAsync(runtime.selectedChainId)
  const signer = wallet.connect(provider)
  const tx = await signer.sendTransaction({
    to: to.trim(),
    value: ethers.parseEther(amount)
  })
  const receipt = await tx.wait()
  return { hash: tx.hash, receipt }
}

/** ------------------------------
 * Pending approvals
 * ------------------------------ */
type PendingEntry = PendingRequest & {
  resolve: (v: any) => void
  reject: (e: any) => void
}

const pending = new Map<string, PendingEntry>()

function makePending(
  kind: PendingEntry["kind"],
  origin: string,
  method: string,
  params: any[] | undefined,
  details: Record<string, any>
): PendingEntry {
  const id = crypto.randomUUID()
  let resolve!: (v: any) => void
  let reject!: (e: any) => void
  const p = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

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

    const entry = makePending("connect", origin, method, params, { origin, address: addr })
    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)
    return await (entry as any)._promise
  }

  if (method === "wallet_switchEthereumChain") {
    const targetHex = params?.[0]?.chainId as string | undefined
    if (!targetHex) throw new Error("Missing chainId")
    const target = Number(BigInt(targetHex))
    if (!(await isSupportedChainRuntime(target))) throw new Error("Chain not supported")

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

  const connected = await isConnected(origin)
  const needsConnection = [
    "eth_sendTransaction",
    "personal_sign",
    "eth_sign",
    "eth_signTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v4"
  ]
  if (needsConnection.includes(method) && !connected) {
    throw new Error("Not connected. Call eth_requestAccounts first.")
  }

  if (method === "personal_sign" || method === "eth_sign") {
    const wallet = await requireUnlocked()
    const p0 = params?.[0]
    const message =
      typeof p0 === "string" && p0.startsWith("0x") ? ethers.getBytes(p0) : typeof p0 === "string" ? p0 : ""

    const entry = makePending("sign", origin, method, params, {
      origin,
      address: wallet.address,
      message: typeof message === "string" ? message : ethers.hexlify(message)
    })

    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)
    const approved = await (entry as any)._promise
    if (approved !== true) throw new Error("User rejected signature")

    return await wallet.signMessage(message as any)
  }

  if (method === "eth_sendTransaction") {
    const wallet = await requireUnlocked()
    const tx0 = params?.[0] ?? {}
    const from = (tx0.from as string | undefined)?.toLowerCase()
    if (!from || from !== wallet.address.toLowerCase()) {
      throw new Error("Invalid from address")
    }

    const entry = makePending("tx", origin, method, params, {
      origin,
      from: wallet.address,
      to: tx0.to,
      value: tx0.value ?? "0x0",
      data: tx0.data ?? "0x"
    })

    const url = chrome.runtime.getURL(`src/approval/index.html?requestId=${entry.id}`)
    entry.windowId = await openApprovalWindow(url)
    const approved = await (entry as any)._promise
    if (approved !== true) throw new Error("User rejected transaction")

    const provider = await getProviderAsync(runtime.selectedChainId)
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
      nonce:
        toBigIntFromHexOrNumber(tx0.nonce) != null ? Number(toBigIntFromHexOrNumber(tx0.nonce)) : undefined,
      chainId: runtime.selectedChainId
    }

    const sent = await signer.sendTransaction(txReq)
    return sent.hash
  }

  const provider = await getProviderAsync(runtime.selectedChainId)
  return await provider.send(method, params ?? [])
}

/** ------------------------------
 * Message Listener
 * ------------------------------ */
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  ;(async () => {
    try {
      switch (message.type) {
        /** Wallet UI */
        case "GET_STATE": {
          const s = await getState()
          const chains = await getMergedChains(NETWORK_MODE)
          const chainName = chains[runtime.selectedChainId]?.name ?? "Unknown"

          sendResponse({
            hasWallet: Boolean(s.wallet?.encryptedJson),
            address: s.wallet?.address ?? "",
            unlocked: runtime.unlocked,
            chainId: runtime.selectedChainId,
            chainName
          })
          return
        }

        case "GET_CHAINS": {
          const mode: NetworkMode = message.mode ?? NETWORK_MODE
          const chains = await getMergedChains(mode)
          const order = await getChainOrder(mode)
          sendResponse({ chains, order, mode })
          return
        }

        case "ADD_CUSTOM_CHAIN": {
          const mode: NetworkMode = message.mode ?? NETWORK_MODE
          const payload = message.chain as {
            name: string
            rpcUrl: string
            chainId: number
            nativeSymbol: string
            blockExplorerUrl?: string
          }

          const chain = validateCustomChain({
            mode,
            name: payload.name,
            rpcUrl: payload.rpcUrl,
            chainId: payload.chainId,
            nativeSymbol: payload.nativeSymbol,
            blockExplorerUrl: payload.blockExplorerUrl
          })

          const store = await readCustomNetworks()
          const bucket = mode === "mainnet" ? store.mainnet : store.testnet
          bucket[chain.chainId] = chain
          await writeCustomNetworks(store)

          const chains = await getMergedChains(mode)
          const order = await getChainOrder(mode)

          sendResponse({ ok: true, chains, order })
          return
        }

        case "REMOVE_CUSTOM_CHAIN": {
          const mode: NetworkMode = message.mode ?? NETWORK_MODE
          const chainId = Number(message.chainId)

          const store = await readCustomNetworks()
          const bucket = mode === "mainnet" ? store.mainnet : store.testnet
          if (bucket[chainId]) {
            delete bucket[chainId]
            await writeCustomNetworks(store)
          }

          // if user was on removed chain, bounce them to default
          if (runtime.selectedChainId === chainId) {
            runtime.selectedChainId = DEFAULT_CHAIN_ID
            await patchState({ selectedChainId: DEFAULT_CHAIN_ID })
            broadcastEventToAllTabs("chainChanged", toHexChainId(DEFAULT_CHAIN_ID))
          }

          const chains = await getMergedChains(mode)
          const order = await getChainOrder(mode)
          sendResponse({ ok: true, chains, order })
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

        /** Dapp RPC */
        case "RPC_REQUEST": {
          const result = await handleRpcRequest(message.id, message.origin, message.method, message.params)
          sendResponse({ id: message.id, result })
          return
        }

        /** Approvals */
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
            if (entry.kind === "connect") entry.reject(new Error("User rejected connection"))
            else entry.resolve(false)
            sendResponse({ ok: true })
            return
          }

          if (entry.kind === "connect") {
            const accounts = await approveConnect(entry.origin)
            entry.resolve(accounts)
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
