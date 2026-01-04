import React, { useEffect, useMemo, useState } from "react"
import { bg } from "./rpc"
import {
  DEFAULT_CHAIN_ID,
  NETWORK_MODE,
  NON_EVM_CHAINS,
  parseChainId,
  ChainInfo,
  NetworkMode,
  normalizeUrl,
  isValidHttpUrl
} from "../../shared/chains"
import { shortAddr } from "../../utils/format"

type State = {
  hasWallet: boolean
  address: string
  unlocked: boolean
  chainId: number
  chainName: string
}

type Screen = "loading" | "onboard" | "unlock" | "home" | "create" | "import" | "addNetwork"

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [state, setState] = useState<State | null>(null)
  const [balance, setBalance] = useState<string>("—")
  const [err, setErr] = useState<string>("")

  const [chains, setChains] = useState<Record<number, ChainInfo>>({})
  const [order, setOrder] = useState<number[]>([])

  const selectedChainId = state?.chainId ?? DEFAULT_CHAIN_ID

  const chain = useMemo(() => {
    return chains[selectedChainId] ?? null
  }, [chains, selectedChainId])

  async function refreshChains(mode: NetworkMode = NETWORK_MODE) {
    const res = await bg<{ chains: Record<number, ChainInfo>; order: number[] }>({
      type: "GET_CHAINS",
      mode
    })
    setChains(res.chains || {})
    setOrder(res.order || [])
  }

  async function refresh() {
    setErr("")
    const s = await bg<State>({ type: "GET_STATE" })
    setState(s)
    if (!s.hasWallet) setScreen("onboard")
    else if (!s.unlocked) setScreen("unlock")
    else setScreen("home")
  }

  async function refreshBalance() {
    try {
      if (!state?.hasWallet) return
      const res = await bg<{ balance: string }>({ type: "GET_BALANCE" })
      setBalance(res.balance)
    } catch {
      setBalance("—")
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        await refreshChains(NETWORK_MODE)
        await refresh()
      } catch (e: any) {
        setErr(e.message)
        setScreen("loading")
      }
    })()
  }, [])

  useEffect(() => {
    if (screen === "home") refreshBalance().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state?.chainId])

  if (screen === "loading") {
    return (
      <div className="container">
        <div className="card">
          <p className="p">Booting OmniWallet…</p>
          {err ? <div className="err">{err}</div> : null}
        </div>
      </div>
    )
  }

  if (screen === "onboard") {
    const modeLabel = NETWORK_MODE === "testnet" ? "Testnet" : "Mainnet"
    return (
      <div className="container">
        <div className="card">
          <h1 className="h1">OmniWallet</h1>
          <p className="p">
            Minimal EVM wallet extension for dev/MVP use. Supports{" "}
            <span className="mono">EVM networks + custom RPC networks</span>.
          </p>
          <div className="muted" style={{ marginTop: 6 }}>
            Mode: <span className="mono">{modeLabel}</span>
          </div>

          <div style={{ height: 12 }} />

          <div className="grid">
            <button className="btn primary" onClick={() => setScreen("create")}>
              Create new wallet
            </button>
            <button className="btn" onClick={() => setScreen("import")}>
              Import private key
            </button>
          </div>

          <div style={{ height: 10 }} />
          <div className="muted" style={{ fontSize: 12 }}>
            Don’t store real funds here yet. This is still a prototype.
          </div>

          {err ? <div className="err">{err}</div> : null}
        </div>
      </div>
    )
  }

  if (screen === "create") return <CreateWallet onDone={refresh} onBack={() => setScreen("onboard")} />
  if (screen === "import") return <ImportWallet onDone={refresh} onBack={() => setScreen("onboard")} />
  if (screen === "unlock") return <Unlock onDone={refresh} />

  if (screen === "addNetwork") {
    return (
      <AddCustomNetwork
        defaultMode={NETWORK_MODE}
        onBack={() => setScreen("home")}
        onSaved={async () => {
          await refreshChains(NETWORK_MODE)
          setScreen("home")
        }}
      />
    )
  }

  // home
  const nativeSymbol = chain?.nativeSymbol ?? "NATIVE"

  return (
    <div className="container">
      <div className="card">
        <div className="spread">
          <div>
            <div className="h1">Wallet</div>
            <div className="muted mono">{shortAddr(state?.address ?? "")}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Mode: <span className="mono">{NETWORK_MODE}</span>
            </div>
          </div>
          <button
            className="btn small"
            onClick={async () => {
              await navigator.clipboard.writeText(state?.address ?? "")
            }}
          >
            Copy
          </button>
        </div>

        <div className="hr" />

        <div className="grid">
          <div>
            <div className="muted">Network</div>
            <select
              value={String(selectedChainId)}
              onChange={async (e) => {
                const v = e.target.value

                if (v.startsWith("non-evm:")) {
                  e.currentTarget.value = String(selectedChainId)
                  return
                }

                const chainId = Number(v)
                if (!Number.isFinite(chainId)) return

                // must exist in merged list
                if (!chains[chainId]) return

                await bg({ type: "SET_CHAIN", chainId })
                await refresh()
              }}
            >
              <optgroup label="EVM">
                {order
                  .map((id) => chains[id])
                  .filter(Boolean)
                  .map((c) => (
                    <option key={c.chainId} value={String(c.chainId)}>
                      {c.name}
                      {c.isCustom ? " (Custom)" : ""}
                      {c.isTestnet ? " (Testnet)" : ""}
                    </option>
                  ))}
              </optgroup>

              <optgroup label="Non-EVM (coming soon)">
                {NON_EVM_CHAINS.map((c) => (
                  <option key={c.key} value={`non-evm:${c.key}`} disabled={!c.enabled}>
                    {c.name} (coming soon)
                  </option>
                ))}
              </optgroup>
            </select>

            <div style={{ height: 8 }} />

            <div className="grid two">
              <button className="btn small" onClick={() => setScreen("addNetwork")}>
                Add custom network
              </button>

              <button
                className="btn small danger"
                disabled={!chain?.isCustom}
                onClick={async () => {
                  try {
                    setErr("")
                    if (!chain?.isCustom) return
                    const mode: NetworkMode = chain.isTestnet ? "testnet" : "mainnet"
                    await bg({ type: "REMOVE_CUSTOM_CHAIN", mode, chainId: chain.chainId })
                    await refreshChains(NETWORK_MODE)
                    await refresh()
                  } catch (e: any) {
                    setErr(e.message)
                  }
                }}
              >
                Remove (custom)
              </button>
            </div>
          </div>

          <div className="spread">
            <div>
              <div className="muted">Balance ({nativeSymbol})</div>
              <div className="mono">{balance}</div>
            </div>
            <button className="btn small" onClick={refreshBalance}>
              Refresh
            </button>
          </div>
        </div>

        <div className="hr" />

        <SendNative
          chain={chain}
          nativeSymbol={nativeSymbol}
          onSent={() => refreshBalance()}
          onError={(m) => setErr(m)}
        />

        <div className="hr" />

        <div className="grid two">
          <button
            className="btn"
            onClick={async () => {
              await bg({ type: "LOCK" })
              await refresh()
            }}
          >
            Lock
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              await chrome.storage.local.clear()
              window.location.reload()
            }}
          >
            Reset (dev)
          </button>
        </div>

        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  )
}

