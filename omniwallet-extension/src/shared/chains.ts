export type ChainInfo = {
  chainId: number
  name: string
  nativeSymbol: string
  rpcUrls: string[]
  blockExplorerUrl?: string
  isTestnet?: boolean
  isCustom?: boolean
}

/**
 * NETWORK MODE
 * Default: testnet
 */
export type NetworkMode = "testnet" | "mainnet"

function readEnv(key: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteVal = (typeof import.meta !== "undefined" && (import.meta as any)?.env?.[key]) as
    | string
    | undefined
  if (viteVal) return viteVal

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeVal = (typeof process !== "undefined" && (process as any)?.env?.[key]) as
    | string
    | undefined
  return nodeVal
}

export const NETWORK_MODE: NetworkMode =
  (readEnv("VITE_NETWORK_MODE") as NetworkMode) ||
  (readEnv("NETWORK_MODE") as NetworkMode) ||
  "testnet"

/**
 * Built-in chains
 */
export const MAINNET_CHAINS: Record<number, ChainInfo> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    nativeSymbol: "ETH",
    rpcUrls: ["https://cloudflare-eth.com"],
    blockExplorerUrl: "https://etherscan.io",
    isTestnet: false
  },
  8453: {
    chainId: 8453,
    name: "Base",
    nativeSymbol: "ETH",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrl: "https://basescan.org",
    isTestnet: false
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    nativeSymbol: "ETH",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrl: "https://arbiscan.io",
    isTestnet: false
  },
  137: {
    chainId: 137,
    name: "Polygon",
    nativeSymbol: "MATIC",
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrl: "https://polygonscan.com",
    isTestnet: false
  },
  43114: {
    chainId: 43114,
    name: "Avalanche C-Chain",
    nativeSymbol: "AVAX",
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    blockExplorerUrl: "https://snowtrace.io",
    isTestnet: false
  }
}

export const TESTNET_CHAINS: Record<number, ChainInfo> = {
  11155111: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrl: "https://sepolia.etherscan.io",
    isTestnet: true
  },
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrl: "https://sepolia.basescan.org",
    isTestnet: true
  },
  421614: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrl: "https://sepolia.arbiscan.io",
    isTestnet: true
  },
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    nativeSymbol: "POL",
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    blockExplorerUrl: "https://amoy.polygonscan.com",
    isTestnet: true
  },
  43113: {
    chainId: 43113,
    name: "Avalanche Fuji C-Chain",
    nativeSymbol: "AVAX",
    rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
    blockExplorerUrl: "https://testnet.snowtrace.io",
    isTestnet: true
  }
}

/**
 * These are ONLY the built-in active chains.
 * Custom chains are stored in chrome.storage and merged in background.ts.
 */
export const CHAINS: Record<number, ChainInfo> =
  NETWORK_MODE === "mainnet" ? MAINNET_CHAINS : TESTNET_CHAINS

export const DEFAULT_CHAIN_ID =
  NETWORK_MODE === "mainnet" ? 43114 : 11155111

export const CHAIN_ORDER: number[] =
  NETWORK_MODE === "mainnet"
    ? [1, 8453, 42161, 137, 43114]
    : [11155111, 84532, 421614, 80002, 43113]

export function toHexChainId(chainId: number) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`)
  }
  return "0x" + chainId.toString(16)
}

/**
 * Parse chainId entered by user:
 * supports "8453" and "0x2105"
 */
export function parseChainId(input: string): number {
  const v = input.trim()
  if (!v) return NaN
  if (v.startsWith("0x") || v.startsWith("0X")) {
    const n = Number.parseInt(v.slice(2), 16)
    return Number.isFinite(n) ? n : NaN
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

export function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "")
}

export function isValidHttpUrl(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export function explorerTxUrl(chainId: number, txHash: string) {
  const c = CHAINS[chainId]
  if (!c?.blockExplorerUrl) return undefined
  return `${normalizeUrl(c.blockExplorerUrl)}/tx/${txHash}`
}

export function explorerAddressUrl(chainId: number, address: string) {
  const c = CHAINS[chainId]
  if (!c?.blockExplorerUrl) return undefined
  return `${normalizeUrl(c.blockExplorerUrl)}/address/${address}`
}

/**
 * Non-EVM placeholder list (UI only, not connected yet)
 */
export const NON_EVM_CHAINS = [
  { key: "bitcoin", name: "Bitcoin", enabled: false }
] as const
