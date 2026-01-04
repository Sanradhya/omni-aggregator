export type ChainInfo = {
  chainId: number
  name: string
  nativeSymbol: string
  rpcUrls: string[]
  blockExplorerUrl?: string
  isTestnet?: boolean
}

/**
 * NETWORK MODE
 * - Default: testnet (safer for dev)
 * - Set to "mainnet" when ready
 *
 * Works with:
 * - Vite:   VITE_NETWORK_MODE=mainnet
 * - Node:   NETWORK_MODE=mainnet
 */
export type NetworkMode = "testnet" | "mainnet"

function readEnv(key: string): string | undefined {
  // Vite / modern bundlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viteVal = (typeof import.meta !== "undefined" && (import.meta as any)?.env?.[key]) as
    | string
    | undefined
  if (viteVal) return viteVal

  // Node fallback (some tooling still injects this)
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
 * MAINNET CHAINS (EVM)
 */
export const MAINNET_CHAINS: Record<number, ChainInfo> = {
  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: "Ethereum",
    nativeSymbol: "ETH",
    rpcUrls: [
      // Public RPCs can rate limit; swap with Alchemy/Infura/QuickNode for reliability.
      "https://cloudflare-eth.com"
    ],
    blockExplorerUrl: "https://etherscan.io",
    isTestnet: false
  },

  // Base Mainnet
  8453: {
    chainId: 8453,
    name: "Base",
    nativeSymbol: "ETH",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrl: "https://basescan.org",
    isTestnet: false
  },

  // Arbitrum One
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    nativeSymbol: "ETH",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrl: "https://arbiscan.io",
    isTestnet: false
  },

  // Polygon
  137: {
    chainId: 137,
    name: "Polygon",
    nativeSymbol: "MATIC",
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrl: "https://polygonscan.com",
    isTestnet: false
  },

  // Avalanche C-Chain
  43114: {
    chainId: 43114,
    name: "Avalanche C-Chain",
    nativeSymbol: "AVAX",
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    blockExplorerUrl: "https://snowtrace.io",
    isTestnet: false
  }
}

/**
 * TESTNET CHAINS (EVM)
 */
export const TESTNET_CHAINS: Record<number, ChainInfo> = {
  // Ethereum Sepolia
  11155111: {
    chainId: 11155111,
    name: "Ethereum Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrl: "https://sepolia.etherscan.io",
    isTestnet: true
  },

  // Base Sepolia
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrl: "https://sepolia.basescan.org",
    isTestnet: true
  },

  // Arbitrum Sepolia
  421614: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    nativeSymbol: "ETH",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorerUrl: "https://sepolia.arbiscan.io",
    isTestnet: true
  },

  // Polygon Amoy (Mumbai is deprecated)
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    nativeSymbol: "POL",
    rpcUrls: ["https://rpc-amoy.polygon.technology"],
    blockExplorerUrl: "https://amoy.polygonscan.com",
    isTestnet: true
  },

  // Avalanche Fuji C-Chain
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
 * The active chains for the wallet right now.
 */
export const CHAINS: Record<number, ChainInfo> =
  NETWORK_MODE === "mainnet" ? MAINNET_CHAINS : TESTNET_CHAINS

/**
 * Default chain depends on mode.
 * (Pick something with good faucet support and stable RPCs.)
 */
export const DEFAULT_CHAIN_ID =
  NETWORK_MODE === "mainnet" ? 43114 : 11155111

/**
 * Deterministic dropdown order
 */
export const CHAIN_ORDER: number[] =
  NETWORK_MODE === "mainnet"
    ? [1, 8453, 42161, 137, 43114]
    : [11155111, 84532, 421614, 80002, 43113]

export function isSupportedChain(chainId: number) {
  return Boolean(CHAINS[chainId])
}

export function toHexChainId(chainId: number) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`)
  }
  return "0x" + chainId.toString(16)
}

export function getChain(chainId: number): ChainInfo | undefined {
  return CHAINS[chainId]
}

export function explorerTxUrl(chainId: number, txHash: string) {
  const c = CHAINS[chainId]
  if (!c?.blockExplorerUrl) return undefined
  return `${c.blockExplorerUrl}/tx/${txHash}`
}

export function explorerAddressUrl(chainId: number, address: string) {
  const c = CHAINS[chainId]
  if (!c?.blockExplorerUrl) return undefined
  return `${c.blockExplorerUrl}/address/${address}`
}

/**
 * Non-EVM placeholder list (for UI only, not connected yet)
 */
export const NON_EVM_CHAINS = [
  { key: "bitcoin", name: "Bitcoin", enabled: false }
] as const

