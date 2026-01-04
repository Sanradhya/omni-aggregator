# docs/LOGIC_DIAGRAM.md

# Omni Aggregator Logic Diagram

This doc explains the end-to-end logic and provides diagrams you can paste into GitHub (Mermaid).

---

## Variables

Chains:
- `C` = chain where the token transfer happens (asset base chain)
- `B` = chain the user chooses to pay from

Gas costs:
- `x`  = gas used by Omni to send native gas to the user on chain `C`
- `x'` = gas used by the user to send the token on chain `C`
- `m`  = gas used to collect reimbursement on chain `B`

Fee:
- `feeRate` = Omni fee (example: `0.05` = 5%)

Conversion:
- `convert(amount_native_C → terms_on_B)` converts Chain C native gas cost into an equivalent payable amount on chain B (token/asset defined by your billing policy).

---

## Core Computation

Omni spend on Chain C:
- `gasC_total = x + x'`

User charge on Chain B:
- `baseB = convert(gasC_total, C → B)`
- `feeB  = feeRate * baseB`
- `chargeB = baseB + feeB + m`

---

## Mermaid Flowchart (Logic)

```mermaid
flowchart TD
  A[User intent: send token on Chain C] --> B{User has native gas on C?}
  B -- Yes --> C[User sends token normally]
  B -- No --> D[User selects pay chain B]
  D --> E[Quote Engine estimates x, x', m]
  E --> F[Compute gasC_total = x + x']
  F --> G["Convert baseB = convert(gasC_total, C to B)"]
  G --> H[chargeB = baseB + feeRate*baseB + m]
  H --> I{Risk checks pass?}
  I -- No --> J[Reject / ask user to pick another chain]
  I -- Yes --> K[Omni funds user with native gas on C]
  K --> L[User broadcasts token transfer on C]
  L --> M{Transfer confirmed?}
  M -- No --> N[Timeout / mark as FUNDED, retry prompts]
  M -- Yes --> O[Settlement: charge user on B]
  O --> P{Charge successful?}
  P -- No --> Q[Settlement failed: retry / dispute flow]
  P -- Yes --> R[Mark intent SETTLED]
    