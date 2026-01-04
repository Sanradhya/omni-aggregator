# Omni Aggregator Whitepaper

## Abstract

Blockchain ecosystems today are fragmented across multiple Layer 1 and Layer 2 networks, each requiring its own native token to pay for transaction gas. While users may hold significant value in fungible tokens (e.g., USDC, USDT, ETH derivatives) across chains, they frequently face a critical usability bottleneck: **the absence of native gas on the destination chain**.

Omni Aggregator introduces a **cross-chain gas abstraction protocol** that allows users to execute transactions on any supported chain *without holding that chain’s native gas token*. Omni temporarily supplies the required gas on the destination chain and later recovers the cost from the user on a chain of their choice, plus a protocol fee.

This paper presents the motivation, system design, economic model, transaction logic, and security considerations of Omni Aggregator.

---

## 1. Motivation

### 1.1 The Gas Fragmentation Problem

In current blockchain systems:
- Every chain enforces payment of transaction fees in its own **native token**.
- **Token transfers** (e.g., **ERC-20**) cannot be executed without **native gas**.
- Users frequently hold assets on a chain but lack its **gas token**.

This leads to:
- Friction and failed transfers
- Forced reliance on centralized exchanges or bridges
- Poor user experience in wallets and dApps

### 1.2 Design Goal

Omni Aggregator aims to:
- Eliminate the requirement for users to pre-hold native gas tokens
- Enable seamless, chain-agnostic value transfer
- Preserve non-custodial execution of the user’s primary transaction

---

## 2. System Overview

Omni Aggregator is a liquidity-backed protocol operating treasuries across multiple chains. It acts as a **temporary gas sponsor** while remaining economically neutral through deterministic reimbursement.

Key properties:
- No custody of user assets (except reimbursement transfer)
- Deterministic pricing via upfront quotes
- Chain-agnostic design (EVM-compatible by default)

---

## 3. Actors and Definitions

### 3.1 Actors

- **User**: Initiates a token transfer on a chain where they lack gas
- **Omni Protocol**: Supplies gas and later recovers cost
- **Destination Chain (C)**: Chain on which the user’s token transfer occurs
- **Payment Chain (B)**: Chain from which the user chooses to pay Omni

### 3.2 Notation

Let:
- `x`  = Gas cost for Omni → User funding transaction on Chain C
- `x'` = Gas cost for User → Recipient transaction on Chain C
- `m`  = Gas cost for reimbursement settlement on Chain B
- `f`  = Omni protocol fee rate (e.g., 0.05 = 5%)

---

## 4. Economic Model

### 4.1 Omni Expenditure

Omni spends gas only on the destination chain:

```
Gas_C_total = x + x'
```

Where:
- `x` ensures the user can execute the transaction
- `x'` is the user’s actual transfer cost

### 4.2 User Reimbursement

The user repays Omni on Chain B. Since gas is denominated in Chain C native units, conversion is required.

Let:
- `Convert(C → B)` denote deterministic conversion of Chain C gas value into Chain B payment terms

Base reimbursement:

```
Base_B = Convert(Gas_C_total)
```

Protocol fee:

```
Fee_B = f × Base_B
```

Total charge to user:

```
Charge_B = Base_B + Fee_B + m
```

Thus:
- Omni remains economically whole
- User pays only once, from a chain they already hold funds on

---

## 5. Transaction Flow

### 5.1 High-Level Flow

1. User specifies intent to send a token on Chain C
2. User lacks native gas on Chain C
3. User selects Chain B as reimbursement chain
4. Omni computes and returns a signed quote
5. Omni funds gas on Chain C
6. User executes token transfer on Chain C
7. Omni settles reimbursement on Chain B

---

## 6. Logical Flow Diagram

```
+--------------------+
|        User        |
+--------------------+
          |
          | Intent: Send Token on C
          v
+--------------------+
|   Omni Quoter      |
+--------------------+
          |
          | Estimate x, x', m
          v
+--------------------+
| Signed Quote (TTL) |
+--------------------+
          |
          | Accept
          v
+--------------------+
| Omni Treasury (C)  |
+--------------------+
          |
          | Send Gas (x)
          v
+--------------------+
| User Wallet (C)    |
+--------------------+
          |
          | Token Transfer (x')
          v
+--------------------+
| Recipient (C)      |
+--------------------+
          |
          v
+--------------------+
| Omni Settlement(B) |
+--------------------+
          |
          | Charge_B
          v
+--------------------+
| Omni Treasury (B)  |
+--------------------+
```

---

## 7. Intent State Machine

Each transaction intent follows a deterministic lifecycle:

1. **CREATED** – User intent registered
2. **QUOTED** – Gas and fees calculated
3. **FUNDED** – Omni sends gas on Chain C
4. **USER_SENT** – User transaction confirmed
5. **SETTLED** – Omni reimbursed on Chain B
6. **FAILED / EXPIRED** – Terminal failure states

This ensures:
- Idempotent execution
- Auditable flows
- Safe retries

---

## 8. Risk and Security Considerations

### 8.1 Gas Sponsorship Risk

Omni temporarily assumes gas risk on Chain C. Mitigations include:
- Per-intent gas caps
- User-level rate limits
- Treasury liquidity checks

### 8.2 Settlement Failure

If reimbursement fails on Chain B:
- Omni halts further sponsorship for the user
- Intent remains unresolved for manual or automated recovery

### 8.3 Price Volatility

Gas prices and exchange rates may fluctuate.
Mitigations:
- Short quote TTL
- Conservative gas buffers
- Hard maximum funding limits

---

## 9. Non-Custodial Guarantees

- Omni never holds the user’s primary asset
- User signs and broadcasts their own token transfer
- Omni’s role is limited to gas sponsorship and settlement

---

## 10. Extensibility

The Omni model can be extended to:
- Multiple payment tokens on Chain B
- Stablecoin-based reimbursement
- Meta-transactions and account abstraction
- Cross-chain dApp integrations

---

## 11. Conclusion

Omni Aggregator removes one of the most persistent UX barriers in multi-chain ecosystems: native gas fragmentation. By abstracting gas payments across chains while preserving non-custodial execution, Omni enables seamless, user-friendly value transfer in a decentralized environment.

The protocol aligns incentives through deterministic reimbursement, transparent fees, and bounded risk, making it suitable as foundational infrastructure for next-generation wallets and dApps.

---

*End of Whitepaper*

