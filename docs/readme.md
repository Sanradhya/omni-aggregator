# Omni Aggregator

**Omni Aggregator** is a gas-abstracting transaction aggregator that lets users send tokens on a chain **without holding that chain’s native gas token**.

Example:  
A user wants to send **USDC on Avalanche**, but they don’t have **AVAX** for gas. They *do* have funds on **Polygon** or **Ethereum**. Omni covers the AVAX gas up-front, then **recovers the cost from the user on their chosen chain** (Polygon/Ethereum/etc) plus a fee.

> TL;DR: **Send assets on Chain C using gas paid from Chain B.** No “go buy AVAX first” nonsense.

---

## Problem

On most chains, to transfer an ERC-20 (like USDC), users must also hold the chain’s **native token** (AVAX/ETH/MATIC/etc) for gas.

That creates friction:
- Users have value, but on the “wrong chain”
- Users get stuck at the worst possible time: *right before sending money*

---

## Solution

Omni maintains liquidity across chains (A…Z).  
When a user wants to transfer an asset on **Chain C** but lacks **native gas on Chain C**, Omni:

1. **Funds the user’s wallet on Chain C** with enough native gas to execute the intended transfer.
2. User completes the transfer on Chain C.
3. Omni **charges the user on Chain B** (the chain they selected) to recover:
   - the gas Omni spent on Chain C (funding + user tx gas),
   - the gas needed to charge on Chain B,
   - plus Omni’s service fee.

---

## How It Works (Core Flow)

Let:
- Chain **C** = destination / asset base chain (where the transfer happens)
- Chain **B** = user-selected payment chain (where Omni collects reimbursement)

Gas variables:
- `x`  = gas cost for Omni → user funding tx on Chain C  
- `x'` = gas cost for user → recipient tx on Chain C  
- `m`  = gas cost to settle/collect on Chain B  
- `feeRate` = Omni fee rate (e.g., `0.05` = **5%**)

Total Omni spend on Chain C:
- `gasC_total = x + x'`

Total user charge on Chain B:
- `chargeB = convert(gasC_total, C → B) + m + feeRate * convert(gasC_total, C → B)`

So:
- Omni spends: `x + x'` (on Chain C)
- User pays back: `(x + x')` converted into Chain B terms + `m` + Omni fee

---

## Example Walkthrough

**User intent:** Send `USDC (Avalanche)` to a friend  
**User problem:** 0 AVAX  
**User has:** MATIC on Polygon  
**User selects:** Pay gas from Polygon (Chain B)

**Flow:**
1. Omni computes required gas on Avalanche: `x + x'`
2. Omni sends enough AVAX to the user on Avalanche to cover transfer gas (`x` cost for Omni’s funding tx)
3. User sends USDC on Avalanche to recipient (`x'`)
4. Omni collects reimbursement on Polygon:
   - `(x + x')` (converted to Polygon units)
   - `+ m` (Polygon settlement gas)
   - `+ Omni fee`

---

## Repo Layout (Suggested)

```text
omni-aggregator/
  contracts/                # On-chain contracts (vaults, fee collector, etc.)
  services/
    quote-engine/           # Gas estimation + cross-chain conversion
    chain-executor/         # Chain adapters + tx execution
    settlement/             # Collect reimbursement on user-selected chain
    risk-engine/            # Limits, sanity checks, liquidity constraints
  apps/
    wallet/                 # User-facing wallet UI integration (optional)
    admin/                  # Treasury + monitoring dashboard (optional)
  docs/
    ARCHITECTURE.md
    LOGIC_DIAGRAM.md
