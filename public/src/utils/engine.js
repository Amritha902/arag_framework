// ── ARAG Engine v3 — Complete Implementation with Attack Detection ──
// All mechanisms: F1, F2a, F2b, F3, F4, F5, F6, F8
// Attack simulation: Fraudulent Genesis, Time Rollback, Circuit Substitution,
//                    Missing Epoch/Gap, Fake Attestation, Dead Man's Switch Abort

const ENGINE = (() => {

  let S = {
    ready: false, inst: null, pred: null, tee: null,
    genesis: null, real_C_hash: null,
    chain: [], leaves: [], registry: [],
    faults: { genesis:false, timestamp:false, circuit:false,
               epochSkip:false, fakeProof:false, dmsAbort:false, tamperHash:false },
    verifyTimes: [],
  };

  const INST = {
    bank:     { id:'BANK_001',     name:'Global Investment Bank'  },
    exchange: { id:'EXCHANGE_002', name:'Crypto Exchange Ltd.'    },
    fund:     { id:'FUND_003',     name:'Meridian Hedge Fund'     },
    insurer:  { id:'INSURE_004',   name:'Pacific Insurance Co.'   },
  };
  const PRED = {
    solvency:  { id:'PRED_SOLVENCY', name:'Basel III Solvency ≥ 8%', circuit:'CIRCUIT_SOL_V2' },
    liquidity: { id:'PRED_LCR',      name:'LCR ≥ 100%',              circuit:'CIRCUIT_LCR_V1' },
    sanctions: { id:'PRED_AML',      name:'AML Sanctions Screening',  circuit:'CIRCUIT_AML_V3' },
    var:       { id:'PRED_VAR',      name:'VaR Limit Compliance',     circuit:'CIRCUIT_VAR_V1' },
  };
  const TEE_MAP = { sgx:'Intel SGX', sev:'AMD SEV', tz:'ARM TrustZone' };
  const REGULATOR = { id:'REG_CENTRAL_AUTHORITY', name:'Central Compliance Authority' };

  // ── init() — called ONCE per session ──
  function init(instKey, predKey, teeKey) {
    if (S.ready) return S.genesis;
    const inst = { ...INST[instKey] };
    const pred = PRED[predKey];
    const tee  = TEE_MAP[teeKey] || 'Intel SGX';
    inst.mrenclave = CRYPTO.H('MRENCLAVE_V1', inst.id, pred.circuit);
    const real_C_hash = CRYPTO.H('CIRCUIT_BYTES_V1', pred.circuit, inst.id);
    const gen = CRYPTO.genesis(inst, REGULATOR, pred);
    S = { ready:true, inst, pred, tee, genesis:gen, real_C_hash,
          chain:[], leaves:[], registry:[],
          faults: { ...S.faults }, verifyTimes:[] };
    return gen;
  }

  function prevState() {
    if (!S.chain.length) return { vk_prev:S.genesis.vk_0, GH_prev:S.genesis.GH_0, epoch_prev:0 };
    const last = S.chain[S.chain.length - 1];
    return { vk_prev:last.vk_t, GH_prev:last.GH_t, epoch_prev:last.epoch };
  }

  // ── runEpoch() — F1 through F8 ──
  function runEpoch(epochK) {
    if (!S.ready) throw new Error('ENGINE not initialized');
    const { vk_prev, GH_prev, epoch_prev } = prevState();
    const epoch = epoch_prev + 1;
    const { inst, pred, tee, faults } = S;
    const k = epochK || 24;

    // Step 1 — Encrypted inputs
    const x_t = CRYPTO.rnd(32);
    const w_t = CRYPTO.rnd(32);

    // Step 2 — Time Oracle (F3) — with real-world anchor simulation
    const oracle = CRYPTO.timeOracle(epoch);
    const tau = faults.timestamp
      ? CRYPTO.H('BACKDATED', String(epoch - 10), 'OLD_NIST')
      : oracle.tau;

    // Step 3 — Circuit hash (F4)
    const C_hash = faults.circuit
      ? CRYPTO.H('SUBST_CIRCUIT', CRYPTO.rnd(4), 'ATTACKER_CIRCUIT')
      : S.real_C_hash;

    const nonce = CRYPTO.rnd(32);

    // Step 4 — TEE Attestation (F4)
    // Fake Proof attack: substitute MRENCLAVE with spoofed value
    const mrenclave_used = faults.fakeProof
      ? CRYPTO.H('SPOOFED_MRENCLAVE', CRYPTO.rnd(8))
      : inst.mrenclave;

    const A_t = CRYPTO.attest({
      MRENCLAVE: mrenclave_used, C_hash, policy:pred, tau, nonce, epoch, tee_type:tee
    });

    // Step 5 — ZKP Proof (Groth16 simulation)
    const pi_t = CRYPTO.zkprove({ x_t, w_t, C_hash, policy:pred, epoch });

    // Step 6 — AGKD: vk_t = H(vk_{t-1} || A_t.quote || pred.id)
    const vk_t = CRYPTO.agkd(vk_prev, A_t, pred);

    // Step 7 — Recursive Graph Hash: GH_t = H(GH_{t-1} || A_t || π_t || vk_t)
    // TamperHash attack: corrupt GH_prev so the chain link breaks
    const GH_prev_used = faults.tamperHash
      ? CRYPTO.H('TAMPERED_GH', GH_prev, CRYPTO.rnd(4), 'ATTACKER')
      : GH_prev;
    const GH_t = CRYPTO.graphHash(GH_prev_used, A_t, pi_t, vk_t);

    // Step 8 — Dead Man's Switch (F6)
    // DMS Abort attack: nonce destroyed, commitment unprovable
    const dms_t = faults.dmsAbort
      ? { nonce_next: null, commitment: CRYPTO.H('DESTROYED_NONCE', String(Date.now())),
          scheduled_next: Date.now() + 30 * 24 * 3600 * 1000, aborted: true }
      : CRYPTO.dms(GH_t, Date.now() + 30 * 24 * 3600 * 1000);

    // Step 9 — Merkle leaf
    const leaf = CRYPTO.H(GH_t, String(epoch), vk_t, A_t.quote);

    // Step 10 — Proof-of-Silence (F8)
    const { rec:silRec, proof:silProof } = CRYPTO.silenceMachine({ k, violationAt:0 });

    // Step 11 — Manifest
    const manifest = {
      epoch, institution:inst.id, institution_name:inst.name,
      predicate:pred.id, tee_type:tee,
      timestamp:A_t.timestamp,
      oracle:{ nist_round:oracle.nist_round, btc_block:oracle.btc_block, tau },
      dms_commitment:dms_t.commitment,
      silence_hash:CRYPTO.H(JSON.stringify(silRec)),
      chain_depth:epoch,
    };

    // Step 12 — Fault detection log
    const faultLog = [];
    if (faults.genesis && epoch===1)
      faultLog.push('GENESIS_FRAUD: vk_0 not co-signed by regulator — F2a check FAILED');
    if (faults.timestamp)
      faultLog.push('TIMESTAMP_FAULT: τ_t mismatch with NIST Beacon round — F3 check FAILED');
    if (faults.circuit)
      faultLog.push('CIRCUIT_SUBSTITUTION: C_hash not in registered circuit set — F4 check FAILED');
    if (faults.fakeProof)
      faultLog.push('FAKE_ATTESTATION: MRENCLAVE mismatch with trusted registry — F1/F4 FAILED');
    if (faults.dmsAbort)
      faultLog.push("DMS_ABORT: Dead Man's Switch nonce destroyed — F6 liveness check FAILED");
    if (faults.tamperHash)
      faultLog.push('HASH_TAMPER: GH_prev corrupted by attacker — recursive graph chain broken — F1 FAILED');

    // Step 13 — Registry (F2b)
    // EpochSkip attack: simulate a gap in registry
    if (!faults.epochSkip) {
      S.registry.push({
        epoch, commit:CRYPTO.H(GH_t, String(epoch), String(A_t.timestamp)),
        GH_t, timestamp:A_t.timestamp,
        institution:inst.name, valid:faultLog.length===0
      });
    } else {
      // Push a gap marker
      S.registry.push({
        epoch, commit:'REGISTRY_GAP_DETECTED',
        GH_t:'—', timestamp:A_t.timestamp,
        institution:inst.name, valid:false, gapInjected:true
      });
      faultLog.push('REGISTRY_GAP: Epoch skipped in append-only registry — F2b check FAILED');
    }

    const bundle = {
      epoch, pi_t, A_t, vk_t, GH_t, vk_prev, GH_prev,
      GH_prev_actual: GH_prev, GH_prev_used,
      manifest, dms:dms_t, silence:{rec:silRec, proof:silProof},
      leaf, oracle, real_C_hash:S.real_C_hash,
      faults_injected:{...faults},
      verification:{ valid:faultLog.length===0, faultLog },
    };

    S.chain.push(bundle);
    S.leaves.push(leaf);

    return bundle;
  }

  // ── verify(bundle) — O(1), all checks ──
  function verify(bundle) {
    const t0 = performance.now();
    const checks = [];

    // ZKP fields present
    checks.push({ label:'ZKP (F1): proof_a, proof_b, proof_c, statement_hash present',
      pass:!!(bundle.pi_t?.proof_a && bundle.pi_t?.proof_b && bundle.pi_t?.proof_c && bundle.pi_t?.statement_hash),
      detail: bundle.pi_t?.proof_a ? 'All Groth16 fields present (192 B)' : 'Missing ZKP fields' });

    // TEE attestation fields
    checks.push({ label:'TEE (F1): MRENCLAVE, C_hash, quote, report_data present',
      pass:!!(bundle.A_t?.quote && bundle.A_t?.MRENCLAVE && bundle.A_t?.C_hash && bundle.A_t?.report_data),
      detail: bundle.A_t?.quote ? 'Attestation quote valid structure' : 'Missing attestation fields' });

    // AGKD: recompute vk_t
    let agkdOk = false;
    if (bundle.vk_prev && bundle.A_t && bundle.manifest?.predicate) {
      const expected = CRYPTO.agkd(bundle.vk_prev, bundle.A_t, { id:bundle.manifest.predicate });
      agkdOk = expected === bundle.vk_t;
    }
    checks.push({ label:'AGKD (F1): vk_t = H(vk_{t-1} ‖ A_t.quote ‖ Policy) recomputed',
      pass:agkdOk, detail: agkdOk ? 'Key derivation chain verified' : 'Key derivation mismatch — chain broken' });

    // Graph hash recompute
    let ghOk = false;
    if (bundle.GH_prev && bundle.A_t && bundle.pi_t && bundle.vk_t) {
      const expected = CRYPTO.graphHash(bundle.GH_prev, bundle.A_t, bundle.pi_t, bundle.vk_t);
      ghOk = expected === bundle.GH_t;
    }
    checks.push({ label:'Graph Hash (F1): GH_t = H(GH_{t-1} ‖ A_t ‖ π_t ‖ vk_t) recomputed',
      pass:ghOk, detail: ghOk ? 'Recursive hash chain verified' : 'Graph hash mismatch — tampered bundle' });

    // GH_t distinct from GH_prev
    checks.push({ label:'Chain Advance: GH_t ≠ GH_{t-1}',
      pass:!!(bundle.GH_t && bundle.GH_prev && bundle.GH_t !== bundle.GH_prev),
      detail: 'Each epoch must produce a distinct hash' });

    // Dead Man's Switch (F6)
    const dmsOk = !!(bundle.dms?.commitment?.length===64 && bundle.dms?.scheduled_next);
    const dmsAborted = bundle.faults_injected?.dmsAbort || bundle.dms?.aborted;
    checks.push({ label:"Dead Man's Switch (F6): commitment present, scheduled_next valid",
      pass: dmsOk && !dmsAborted,
      detail: dmsAborted ? 'DMS nonce destroyed — liveness broken' : dmsOk ? 'Liveness commitment valid' : 'Missing DMS commitment' });

    // Proof-of-Silence (F8)
    checks.push({ label:'Proof-of-Silence (F8): State_k=COMPLIANT, all sub-epochs TRUE',
      pass:!!(bundle.silence?.proof?.valid && bundle.silence?.rec?.final_state==='COMPLIANT'),
      detail: bundle.silence?.proof?.valid ? `All ${bundle.silence?.rec?.k} sub-epochs compliant` : 'Silence violation detected' });

    // Circuit binding (F4)
    if (bundle.real_C_hash && bundle.A_t?.C_hash) {
      const cbOk = bundle.A_t.C_hash === bundle.real_C_hash;
      checks.push({ label:'Circuit Binding (F4): A_t.C_hash matches registered circuit',
        pass: cbOk,
        detail: cbOk ? 'Circuit hash matches trusted registry' : 'Circuit substitution detected — C_hash mismatch' });
    }

    // Time oracle consistency (F3)
    if (bundle.manifest?.oracle?.tau && bundle.A_t?.tau) {
      const tauOk = bundle.manifest.oracle.tau === bundle.A_t.tau;
      checks.push({ label:'Time Oracle (F3): τ_t consistent in A_t and manifest',
        pass: tauOk,
        detail: tauOk ? 'NIST + BTC time anchor consistent' : 'τ_t mismatch — possible backdating attack' });
    }

    // Fault flags
    if (bundle.faults_injected?.genesis)
      checks.push({ label:'Genesis (F2a): regulator co-signature missing [ATTACK INJECTED]',
        pass:false, detail:'Fraudulent genesis detected — vk_0 not regulator-witnessed' });
    if (bundle.faults_injected?.timestamp)
      checks.push({ label:'Time Oracle (F3): backdated τ_t detected [ATTACK INJECTED]',
        pass:false, detail:'Timestamp rollback attack blocked' });
    if (bundle.faults_injected?.circuit)
      checks.push({ label:'Circuit (F4): substituted circuit detected [ATTACK INJECTED]',
        pass:false, detail:'Runtime circuit swap blocked by MRENCLAVE + C_hash binding' });
    if (bundle.faults_injected?.fakeProof)
      checks.push({ label:'Attestation (F1/F4): spoofed MRENCLAVE detected [ATTACK INJECTED]',
        pass:false, detail:'Fake attestation rejected — MRENCLAVE not in trusted registry' });
    if (bundle.faults_injected?.epochSkip)
      checks.push({ label:'Registry (F2b): epoch gap detected [ATTACK INJECTED]',
        pass:false, detail:'Missing epoch in append-only registry — gap = cryptographic evidence of deletion' });
    if (bundle.faults_injected?.dmsAbort)
      checks.push({ label:"DMS (F6): nonce destroyed on TEE abort [ATTACK INJECTED]",
        pass:false, detail:'Forced shutdown detected via unprovable DMS commitment' });
    if (bundle.faults_injected?.tamperHash)
      checks.push({ label:'Graph Hash (F1): GH_prev tampered by attacker [ATTACK INJECTED]',
        pass:false, detail:'GH_prev was modified — H(GH_prev_tampered‖…) ≠ expected chain link. Any downstream verifier catches this immediately.' });

    const elapsed = performance.now() - t0;
    S.verifyTimes.push(elapsed);
    return { valid:checks.every(c=>c.pass), checks, epoch:bundle.epoch, elapsed_ms:elapsed.toFixed(2) };
  }

  // ── verifyChain() ──
  function verifyChain() {
    if (!S.chain.length) return { valid:false, errors:['Empty chain'] };
    const errors = [];
    if (S.chain[0].GH_prev !== S.genesis.GH_0) errors.push('Epoch 1: GH_prev ≠ genesis GH_0');
    if (S.chain[0].vk_prev !== S.genesis.vk_0)  errors.push('Epoch 1: vk_prev ≠ genesis vk_0');
    for (let i = 1; i < S.chain.length; i++) {
      const p = S.chain[i-1], c = S.chain[i];
      if (c.GH_prev !== p.GH_t) errors.push(`Epoch ${c.epoch}: GH_prev ≠ GH_t of epoch ${p.epoch}`);
      if (c.vk_prev !== p.vk_t)  errors.push(`Epoch ${c.epoch}: vk_prev ≠ vk_t of epoch ${p.epoch}`);
      if (c.epoch   !== p.epoch+1) errors.push(`Gap: epoch ${p.epoch} → ${c.epoch}`);
    }
    // Registry gap check
    for (let i = 0; i < S.registry.length; i++) {
      if (S.registry[i].gapInjected) errors.push(`Registry gap injected at epoch ${S.registry[i].epoch}`);
      if (S.registry[i].epoch !== i+1) errors.push(`Registry gap at position ${i+1}`);
    }
    return { valid:errors.length===0, errors };
  }

  function avgVerifyTime() {
    if (!S.verifyTimes.length) return null;
    return (S.verifyTimes.reduce((a,b)=>a+b,0)/S.verifyTimes.length).toFixed(2);
  }

  function setFaults(f)  { S.faults = { ...S.faults, ...f }; }
  function reset()       {
    S = { ready:false, inst:null, pred:null, tee:null, genesis:null, real_C_hash:null,
          chain:[], leaves:[], registry:[], verifyTimes:[],
          faults:{genesis:false,timestamp:false,circuit:false,epochSkip:false,fakeProof:false,dmsAbort:false,tamperHash:false} };
  }
  function getChain()    { return S.chain; }
  function getLeaves()   { return S.leaves; }
  function getGenesis()  { return S.genesis; }
  function getRegistry() { return S.registry; }
  function isReady()     { return S.ready; }
  function chainLength() { return S.chain.length; }

  return { init, runEpoch, verify, verifyChain, setFaults, reset,
           getChain, getLeaves, getGenesis, getRegistry, isReady, chainLength,
           avgVerifyTime, INST, PRED, TEE:TEE_MAP };
})();

