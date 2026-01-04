export type ChainInfo = {
  chainId: number
  name: string
  nativeSymbol: string
  rpcUrls: string[]
  blockExplorerUrl?: string
}

export const CHAINS: Record<number, ChainInfo> = {
  43114: {
    chainId: 43114,
    name: "Avalanche C-Chain",
    nativeSymbol: "AVAX",
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    blockExplorerUrl: "https://snowtrace.io"
  },
  137: {
    chainId: 137,
    name: "Polygon",
    nativeSymbol: "MATIC",
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrl: "https://polygonscan.com"
  }
}

export const DEFAULT_CHAIN_ID = 43114

export function isSupportedChain(chainId: number) {
  return Boolean(CHAINS[chainId])
}

export function toHexChainId(chainId: number) {
  return "0x" + chainId.toString(16)
}
