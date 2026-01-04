export type StoredWallet = {
  encryptedJson: string
  address: string
}

export type StoredState = {
  wallet?: StoredWallet
  selectedChainId?: number
  connections?: Record<string, boolean> // origin => connected?
}

const KEY = "omni_state_v1"

export async function getState(): Promise<StoredState> {
  const res = await chrome.storage.local.get(KEY)
  return (res?.[KEY] as StoredState) ?? {}
}

export async function setState(next: StoredState) {
  await chrome.storage.local.set({ [KEY]: next })
}

export async function patchState(patch: Partial<StoredState>) {
  const curr = await getState()
  await setState({ ...curr, ...patch })
}
