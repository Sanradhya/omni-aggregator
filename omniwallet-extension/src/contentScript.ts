/**
 * Content script responsibilities:
 * 1) Inject inpage provider into the page context
 * 2) Bridge window.postMessage <-> chrome.runtime messaging
 */

function injectInpage() {
  const src = chrome.runtime.getURL("src/inpage.ts")
  const s = document.createElement("script")
  s.setAttribute("src", src)
  s.setAttribute("type", "module")
  s.onload = () => s.remove()
  ;(document.head || document.documentElement).appendChild(s)
}

injectInpage()

// Forward dapp -> background
window.addEventListener("message", async (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (!msg || msg.type !== "OMNI_WALLET_REQUEST") return

  const { id, method, params } = msg
  const origin = window.location.origin

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "RPC_REQUEST",
      id,
      origin,
      method,
      params
    })
    window.postMessage(
      {
        type: "OMNI_WALLET_RESPONSE",
        id,
        result: resp?.result,
        error: resp?.error
      },
      "*"
    )
  } catch (e: any) {
    window.postMessage(
      {
        type: "OMNI_WALLET_RESPONSE",
        id,
        result: null,
        error: e?.message ?? String(e)
      },
      "*"
    )
  }
})

// Forward background -> dapp events
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "OMNI_EVENT") {
    window.postMessage(
      {
        type: "OMNI_WALLET_EVENT",
        event: msg.event,
        payload: msg.payload
      },
      "*"
    )
  }
})