function Unlock({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [err, setErr] = useState("")

  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">Unlock</h1>
        <p className="p">Enter your password to unlock your wallet.</p>
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div style={{ height: 10 }} />
        <button
          className="btn primary"
          onClick={async () => {
            try {
              setErr("")
              await bg({ type: "UNLOCK", password })
              onDone()
            } catch (e: any) {
              setErr(e.message)
            }
          }}
        >
          Unlock
        </button>
        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  )
}

function CreateWallet({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [password, setPassword] = useState("")
  const [mnemonic, setMnemonic] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [err, setErr] = useState("")

  const created = Boolean(mnemonic)

  return (
    <div className="container">
      <div className="card">
        <div className="spread">
          <h1 className="h1">Create wallet</h1>
          <button className="btn small" onClick={onBack}>Back</button>
        </div>

        {!created ? (
          <>
            <p className="p">Set a password (used to encrypt your wallet locally).</p>
            <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ height: 10 }} />
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  setErr("")
                  const res = await bg<{ address: string; mnemonic: string }>({ type: "CREATE_WALLET", password })
                  setMnemonic(res.mnemonic)
                  setAddress(res.address)
                } catch (e: any) {
                  setErr(e.message)
                }
              }}
            >
              Create
            </button>
          </>
        ) : (
          <>
            <p className="p">
              Save your recovery phrase. If you lose it, you lose the wallet. No “oops” button.
            </p>
            <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="muted">Address</div>
              <div className="mono">{address}</div>
              <div className="hr" />
              <div className="muted">Recovery phrase</div>
              <div className="mono" style={{ whiteSpace: "pre-wrap" }}>{mnemonic}</div>
            </div>
            <div style={{ height: 10 }} />
            <button className="btn primary" onClick={onDone}>
              I saved it — continue
            </button>
          </>
        )}

        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  )
}

function ImportWallet({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [privateKey, setPrivateKey] = useState("")
  const [password, setPassword] = useState("")
  const [err, setErr] = useState("")

  return (
    <div className="container">
      <div className="card">
        <div className="spread">
          <h1 className="h1">Import private key</h1>
          <button className="btn small" onClick={onBack}>Back</button>
        </div>
        <p className="p">MVP: private key import only. Seed phrase import can be added next.</p>
        <input className="input" placeholder="0x… private key" value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} />
        <div style={{ height: 10 }} />
        <input className="input" type="password" placeholder="New password to encrypt" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div style={{ height: 10 }} />
        <button
          className="btn primary"
          onClick={async () => {
            try {
              setErr("")
              await bg({ type: "IMPORT_PRIVATE_KEY", privateKey, password })
              onDone()
            } catch (e: any) {
              setErr(e.message)
            }
          }}
        >
          Import
        </button>
        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      </div>
    </div>
  )
}

