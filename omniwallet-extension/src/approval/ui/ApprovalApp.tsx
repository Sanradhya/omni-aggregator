import React, { useEffect, useMemo, useState } from "react"
import { bg } from "../../popup/ui/rpc"
import { shortAddr } from "../../utils/format"
import { CHAINS } from "../../shared/chains"

type Pending = {
  id: string
  kind: "connect" | "tx" | "sign" | "switchChain"
  origin: string
  method: string
  createdAt: number
  details: Record<string, any>
}

function qs(name: string) {
  const u = new URL(window.location.href)
  return u.searchParams.get(name)
}

export default function ApprovalApp() {
  const requestId = qs("requestId") || ""
  const [req, setReq] = useState<Pending | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
        const r = await bg<any>({ type: "APPROVAL_GET", requestId })
        setReq(r)
      } catch (e: any) {
        setErr(e.message)
      }
    })()
  }, [requestId])

  const title = useMemo(() => {
    if (!req) return "Approval"
    if (req.kind === "connect") return "Connect request"
    if (req.kind === "tx") return "Confirm transaction"
    if (req.kind === "sign") return "Confirm signature"
    if (req.kind === "switchChain") return "Switch network"
    return "Approval"
  }, [req])

  if (err) {
    return (
      <div className="container">
        <div className="card">
          <h1 className="h1">Approval</h1>
          <div className="err">{err}</div>
        </div>
      </div>
    )
  }

  if (!req) {
    return (
      <div className="container">
        <div className="card">
          <p className="p">Loading request…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">{title}</h1>
        <p className="p">
          Site: <span className="mono">{req.origin}</span>
        </p>

        <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
          <Details req={req} />
        </div>

        <div style={{ height: 12 }} />

        <div className="grid two">
          <button
            className="btn"
            onClick={async () => {
              await bg({ type: "APPROVAL_DECISION", requestId: req.id, approved: false })
              window.close()
            }}
          >
            Reject
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await bg({ type: "APPROVAL_DECISION", requestId: req.id, approved: true })
              window.close()
            }}
          >
            Approve
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Tip: approvals exist so you don’t get drained by a random tab. Basic, but crucial.
        </div>
      </div>
    </div>
  )
}

function Details({ req }: { req: Pending }) {
  const d = req.details || {}
  if (req.kind === "connect") {
    return (
      <>
        <div className="muted">Account</div>
        <div className="mono">{d.address ? shortAddr(d.address) : "—"}</div>
      </>
    )
  }
  if (req.kind === "switchChain") {
    const from = CHAINS[d.from]?.name ?? d.from
    const to = CHAINS[d.to]?.name ?? d.to
    return (
      <>
        <div className="muted">From</div>
        <div className="mono">{String(from)}</div>
        <div className="hr" />
        <div className="muted">To</div>
        <div className="mono">{String(to)}</div>
      </>
    )
  }
  if (req.kind === "tx") {
    return (
      <>
        <div className="muted">From</div>
        <div className="mono">{shortAddr(d.from ?? "")}</div>
        <div className="hr" />
        <div className="muted">To</div>
        <div className="mono">{shortAddr(d.to ?? "")}</div>
        <div className="hr" />
        <div className="muted">Value</div>
        <div className="mono">{String(d.value ?? "0x0")}</div>
        <div className="hr" />
        <div className="muted">Data</div>
        <div className="mono" style={{ wordBreak: "break-all" }}>{String(d.data ?? "0x")}</div>
      </>
    )
  }
  if (req.kind === "sign") {
    return (
      <>
        <div className="muted">Address</div>
        <div className="mono">{shortAddr(d.address ?? "")}</div>
        <div className="hr" />
        <div className="muted">Message (hex)</div>
        <div className="mono" style={{ wordBreak: "break-all" }}>{String(d.message ?? "")}</div>
      </>
    )
  }
  return <div className="muted mono">{JSON.stringify(d, null, 2)}</div>
}
