# ARAG v5 — Adaptive Recursive Attestation Graph
## Full Demo Implementation

**Patent-Pending · VIT Chennai · SENSE Department**  
**Inventors:** Amritha S, Yugeshwaran P  
**Supervisor:** Dr. Sritama Roy, Associate Professor  
**Attorney:** Khurana & Khurana IP Attorneys  

---

## Demo Videos

Two recordings live in [`demo/`](demo/).

| File | Length | What it covers |
|---|---|---|
| [`ARAG-explained.mp4`](demo/ARAG-explained.mp4) | 4:17 | Plain-language explanation of the problem, why TEE / ZKP / ledgers each fall short on their own, the recursive-chaining idea, one epoch step by step, the seven attacks and the mechanism that answers each, Proof-of-Silence, and applications. Includes Figures 1–3. |
| [`ARAG-full-demo.mp4`](demo/ARAG-full-demo.mp4) | 5:17 | The application running. Step-mode walk through all eight phases of one epoch, chain growth, O(1) verification, all seven attacks armed and detected one at a time, failure trace, Proof-of-Silence, Merkle range proof, and the three-institution panel. |

Every hash, proof and detection shown in the demo recording is computed live in the
browser by the code in this repository — no values are mocked or pre-rendered.

[`demo/NARRATION-SCRIPT.md`](demo/NARRATION-SCRIPT.md) holds a section-by-section
narration script for both videos, for anyone recording a voice-over.

---

## What's New in v5

### 1. Compliance Timeline (Section: Timeline)
Visual epoch-by-epoch compliance window. Shows:
- Sliding window [E_t-k … E_t] with ✓/✗ per epoch box
- COMPLIANT / VIOLATION status with exact epoch references
- GH_t chain evolution visible directly
- Auto-updates after every epoch

### 2. Multi-Institution Panel (Section: Multi-Inst)
Three independent institutions under one regulator running simultaneously:
- Global Investment Bank (Basel III, Intel SGX)
- Crypto Exchange Ltd. (AML Sanctions, AMD SEV)
- Meridian Hedge Fund (VaR Limit, ARM TrustZone)
- Per-institution attack toggles (arm Time Rollback, Circuit Sub., Fake Attest., Tamper Hash on any specific institution)
- Shared regulator registry showing all institutions
- "Run Epoch Round" or "Run 5 Rounds" batch mode

### 3. Failure Trace Analyzer (Section: Failure Trace)
Field-level security diagnostics — the auditor's tool:
- AGKD recomputed independently from bundle
- GH_t recomputed from scratch
- C_hash and τ_t compared field-by-field
- Root cause mapping: each failed field → exact attack vector
- Security implication text per failure type
- "Load Attack Sample" button generates a pre-built circuit-substitution attack bundle

### 4. Step Execution Mode
Toggle "Step Mode" in the Demo panel to walk epoch generation phase by phase:
- 8 phases: Oracle → Circuit → Attest → ZKP → AGKD → Graph Hash → DMS → Bundle
- Visual step tracker with F-label tags
- "Next Step" / "Complete All" controls
- Each step logs what was computed

### 5. New Attack: Tamper Previous Hash (7th attack vector)
Directly corrupts GH_prev before computing GH_t — simulates a history-rewriting attack:
- Demonstrates the core recursive tamper-evidence property (F1)
- Breaking one epoch's hash propagates to all future hashes
- Chain integrity check catches it immediately

### 6. Epoch Metrics Chart
Live canvas chart: verify time (ms) line + pass/fail bars per epoch.

### 7. Auto Demo Mode (v4 feature, retained)
8-step scripted walkthrough: Genesis → 3 clean epochs → Time Rollback (blocked) → Circuit Sub. (blocked) → recovery.

---

## Setup

```bash
cd ARAG_v5
npm install
npm start
# open http://localhost:3000
```

No build step. No bundler. Everything runs natively in the browser.

---

## Architecture

```
ARAG_v5/
├── server.js                   ← Express static server
├── package.json
├── public/
│   ├── index.html              ← Full app (12 sections)
│   ├── diagrams/
│   │   ├── fig1.html           ← System Architecture SVG
│   │   ├── fig2.html           ← AGKD Block Diagram SVG
│   │   └── fig3.html           ← Proof-of-Silence + Merkle SVG
│   └── src/
│       ├── utils/crypto.js     ← SHA-256, ZKP sim, TEE attest, Merkle, DMS
│       ├── utils/engine.js     ← ARAG state machine (all 7 attacks)
│       ├── main.js             ← UI + all v4/v5 features
│       └── styles/main.css     ← Complete stylesheet
```

---

## All 7 Attack Vectors

| Attack | Mechanism Countered | Detection Method |
|---|---|---|
| Fraudulent Genesis | F2a | vk_0 not co-signed by regulator |
| Time Rollback | F3 | τ_t ≠ NIST Beacon + BTC block |
| Circuit Substitution | F4 | A_t.C_hash ≠ H(real_circuit) |
| Missing Epoch / Gap | F2b | Append-only registry gap |
| Fake Attestation | F1/F4 | MRENCLAVE not in trusted registry |
| Dead Man's Switch Abort | F6 | DMS commitment unprovable |
| Tamper Previous Hash | F1 | GH_t recomputation mismatch |

---

*CONFIDENTIAL — ATTORNEY-CLIENT PRIVILEGED WORK PRODUCT*  
*Khurana & Khurana IP Attorneys · March 2026*