// ── SESSION FACTORY — Independent instances for Multi-Institution Simulation ──
function createSession(instKey, predKey, teeKey) {
  const INST_MAP = {
    bank:     { id:'BANK_001',     name:'Global Investment Bank',  abbr:'GIB',  color:'#4d9fff' },
    exchange: { id:'EXCHANGE_002', name:'Crypto Exchange Ltd.',    abbr:'CEX',  color:'#3dffa0' },
    fund:     { id:'FUND_003',     name:'Meridian Hedge Fund',     abbr:'MHF',  color:'#a87eff' },
    insurer:  { id:'INSURE_004',   name:'Pacific Insurance Co.',   abbr:'PIC',  color:'#ffaa4d' },
  };
  const PRED_MAP = {
    solvency:  { id:'PRED_SOLVENCY', name:'Basel III Solvency ≥ 8%', circuit:'CIRCUIT_SOL_V2' },
    liquidity: { id:'PRED_LCR',      name:'LCR ≥ 100%',              circuit:'CIRCUIT_LCR_V1' },
    sanctions: { id:'PRED_AML',      name:'AML Sanctions Screening',  circuit:'CIRCUIT_AML_V3' },
    var:       { id:'PRED_VAR',      name:'VaR Limit Compliance',     circuit:'CIRCUIT_VAR_V1' },
  };
  const TEE_LIST = { sgx:'Intel SGX', sev:'AMD SEV', tz:'ARM TrustZone' };

  const instData = { ...INST_MAP[instKey] };
  const predData = PRED_MAP[predKey];
  const teeType  = TEE_LIST[teeKey] || 'Intel SGX';
  const REG      = { id:'REG_CENTRAL_AUTHORITY', name:'Central Compliance Authority' };

  instData.mrenclave = CRYPTO.H('MRENCLAVE_V1', instData.id, predData.circuit);
  const real_C_hash  = CRYPTO.H('CIRCUIT_BYTES_V1', predData.circuit, instData.id);
  const gen          = CRYPTO.genesis(instData, REG, predData);

  let chain = [], leaves = [];
  let vk_prev = gen.vk_0, GH_prev = gen.GH_0, epochNum = 0;

  return {
    key: instKey, inst: instData, pred: predData, teeType,
    color: INST_MAP[instKey].color, abbr: INST_MAP[instKey].abbr,
    genesis: gen, real_C_hash,
    getChain:    () => chain,
    getLeaves:   () => leaves,
    chainLength: () => chain.length,

    runEpoch(faulted = false, faultType = 'circuit') {
      epochNum++;
      const oracle = CRYPTO.timeOracle(epochNum);
      const nonce  = CRYPTO.rnd(32);

      const tau = (faulted && faultType === 'timestamp')
        ? CRYPTO.H('BACKDATED', String(epochNum - 10), 'OLD_NIST') : oracle.tau;
      const C_hash = (faulted && faultType === 'circuit')
        ? CRYPTO.H('SUBST_CIRCUIT', CRYPTO.rnd(4), 'ATTACKER_CIRCUIT') : real_C_hash;
      const mrenc_used = (faulted && faultType === 'fakeProof')
        ? CRYPTO.H('SPOOFED_MRENCLAVE', CRYPTO.rnd(8)) : instData.mrenclave;

      const A_t  = CRYPTO.attest({ MRENCLAVE:mrenc_used, C_hash, policy:predData, tau, nonce, epoch:epochNum, tee_type:teeType });
      const pi_t = CRYPTO.zkprove({ x_t:CRYPTO.rnd(32), w_t:CRYPTO.rnd(32), C_hash, policy:predData, epoch:epochNum });
      const vk_t = CRYPTO.agkd(vk_prev, A_t, predData);
      const GH_t = CRYPTO.graphHash(GH_prev, A_t, pi_t, vk_t);
      const dms_t = CRYPTO.dms(GH_t, Date.now() + 30*24*3600*1000);
      const { rec:silRec, proof:silProof } = CRYPTO.silenceMachine({ k:12, violationAt:0 });
      const leaf = CRYPTO.H(GH_t, String(epochNum), vk_t, A_t.quote);

      const cbOk  = A_t.C_hash === real_C_hash;
      const tauOk = A_t.tau === oracle.tau;
      const valid = cbOk && tauOk && !faulted;
      const faultLog = [];
      if (!cbOk)  faultLog.push('CIRCUIT_SUBSTITUTION: A_t.C_hash ≠ real_C_hash — F4 FAILED');
      if (!tauOk) faultLog.push('TIMESTAMP_FAULT: A_t.tau ≠ oracle.tau — F3 FAILED');
      if (faulted && faultType === 'fakeProof') faultLog.push('FAKE_ATTESTATION: MRENCLAVE spoofed — F1/F4 FAILED');
      if (faulted && faultType === 'genesis') faultLog.push('GENESIS_FRAUD: vk_0 not regulator-cosigned — F2a FAILED');

      const bundle = {
        epoch:epochNum, vk_t, vk_prev, GH_t, GH_prev, A_t, pi_t,
        dms:dms_t, oracle, real_C_hash, valid, faulted, faultType:faulted?faultType:null, faultLog,
        silence:{ rec:silRec, proof:silProof },
        manifest:{ epoch:epochNum, institution:instData.id, institution_name:instData.name,
          predicate:predData.id, tee_type:teeType, timestamp:A_t.timestamp,
          oracle:{ nist_round:oracle.nist_round, btc_block:oracle.btc_block, tau },
          chain_depth:epochNum },
        leaf,
      };
      chain.push(bundle);
      leaves.push(leaf);
      vk_prev = vk_t; GH_prev = GH_t;
      return bundle;
    },

    reset() {
      chain = []; leaves = [];
      vk_prev = gen.vk_0; GH_prev = gen.GH_0; epochNum = 0;
    }
  };
}