function SendNative({
  chain,
  nativeSymbol,
  onSent,
  onError
}: {
  chain: ChainInfo | null
  nativeSymbol: string
  onSent: () => void
  onError: (m: string) => void
}) {
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle")
  const [txHash, setTxHash] = useState<string>("")

  // explorer for custom chain (use chain object)
  const txUrl =
    txHash && chain?.blockExplorerUrl ? `${normalizeUrl(chain.blockExplorerUrl)}/tx/${txHash}` : undefined

  return (
    <div className="grid">
      <div className="h1" style={{ fontSize: 14 }}>Send {nativeSymbol}</div>
      <input className="input" placeholder="Recipient (0x…)" value={to} onChange={(e) => setTo(e.target.value)} />
      <input className="input" placeholder={`Amount (${nativeSymbol})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button
        className="btn primary"
        disabled={status === "sending"}
        onClick={async () => {
          try {
            onError("")
            setStatus("sending")
            const res = await bg<{ hash: string }>({ type: "SEND_NATIVE", to, amount })
            setTxHash(res.hash)
            setStatus("sent")
            onSent()
          } catch (e: any) {
            onError(e.message)
            setStatus("idle")
          }
        }}
      >
        {status === "sending" ? "Sending…" : "Send"}
      </button>

      {status === "sent" ? (
        <div className="ok">
          Sent. Tx:{" "}
          {txUrl ? (
            <a className="mono" href={txUrl} target="_blank" rel="noreferrer">
              {txHash.slice(0, 10)}…
            </a>
          ) : (
            <span className="mono">{txHash.slice(0, 10)}…</span>
          )}
        </div>
      ) : null}
    </div>
  )
}

function AddCustomNetwork({
  defaultMode,
  onBack,
  onSaved
}: {
  defaultMode: NetworkMode
  onBack: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<NetworkMode>(defaultMode)
  const [name, setName] = useState("")
  const [rpcUrl, setRpcUrl] = useState("")
  const [chainIdRaw, setChainIdRaw] = useState("")
  const [nativeSymbol, setNativeSymbol] = useState("")
  const [blockExplorerUrl, setBlockExplorerUrl] = useState("")
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")

  return (
    <div className="container">
      <div className="card">
        <div className="spread">
          <h1 className="h1">Add custom network</h1>
          <button className="btn small" onClick={onBack}>Back</button>
        </div>

        <div className="grid">
          <div>
            <div className="muted">Network type</div>
            <select value={mode} onChange={(e) => setMode(e.target.value as NetworkMode)}>
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>

          <div>
            <div className="muted">Network name</div>
            <input className="input" placeholder="e.g. Blast" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <div className="muted">Default RPC URL</div>
            <input className="input" placeholder="https://..." value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
          </div>

          <div>
            <div className="muted">Chain ID</div>
            <input className="input" placeholder="e.g. 81457 or 0x13E49" value={chainIdRaw} onChange={(e) => setChainIdRaw(e.target.value)} />
          </div>

          <div>
            <div className="muted">Currency symbol</div>
            <input className="input" placeholder="e.g. ETH" value={nativeSymbol} onChange={(e) => setNativeSymbol(e.target.value)} />
          </div>

          <div>
            <div className="muted">Block explorer URL (optional)</div>
            <input className="input" placeholder="https://..." value={blockExplorerUrl} onChange={(e) => setBlockExplorerUrl(e.target.value)} />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <button
          className="btn primary"
          onClick={async () => {
            try {
              setErr("")
              setOk("")

              const chainId = parseChainId(chainIdRaw)
              if (!Number.isFinite(chainId) || chainId <= 0) throw new Error("Invalid Chain ID.")

              const rpc = rpcUrl.trim()
              if (!rpc || !isValidHttpUrl(rpc)) throw new Error("RPC URL must be a valid http(s) URL.")

              const explorer = blockExplorerUrl.trim()
              if (explorer && !isValidHttpUrl(explorer)) throw new Error("Block explorer URL must be valid http(s).")

              await bg({
                type: "ADD_CUSTOM_CHAIN",
                mode,
                chain: {
                  name: name.trim(),
                  rpcUrl: rpc,
                  chainId,
                  nativeSymbol: nativeSymbol.trim(),
                  blockExplorerUrl: explorer || undefined
                }
              })

              setOk("Network added.")
              onSaved()
            } catch (e: any) {
              setErr(e.message ?? "Failed to add network.")
            }
          }}
        >
          Save network
        </button>

        {ok ? <div className="ok" style={{ marginTop: 10 }}>{ok}</div> : null}
        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

        <div style={{ height: 10 }} />
        <div className="muted" style={{ fontSize: 12 }}>
          Networks saved under <span className="mono">{mode}</span>. Your wallet is currently running{" "}
          <span className="mono">{defaultMode}</span>.
        </div>
      </div>
    </div>
  )
}
