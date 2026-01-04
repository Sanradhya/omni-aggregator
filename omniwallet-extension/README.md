# OmniWallet Extension (MVP)

This is a **minimal EVM wallet Chrome extension** (Manifest V3) that supports:
- **Avalanche C-Chain (43114)**
- **Polygon (137)**

It includes:
- Create wallet (encrypted local keystore)
- Import private key (encrypted local keystore)
- Lock/unlock
- View native balance
- Send native token
- Minimal `window.ethereum` injection (EIP-1193-ish) with:
  - `eth_requestAccounts`, `eth_accounts`
  - `eth_chainId`, `wallet_switchEthereumChain`
  - `eth_sendTransaction` (approval flow)
  - basic read-only RPC passthrough

> ⚠️ This is **MVP / dev-grade** code. Do not use it to store meaningful funds without audits, hardened key management, and proper security review.

---

## Setup

### 1) Install deps
```bash
npm install
```

### 2) Build
```bash
npm run build
```

### 3) Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

### 4) Test the injected provider
Open a dapp (or any page) and run in console:
```js
await window.ethereum.request({ method: "eth_requestAccounts" })
await window.ethereum.request({ method: "eth_chainId" })
```

---

## Notes

- Wallet is encrypted using `ethers.Wallet.encrypt(password)` and stored in `chrome.storage.local`.
- When unlocked, the decrypted wallet only lives in the background service worker memory. If Chrome suspends it, you may need to unlock again (normal for MV3 MVPs).
