import React, { useEffect, useMemo, useState } from "react"
import { bg } from "./rpc"
import { CHAINS } from "../../shared/chains"
import { shortAddr } from "../../utils/format"

type State = {
  hasWallet: boolean
  address: string
  unlocked: boolean
  chainId: number
  chainName: string
}

type Screen = "loading" | "onboard" | "unlock" | "home" | "create" | "import"

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [state, setState] = useState<State | null>(null)
  const [balance, setBalance] = useState<string>("—")
  const [err, setErr] = useState<string>("")
  const chain = useMemo(() => (state ? CHAINS[state.chainId] : null), [state])

  async function refresh() {
    setErr("")
    const s = await bg<State>({ type: "GET_STATE" })
    setState(s)
    if (!s.hasWallet) setScreen("onboard")
    else if (!s.unlocked) setScreen("unlock")
    else setScreen("home")
  }

  async function refreshBalance() {
    if (!state?.hasWallet) return
    const res = await bg<{ balance: string }>({ type: "GET_BALANCE" })
    setBalance(res.balance)
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message))
  }, [])

  useEffect(() => {
    if (screen === "home") refreshBalance().catch(() => {})
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
    return (
      <div className="container">
        <div className="card">
          <h1 className="h1">OmniWallet</h1>
          <p className="p">
            Minimal EVM wallet extension (Avalanche + Polygon). For dev/MVP use. Don’t store your life savings here. 🙂
          </p>
          <div className="grid">
            <button className="btn primary" onClick={() => setScreen("create")}>
              Create new wallet
            </button>
            <button className="btn" onClick={() => setScreen("import")}>
              Import private key
            </button>
          </div>
          {err ? <div className="err">{err}</div> : null}
        </div>
      </div>
    )
  }

  if (screen === "create") return <CreateWallet onDone={refresh} onBack={() => setScreen("onboard")} />
  if (screen === "import") return <ImportWallet onDone={refresh} onBack={() => setScreen("onboard")} />
  if (screen === "unlock") return <Unlock onDone={refresh} />

  // home
  return (
    <div className="container">
      <div className="card">
        <div className="spread">
          <div>
            <div className="h1">Wallet</div>
            <div className="muted mono">{shortAddr(state?.address ?? "")}</div>
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
              value={state?.chainId}
              onChange={async (e) => {
                const chainId = Number(e.target.value)
                await bg({ type: "SET_CHAIN", chainId })
                await refresh()
              }}
            >
              {Object.values(CHAINS).map((c) => (
                <option key={c.chainId} value={c.chainId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="spread">
            <div>
              <div className="muted">Balance ({chain?.nativeSymbol})</div>
              <div className="mono">{balance}</div>
            </div>
            <button className="btn small" onClick={refreshBalance}>
              Refresh
            </button>
          </div>
        </div>

        <div className="hr" />

        <SendNative
          nativeSymbol={chain?.nativeSymbol ?? "NATIVE"}
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
              // Danger: wipes wallet from storage (dev convenience)
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
  nativeSymbol,
  onSent,
  onError
}: {
  nativeSymbol: string
  onSent: () => void
  onError: (m: string) => void
}) {
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle")
  const [txHash, setTxHash] = useState<string>("")

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
          Sent. Tx: <span className="mono">{txHash.slice(0, 10)}…</span>
        </div>
      ) : null}
    </div>
  )
}
