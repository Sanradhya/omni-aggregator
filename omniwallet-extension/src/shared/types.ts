export type OmniMsg =
  | { type: "GET_STATE" }
  | { type: "CREATE_WALLET"; password: string }
  | { type: "IMPORT_PRIVATE_KEY"; privateKey: string; password: string }
  | { type: "UNLOCK"; password: string }
  | { type: "LOCK" }
  | { type: "SET_CHAIN"; chainId: number }
  | { type: "GET_BALANCE" }
  | { type: "SEND_NATIVE"; to: string; amount: string }
  | { type: "RPC_REQUEST"; id: string; origin: string; method: string; params?: any[] }
  | { type: "APPROVAL_GET"; requestId: string }
  | { type: "APPROVAL_DECISION"; requestId: string; approved: boolean }

export type OmniEventMsg =
  | { type: "OMNI_EVENT"; event: "chainChanged"; payload: string }
  | { type: "OMNI_EVENT"; event: "accountsChanged"; payload: string[] }

export type PendingKind = "connect" | "tx" | "sign" | "switchChain"

export type PendingRequest = {
  id: string
  kind: PendingKind
  origin: string
  method: string
  params?: any[]
  createdAt: number
  // for UI
  details: Record<string, any>
  windowId?: number
}
