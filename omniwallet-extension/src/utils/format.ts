import { ethers } from "ethers"

export function shortAddr(addr: string) {
  if (!addr) return ""
  return addr.slice(0, 6) + "…" + addr.slice(-4)
}

export function safeJsonParse<T>(s: string): T | null {
  try { return JSON.parse(s) as T } catch { return null }
}

export function hexToBigInt(v?: string) {
  if (!v) return undefined
  if (typeof v !== "string") return undefined
  return BigInt(v)
}

export function toBigIntFromHexOrNumber(v: any): bigint | undefined {
  if (v == null) return undefined
  if (typeof v === "bigint") return v
  if (typeof v === "number") return BigInt(v)
  if (typeof v === "string") {
    if (v.startsWith("0x") || v.startsWith("0X")) return BigInt(v)
    // decimal
    if (/^\d+$/.test(v)) return BigInt(v)
  }
  return undefined
}

export function normalizeHex(hex: string) {
  return hex.startsWith("0x") ? hex : ("0x" + hex)
}

export function utf8ToHex(str: string) {
  return ethers.hexlify(ethers.toUtf8Bytes(str))
}
