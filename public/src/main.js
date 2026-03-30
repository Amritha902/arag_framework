// ══ ARAG v5 · Main Application — All Features ══

// ── MECHANISM DEFINITIONS ─────────────────────────────────────────
const MECHS = [
  { id:'F1',  grp:'GROUP A · TRUST INITIALIZATION', title:'Base ARAG Architecture',
    desc:'TEE enclave processes encrypted compliance data, generates a ZKP, produces hardware attestation, derives key via AGKD, computes recursive graph hash, packages into O(1)-verifiable Portable Proof Bundle.',
    formula:'GH_t = H(GH_{t-1} ‖ A_t ‖ π_t ‖ vk_t)', badge:'Core Architecture' },
  { id:'F2a', grp:'GROUP A · TRUST INITIALIZATION', title:'Regulator-Witnessed Genesis',
    desc:'Genesis is a bilateral cryptographic commitment between institution TEE and regulator signing key. Closes the Fraudulent Genesis Attack — no chain can start without regulator co-signature.',
    formula:'vk_0 = H(TEE_pub ‖ REG_pub ‖ policy_hash ‖ nonce_reg)', badge:'Novel · No Prior Art' },
  { id:'F2b', grp:'GROUP A · TRUST INITIALIZATION', title:'Regulator-Anchored Epoch Registry',
    desc:'Append-only regulator-side registry. Any missing epoch number is cryptographic proof of deletion — gap detection without full chain traversal.',
    formula:'Registry[t] = H(GH_t ‖ epoch_num ‖ timestamp_t)', badge:'Novel · Gap Detection' },
  { id:'F3',  grp:'GROUP B · TEMPORAL INTEGRITY', title:'Verifiable Time Oracle Anchoring',
    desc:'NIST Randomness Beacon + Bitcoin block hash anchored into every attestation. Prevents backdating, proof stockpiling, and timestamp rollback attacks.',
    formula:'τ_t = NIST_Beacon(round_r) ‖ BTC_blockhash(block_b)', badge:'Novel · Anti-Backdating' },
  { id:'F4',  grp:'GROUP C · EXECUTION AUTHENTICITY', title:'Circuit-Level Attestation H(circuit)',
    desc:'C_hash=H(circuit_bytecode) closes the gap between MRENCLAVE and runtime circuit. Binds the actual compliance logic into the attestation quote — not just enclave identity.',
    formula:'A_t = Attest(MRENCLAVE ‖ C_hash ‖ Policy_t ‖ τ_t ‖ nonce_t)', badge:'Novel · Circuit Binding' },
  { id:'F5',  grp:'GROUP C · EXECUTION AUTHENTICITY', title:'Blind Policy Execution',
    desc:'The compliance circuit is regulator-encrypted. The institution proves correct execution of a circuit they cannot read — semantic integrity without knowledge transfer.',
    formula:'C_enc = Enc(circuit, k_reg) · TEE unseals k_reg internally', badge:'Novel · Semantic Integrity' },
  { id:'F6',  grp:'GROUP D · CONTINUOUS COMPLIANCE', title:"Dead Man's Switch",
    desc:"Each epoch seals a forward commitment to the next epoch's TRNG nonce. If TEE is forced down, the nonce is destroyed — converting forced silence into cryptographic evidence.",
    formula:'Com_t = H(nonce_{t+1} ‖ sched_{t+1} ‖ GH_t)', badge:'Novel · Liveness Attestation' },
  { id:'F8',  grp:'GROUP D · CONTINUOUS COMPLIANCE', title:'Proof-of-Silence (Absence Attestation)',
    desc:'★ Most novel. ARAG proves a compliance violation did NOT occur across the full epoch window. No prior art system can prove absence of events over a time range.',
    formula:'State_k == COMPLIANT AND k == Δt/δ AND all sub-results TRUE', badge:'★ Most Novel — Zero Prior Art' },
];

// ── APP STATE ─────────────────────────────────────────────────────
let sessionInitialized = false;
let curBundle          = null;
let activeFaults       = { genesis:false,timestamp:false,circuit:false,epochSkip:false,fakeProof:false,dmsAbort:false,tamperHash:false };
let stepModeEnabled    = false;
let _stepResolve       = null;
let multiRunning       = false;
let autoDemoRunning    = false;
let autoDemoStop       = false;
let multiSessionList   = [];
let multiUnifiedLog    = [];
let replayIdx          = 0;
let chartData          = { epochs:[],times:[],pass:[] };

// ── BOOT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderMechs();
  initHeroCanvas();
  initNavHL();
  onSilChange();
  renderMerkle(demoLeaves(), 2, 4, 0);
});

// ── UTILS ─────────────────────────────────────────────────────────
function setTEE(on, label) {
  const dot=document.getElementById('stDot'), lbl=document.getElementById('stLbl');
  if(!dot||!lbl) return;
  if(on){dot.className='st-dot on';lbl.textContent=label||'TEE ACTIVE';lbl.style.color='var(--green)';}
  else  {dot.className='st-dot';  lbl.textContent='TEE OFFLINE';lbl.style.color='';}
}
function tlog(msg,cls='tl-info'){
  const b=document.getElementById('termBody'); if(!b) return;
  const d=document.createElement('div'); d.className=`tl ${cls}`; d.textContent=msg;
  b.appendChild(d); b.scrollTop=b.scrollHeight;
}
function tsec(msg){tlog('','');tlog('── '+msg+' ──','tl-sec');}
function tclear(){const b=document.getElementById('termBody');if(b)b.innerHTML='';}
function setText(id,v){const el=document.getElementById(id);if(el)el.textContent=v??'—';}
function goto(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function updateThresholdLabel(){
  const v=document.getElementById('sldThreshold')?.value||8;
  setText('thresholdLbl',`Threshold: ${v}%`);
}

// ── MECHANISM CARDS ───────────────────────────────────────────────
function renderMechs(){
  const g=document.getElementById('mechGrid'); if(!g) return;
  g.innerHTML=MECHS.map(m=>`
    <div class="mech-card">
      <div class="mc-id">${m.id}</div>
      <div class="mc-grp">${m.grp}</div>
      <div class="mc-title">${m.title}</div>
      <div class="mc-desc">${m.desc}</div>
      <div class="mc-formula">${m.formula}</div>
      <div class="mc-badge">${m.badge}</div>
    </div>`).join('');
}

// ── STEP MODE ─────────────────────────────────────────────────────
function toggleStepMode(){
  stepModeEnabled=document.getElementById('stepModeChk')?.checked||false;
  const ctrl=document.getElementById('stepCtrl');
  if(ctrl) ctrl.style.display=stepModeEnabled?'block':'none';
  if(!stepModeEnabled&&_stepResolve){_stepResolve();_stepResolve=null;}
}
function setStepLabel(msg,waiting){
  const el=document.getElementById('stepCurLabel'); if(!el) return;
  el.textContent=msg; el.className='step-cur'+(waiting?' waiting':'');
}
async function waitForStep(label){
  if(!stepModeEnabled) return;
  tlog(`  ⏸ PAUSED: ${label}`,'tl-step-pause');
  setStepLabel(label,true);
  await new Promise(r=>{_stepResolve=r;});
  setStepLabel(`✓ ${label}`,false);
}
function advanceStep(){if(_stepResolve){_stepResolve();_stepResolve=null;}}

// ── FAULT TOGGLES ─────────────────────────────────────────────────
function onFaultToggle(){
  activeFaults={
    genesis:   document.getElementById('fltGenesis')?.checked||false,
    timestamp: document.getElementById('fltTimestamp')?.checked||false,
    circuit:   document.getElementById('fltCircuit')?.checked||false,
    epochSkip: document.getElementById('fltEpochSkip')?.checked||false,
    fakeProof: document.getElementById('fltFakeProof')?.checked||false,
    dmsAbort:  document.getElementById('fltDMS')?.checked||false,
    tamperHash:document.getElementById('fltTamperHash')?.checked||false,
  };
  [['fltGenesis','atkGenesisCrd','atkGenesisSt'],['fltTimestamp','atkTimestampCrd','atkTimestampSt'],
   ['fltCircuit','atkCircuitCrd','atkCircuitSt'],['fltEpochSkip','atkEpochSkipCrd','atkEpochSkipSt'],
   ['fltFakeProof','atkFakeProofCrd','atkFakeProofSt'],['fltDMS','atkDMSCrd','atkDMSSt'],
   ['fltTamperHash','atkTamperHashCrd','atkTamperHashSt']
  ].forEach(([chk,crd,st])=>{
    const checked=document.getElementById(chk)?.checked;
    const card=document.getElementById(crd),stEl=document.getElementById(st);
    if(card) card.className='atk-card'+(checked?' active':'');
    if(stEl){stEl.textContent=checked?'⚡ ARMED — Generate epoch to trigger':'INACTIVE';
             stEl.className='atk-status'+(checked?' active-st':'');}
  });
  ENGINE.setFaults(activeFaults);
  if(!Object.values(activeFaults).some(Boolean)){
    const p=document.getElementById('atkResult');
    if(p) p.innerHTML='<div class="ar-hdr">⚡ Attack Detection Output</div><div class="ar-ph">Toggle an attack above, then click Generate Epoch.<br/><br/>Output shows:<br/>• Invalid at epoch N — Reason: exact field mismatch<br/>• Expected vs actual values<br/>• Which patent claim is validated</div>';
  }
}

// ── EPOCH GENERATION (with Step Mode + Fault Logging) ─────────────
async function runEpoch(silent){
  const btn=document.getElementById('runBtn');
  if(!silent){btn.disabled=true;btn.textContent='⏳  Running…';}
  const instKey=document.getElementById('selInst').value;
  const predKey=document.getElementById('selPred').value;
  const teeKey =document.getElementById('selTEE').value;
  const k      =parseInt(document.getElementById('selEpochSize')?.value||24);
  ENGINE.setFaults(activeFaults);
  tclear();
  const anyFault=Object.values(activeFaults).some(Boolean);

  if(!sessionInitialized){
    tsec('STEP 1 — GENESIS PROTOCOL (F2a)');
    tlog(`Institution: ${ENGINE.INST[instKey]?.name}`,'tl-info');
    tlog(`Predicate  : ${ENGINE.PRED[predKey]?.name}`,'tl-info');
    tlog(`TEE        : ${ENGINE.TEE[teeKey]}`,'tl-info');
    if(anyFault) tlog('⚠ FAULT INJECTION ACTIVE','tl-warn');
    setTEE(true,'TEE INITIALIZING');
    await waitForStep('Regulator co-signing genesis state (F2a)');
    await wait(silent?0:160);
    const gen=ENGINE.init(instKey,predKey,teeKey);
    sessionInitialized=true;
    tlog('► TEE enclave loaded & MRENCLAVE measured','tl-step'); await wait(silent?0:100);
    tlog('► Regulator co-signing genesis (F2a)…','tl-step');     await wait(silent?0:160);
    tlog(`  vk_0         = ${CRYPTO.short(gen.vk_0,28)}`,'tl-key');
    tlog(`  GH_0         = ${CRYPTO.short(gen.GH_0,28)}`,'tl-key');
    tlog(`  genesis_cert = ${CRYPTO.short(gen.genesis_cert,28)}`,'tl-hash');
    tlog('✓ Genesis established — regulator-witnessed (F2a)','tl-ok');
  } else {
    tsec(`EPOCH ${ENGINE.chainLength()+1} — GENERATION`);
    tlog(`Chain depth: ${ENGINE.chainLength()} | Attacks: ${anyFault?Object.entries(activeFaults).filter(([,v])=>v).map(([k])=>k).join(', '):'none'}`,'tl-info');
    setTEE(true,`TEE ACTIVE · Epoch ${ENGINE.chainLength()+1}`);
  }

  await wait(silent?0:40);
  tsec('STEP 2 — TIME ORACLE (F3)');
  const oracle=CRYPTO.timeOracle(ENGINE.chainLength()+1);
  await waitForStep('Time Oracle: NIST Beacon + Bitcoin block hash');
  tlog('► Fetching NIST Randomness Beacon…','tl-step'); await wait(silent?0:120);
  tlog(`  nist_round = ${oracle.nist_round}`,'tl-val');
  tlog(`  nist_out   = ${CRYPTO.short(oracle.nist_output,24)}`,'tl-hash');
  tlog('► Fetching Bitcoin block hash…','tl-step'); await wait(silent?0:100);
  tlog(`  btc_block  = #${oracle.btc_block}`,'tl-val');
  tlog(`  btc_hash   = ${CRYPTO.short(oracle.btc_hash,24)}`,'tl-hash');
  tlog(`  τ_t        = ${CRYPTO.short(oracle.tau,24)}`,'tl-hash');
  if(activeFaults.timestamp) tlog('  ⚠ ATTACK: Backdated τ_t — NIST mismatch will be detected!','tl-err');

  await wait(silent?0:40);
  tsec('STEP 3 — CIRCUIT ATTESTATION (F4+F5)');
  await waitForStep('Circuit hash binding + Blind policy decryption');
  tlog('► Computing H(circuit_bytecode) inside TEE (F4)…','tl-step'); await wait(silent?0:140);
  if(activeFaults.circuit) tlog('  ⚠ ATTACK: Runtime circuit substituted! C_hash will mismatch!','tl-err');
  tlog('► Blind policy: decrypting C_enc with k_reg (F5)…','tl-step'); await wait(silent?0:100);
  tlog('✓ C_hash = H(circuit_bytecode) bound into attestation','tl-ok');

  await wait(silent?0:40);
  tsec('STEP 4 — TEE ATTESTATION QUOTE (F1)');
  setTEE(true,'TEE ATTESTING');
  await waitForStep('Hardware attestation generation');
  if(activeFaults.fakeProof) tlog("  ⚠ ATTACK: Spoofed MRENCLAVE injected!",'tl-err');
  tlog('► Generating hardware attestation quote A_t…','tl-step'); await wait(silent?0:180);
  tlog('  Binds: MRENCLAVE ‖ C_hash ‖ Policy ‖ τ_t ‖ nonce_t','tl-val');

  await wait(silent?0:40);
  tsec('STEP 5 — ZKP PROOF ENGINE (Groth16)');
  setTEE(true,'ZKP PROVING');
  await waitForStep('Zero-Knowledge Proof generation');
  tlog('► Running compliance circuit on encrypted inputs…','tl-step'); await wait(silent?0:180);
  tlog('► Generating Groth16 ZKP π_t (192 bytes)…','tl-step');         await wait(silent?0:220);
  tlog(`► Proof-of-Silence: evaluating ${k} sub-epochs (F8)…`,'tl-step'); await wait(silent?0:140);
  tlog(`  State_${k} = COMPLIANT — all sub-epochs passed ✓`,'tl-val');

  await wait(silent?0:40);
  tsec('STEP 6 — AGKD + RECURSIVE GRAPH HASH');
  setTEE(true,'AGKD RUNNING');
  await waitForStep('AGKD key derivation + graph hash');
  tlog('► vk_t = H(vk_{t-1} ‖ A_t.quote ‖ Policy_t) — AGKD','tl-step'); await wait(silent?0:120);
  tlog('► GH_t = H(GH_{t-1} ‖ A_t.quote ‖ π_t ‖ vk_t)','tl-step');      await wait(silent?0:120);
  if(activeFaults.dmsAbort) tlog("  ⚠ ATTACK: TEE forced shutdown — DMS nonce destroyed!",'tl-err');
  else tlog("► Sealing Dead Man's Switch nonce for next epoch (F6)…",'tl-step');
  await wait(silent?0:80);

  const bundle=ENGINE.runEpoch(k);
  curBundle=bundle;
  tlog(`  π_t  = ${CRYPTO.short(bundle.pi_t.proof_a,30)}`,'tl-hash');
  tlog(`  A_t  = ${CRYPTO.short(bundle.A_t.quote,30)}`,'tl-hash');
  tlog(`  vk_t = ${CRYPTO.short(bundle.vk_t,30)}`,'tl-key');
  tlog(`  GH_t = ${CRYPTO.short(bundle.GH_t,30)}`,'tl-hash');
  tlog(`  DMS  = ${CRYPTO.short(bundle.dms.commitment,30)}`,'tl-hash');

  await wait(silent?0:40);
  tsec('STEP 7 — PORTABLE PROOF BUNDLE + REGISTRY (F2b)');
  await waitForStep('Bundle packaging + registry commit');
  tlog('► Packaging B_t = { π_t, A_t, vk_t, GH_t, manifest_t }','tl-step'); await wait(silent?0:80);
  if(activeFaults.epochSkip) tlog('  ⚠ ATTACK: Epoch GAP injected in registry!','tl-err');
  else tlog(`► Regulator registry commit pushed (epoch ${bundle.epoch})`,'tl-step');
  tlog(`  Registry depth = ${ENGINE.getRegistry().length} epochs`,'tl-val');

  if(bundle.verification.valid){
    tlog(`✓ EPOCH ${bundle.epoch} COMPLETE — chain: ${ENGINE.chainLength()}`,'tl-ok');
  } else {
    bundle.verification.faultLog.forEach(f=>tlog('✗ '+f,'tl-err'));
    tlog(`✗ EPOCH ${bundle.epoch} — ${bundle.verification.faultLog.length} ATTACK(S) DETECTED`,'tl-err');
  }

  setText('termEpochCtr',`Epoch ${bundle.epoch} / chain: ${ENGINE.chainLength()}`);
  setTEE(true,`TEE ACTIVE · Chain: ${ENGINE.chainLength()}`);
  setStepLabel('Epoch complete',false);

  renderBundleCard(bundle);
  renderChain();
  renderComplianceTimeline();
  updateDashboard(bundle);
  renderAttackResult(bundle);
  updateReplayState();
  updateChart(bundle);
  onMrkChange();

  if(!silent){btn.disabled=false;btn.innerHTML='▶ &nbsp;Generate Epoch';}
}

// ── MULTI-RUN ─────────────────────────────────────────────────────
async function runMulti(n){
  if(multiRunning) return;
  multiRunning=true;
  const ids=['mBtn3','mBtn5','mBtn10'];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=true;});
  const runBtn=document.getElementById('runBtn');
  if(runBtn) runBtn.disabled=true;
  for(let i=1;i<=n;i++){
    setText('multiProg',`Running ${i}/${n}…`);
    const bar=document.getElementById('progBar');
    if(bar) bar.style.width=`${(i-1)/n*100}%`;
    await runEpoch(true);
    await wait(60);
  }
  const bar=document.getElementById('progBar');
  if(bar){bar.style.width='100%';await wait(400);bar.style.width='0%';}
  setText('multiProg',`✓ ${n} epochs done`);
  await wait(800); setText('multiProg','');
  if(runBtn){runBtn.disabled=false;runBtn.innerHTML='▶ &nbsp;Generate Epoch';}
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=false;});
  multiRunning=false;
}

// ── AUTO DEMO ─────────────────────────────────────────────────────
const AUTO_STEPS=[
  {label:'Init: Global Investment Bank — Basel III Solvency / Intel SGX', action:async()=>{
    document.getElementById('selInst').value='bank';
    document.getElementById('selPred').value='solvency';
    document.getElementById('selTEE').value='sgx';
  }},
  {label:'Epoch 1 — Genesis + First ZKP compliance proof',       action:async()=>{await runEpoch(true);}},
  {label:'Epoch 2 — Chain advancing (GH_t, vk_t chaining)',      action:async()=>{await runEpoch(true);}},
  {label:'Epoch 3 — Third clean epoch. Chain integrity: VALID',  action:async()=>{await runEpoch(true);}},
  {label:'⚡ ATTACK: Time Rollback (F3 bypass attempt)…',action:async()=>{
    document.getElementById('fltTimestamp').checked=true; onFaultToggle();
    goto('attacks'); await wait(500); await runEpoch(true);
  }},
  {label:'✓ Time Rollback BLOCKED. Clearing attack.',action:async()=>{
    document.getElementById('fltTimestamp').checked=false; onFaultToggle(); await wait(300);
  }},
  {label:'⚡ ATTACK: Circuit Substitution (F4 bypass)…',action:async()=>{
    document.getElementById('fltCircuit').checked=true; onFaultToggle(); await runEpoch(true);
  }},
  {label:'✓ Circuit Substitution BLOCKED. C_hash mismatch caught.',action:async()=>{
    document.getElementById('fltCircuit').checked=false; onFaultToggle(); await wait(300);
  }},
  {label:'⚡ ATTACK: Fake Attestation (spoofed MRENCLAVE)…',action:async()=>{
    document.getElementById('fltFakeProof').checked=true; onFaultToggle(); await runEpoch(true);
  }},
  {label:'✓ Fake Attestation BLOCKED. Recovering with clean epoch.',action:async()=>{
    document.getElementById('fltFakeProof').checked=false; onFaultToggle();
    await wait(300); goto('chain'); await wait(400); await runEpoch(true);
  }},
];

async function startAutoDemo(){
  if(autoDemoRunning) return;
  autoDemoStop=false; autoDemoRunning=true;
  resetAll(); await wait(200);
  const overlay=document.getElementById('autoOverlay');
  if(overlay) overlay.style.display='block';
  goto('demo');
  for(let i=0;i<AUTO_STEPS.length;i++){
    if(autoDemoStop) break;
    const step=AUTO_STEPS[i];
    setText('aoStep',step.label);
    setText('aoProg',`Step ${i+1} / ${AUTO_STEPS.length}`);
    const fill=document.getElementById('aoBarFill');
    if(fill) fill.style.width=`${(i/AUTO_STEPS.length)*100}%`;
    tlog(`[AUTO] ${step.label}`,'tl-auto');
    await step.action(); await wait(600);
  }
  const fill=document.getElementById('aoBarFill');
  if(fill) fill.style.width='100%';
  setText('aoStep','✓ Auto Demo Complete! All 3 attacks detected and blocked.');
  await wait(2500);
  if(overlay) overlay.style.display='none';
  autoDemoRunning=false;
}
function stopAutoDemo(){
  autoDemoStop=true; autoDemoRunning=false;
  const overlay=document.getElementById('autoOverlay');
  if(overlay) overlay.style.display='none';
}

// ── DASHBOARD ─────────────────────────────────────────────────────
function updateDashboard(bundle){
  const chain=ENGINE.getChain();
  const compliant=chain.filter(b=>b.verification.valid).length;
  const violations=chain.length-compliant;
  setText('dTotalEpochs',chain.length);
  setText('dCompliant',compliant);
  setText('dViolations',violations);
  const cs=document.getElementById('dCompStatus');
  if(cs) cs.innerHTML=!chain.length?'<span class="ds-dot"></span>NO DATA'
    :violations===0?'<span class="ds-dot green"></span>ALL COMPLIANT'
    :`<span class="ds-dot red"></span>WARNING: ${violations} VIOLATION(S)`;
  const integrity=ENGINE.verifyChain();
  setText('dChainStatus',integrity.valid?'✓ VALID':'✗ BROKEN');
  const cse=document.getElementById('dChainStatus');
  if(cse) cse.style.color=integrity.valid?'var(--green)':'var(--red)';
  setText('dLastVerified',`Epoch ${bundle.epoch}`);
  setText('dLatestGH',CRYPTO.short(bundle.GH_t,14));
  const ist=document.getElementById('dIntegrityStatus');
  if(ist) ist.innerHTML=integrity.valid
    ?'<span class="ds-dot green"></span>CHAIN VALID — all links verified'
    :`<span class="ds-dot red"></span>BROKEN: ${integrity.errors[0]}`;
  setText('dAvgVerify',ENGINE.avgVerifyTime()?`${ENGINE.avgVerifyTime()} ms`:'—');
  setText('dNistRound',bundle.oracle?.nist_round);
  setText('dBtcBlock',`#${bundle.oracle?.btc_block}`);
  setText('dTau',CRYPTO.short(bundle.oracle?.tau,12));
  const ast=document.getElementById('dAnchorStatus');
  if(ast) ast.innerHTML=bundle.faults_injected?.timestamp
    ?'<span class="ds-dot red"></span>BACKDATING DETECTED'
    :'<span class="ds-dot green"></span>ANCHORED (NIST + BTC)';
  updateRegistryTable();
}
function updateRegistryTable(){
  const tbody=document.getElementById('regTbody'); if(!tbody) return;
  const reg=ENGINE.getRegistry();
  if(!reg.length){tbody.innerHTML='<tr><td colspan="6" class="reg-empty">No epochs registered</td></tr>';return;}
  tbody.innerHTML=reg.map(r=>`
    <tr>
      <td style="font-weight:700;color:var(--blue)">${r.epoch}</td>
      <td>${r.institution||'—'}</td>
      <td class="${r.valid?'reg-st-ok':'reg-st-bad'}">${r.gapInjected?'⚠ GAP':r.valid?'✓ COMPLIANT':'✗ VIOLATION'}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--cyan)">${r.GH_t==='—'?'—':CRYPTO.short(r.GH_t,14)}</td>
      <td style="font-family:var(--mono);font-size:9px">${new Date(r.timestamp).toISOString().slice(11,19)}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--red)">${r.gapInjected?'⚠ REGISTRY GAP':!r.valid?'⚡ DETECTED':'—'}</td>
    </tr>`).join('');
}

// ── COMPLIANCE TIMELINE ───────────────────────────────────────────
function renderComplianceTimeline(){
  const chain=ENGINE.getChain();
  const blocks=document.getElementById('tlBlocks');
  const status=document.getElementById('tlStatus');
  const winLbl=document.getElementById('tlWindowLbl');
  if(!blocks||!status) return;
  const WINDOW=10;
  const visible=chain.slice(-WINDOW);
  if(!visible.length){
    blocks.innerHTML='<span style="font-family:var(--mono);font-size:10px;color:var(--txt3)">Generate epochs to see timeline</span>';
    status.className='tl-status-row empty'; status.textContent='NO CHAIN DATA'; return;
  }
  if(winLbl) winLbl.textContent=`Window: t-${visible.length} to t  (Epochs ${chain.length-visible.length+1}–${chain.length})`;
  blocks.innerHTML=visible.map((b,i)=>{
    const ok=b.verification.valid;
    const label=i===visible.length-1?'t':`t-${visible.length-1-i}`;
    return `<div class="tl-block" title="Epoch ${b.epoch}: ${ok?'COMPLIANT':'VIOLATION'}">
      <div class="tl-block-inner ${ok?'ok':'fail'}">${ok?'✓':'✗'}</div>
      <div class="tl-block-lbl">${label}</div>
      <div class="tl-block-lbl" style="color:${ok?'var(--green)':'var(--red)'};font-size:6px">E${b.epoch}</div>
    </div>`;
  }).join('');
  const viols=visible.filter(b=>!b.verification.valid);
  status.className=`tl-status-row ${viols.length===0?'ok':'warn'}`;
  if(!viols.length){
    status.textContent=`✓ FULLY COMPLIANT — All ${visible.length} epochs in window passed`;
  } else {
    status.textContent=`⚠ ${viols.length} violation(s): ${viols.map(b=>`Epoch ${b.epoch}`).join(', ')}`;
  }
}

// ── ATTACK RESULT (FULL FAILURE TRACE) ───────────────────────────
function renderAttackResult(bundle){
  const panel=document.getElementById('atkResult'); if(!panel) return;
  const anyActive=Object.values(bundle.faults_injected).some(Boolean);
  if(!anyActive){
    panel.innerHTML=`<div class="ar-hdr">⚡ Attack Detection Output</div>
      <div class="ar-ph" style="color:var(--green)">✓ No attacks active — all mechanisms passed cleanly.<br/><br/>Toggle an attack and generate an epoch to test.</div>`;
    return;
  }
  const verRes=ENGINE.verify(bundle);
  const failed=verRes.checks.filter(c=>!c.pass);
  const passed=verRes.checks.filter(c=>c.pass);
  const atkNames=[];
  if(bundle.faults_injected.genesis)   atkNames.push('Fraudulent Genesis');
  if(bundle.faults_injected.timestamp) atkNames.push('Time Rollback');
  if(bundle.faults_injected.circuit)   atkNames.push('Circuit Substitution');
  if(bundle.faults_injected.epochSkip) atkNames.push('Registry Gap / Missing Epoch');
  if(bundle.faults_injected.fakeProof) atkNames.push('Fake Attestation');
  if(bundle.faults_injected.dmsAbort)  atkNames.push("Dead Man's Switch Abort");
  if(bundle.faults_injected.tamperHash)atkNames.push('Tamper Previous Hash (GH_prev)');

  panel.innerHTML=`
    <div class="ar-hdr">⚡ Attack Detection Output</div>
    <div class="atk-detail">
      <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:${verRes.valid?'var(--red)':'var(--green)'}">
        ${verRes.valid?'⚠ SYSTEM COMPROMISED':` ✗ INVALID at Epoch ${bundle.epoch}`}
      </div>
      <div style="padding:7px 11px;border-radius:5px;font-family:var(--mono);font-size:11px;font-weight:700;
           background:${verRes.valid?'rgba(255,77,109,.07)':'rgba(61,255,160,.07)'};
           color:${verRes.valid?'var(--red)':'var(--green)'};
           border:1px solid ${verRes.valid?'rgba(255,77,109,.2)':'rgba(61,255,160,.2)'}">
        ${verRes.valid?'⚠ ATTACK WAS NOT DETECTED':'✓ ATTACKS BLOCKED — Detected by ARAG mechanisms'}
      </div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--red);font-weight:600">
        ⚡ ACTIVE: ${atkNames.join(' + ')}
      </div>
      <div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:5px;padding:10px 12px">
        <div style="font-family:var(--mono);font-size:8px;letter-spacing:1px;color:var(--txt3);margin-bottom:8px">
          FAILURE TRACE — ${failed.length} failed, ${passed.length} passed · ${verRes.elapsed_ms}ms
        </div>
        ${failed.map(c=>renderCheckRow(c,bundle,false)).join('')}
        ${passed.slice(0,4).map(c=>renderCheckRow(c,bundle,true)).join('')}
        ${passed.length>4?`<div style="font-family:var(--mono);font-size:8px;color:var(--txt3)">… and ${passed.length-4} more passed</div>`:''}
      </div>
      ${buildExplainBox(bundle)}
    </div>`;
}

function renderCheckRow(c,bundle,passed){
  const detail=passed?'':buildCheckDetail(c,bundle);
  return `<div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:6px">
    <div style="font-family:var(--mono);font-size:10px;font-weight:700;flex-shrink:0;color:${passed?'var(--txt3)':'var(--red)'}">
      ${passed?'✓':'✗'}
    </div>
    <div>
      <div style="font-family:var(--mono);font-size:9px;font-weight:600;color:${passed?'var(--txt3)':'var(--txt2)'}">
        ${c.label}
      </div>
      ${!passed&&c.detail?`<div style="font-family:var(--mono);font-size:8px;color:var(--cyan);margin-top:2px">→ ${c.detail}</div>`:''}
      ${detail?`<div style="font-family:var(--mono);font-size:8px;line-height:1.7;margin-top:3px">${detail}</div>`:''}
    </div>
  </div>`;
}

function buildCheckDetail(c,bundle){
  const lbl=c.label.toLowerCase();
  if(lbl.includes('circuit')&&bundle.faults_injected?.circuit){
    return `<span style="color:var(--green)">Expected: ${CRYPTO.short(bundle.real_C_hash,20)}</span><br/>`+
           `<span style="color:var(--red)">     Got: ${CRYPTO.short(bundle.A_t?.C_hash,20)}</span>`;
  }
  if((lbl.includes('time')||lbl.includes('oracle'))&&bundle.faults_injected?.timestamp){
    return `<span style="color:var(--green)">Expected: τ = H(NIST_${bundle.oracle?.nist_round}‖BTC_${bundle.oracle?.btc_block})</span><br/>`+
           `<span style="color:var(--red)">     Got: τ = H(BACKDATED, epoch-10, OLD_NIST)</span>`;
  }
  if(lbl.includes('mrenclave')||lbl.includes('attestation')&&bundle.faults_injected?.fakeProof){
    return `<span style="color:var(--green)">Expected: MRENCLAVE in trusted hardware registry</span><br/>`+
           `<span style="color:var(--red)">     Got: ${CRYPTO.short(bundle.A_t?.MRENCLAVE,20)} (not in registry)</span>`;
  }
  return '';
}

function buildExplainBox(bundle){
  const f=bundle.faults_injected; let txt='';
  if(f.circuit)   txt='<b>What was tried:</b> Swap compliance circuit at runtime to a lax version.<br/><b>Why blocked:</b> C_hash=H(circuit_bytecode) is bound into A_t. Any circuit change produces a different C_hash — immediately detected.';
  else if(f.timestamp) txt='<b>What was tried:</b> Inject a backdated τ_t to replay a past-compliant state.<br/><b>Why blocked:</b> τ_t = H(NIST_Beacon‖BTC_blockhash). A backdated value cannot match the live NIST round — mismatch is proof of tampering.';
  else if(f.fakeProof) txt='<b>What was tried:</b> Submit a synthetic attestation with a spoofed MRENCLAVE.<br/><b>Why blocked:</b> MRENCLAVE is checked against the trusted enclave registry. A spoofed value is not in the registry.';
  else if(f.epochSkip) txt='<b>What was tried:</b> Skip an epoch in the registry to hide a non-compliant period.<br/><b>Why blocked:</b> The registry is append-only. A missing epoch number is itself cryptographic evidence of deletion.';
  else if(f.dmsAbort)  txt="<b>What was tried:</b> Force TEE shutdown to prevent next proof bundle.<br/><b>Why blocked:</b> Each epoch seals nonce_{t+1} inside TEE. If aborted, the nonce is destroyed — Com_t becomes unprovable, which is detectable evidence.";
  else if(f.genesis)   txt='<b>What was tried:</b> Start a chain without the regulator co-signature on vk_0.<br/><b>Why blocked:</b> vk_0 = H(TEE_pub‖REG_pub‖policy_hash‖nonce_reg). Without REG_pub, the genesis is invalid.';
  if(!txt) return '';
  return `<div style="background:rgba(255,77,109,.05);border:1px solid rgba(255,77,109,.15);
    border-radius:5px;padding:9px 12px;font-size:10px;color:var(--txt2);line-height:1.8;margin-top:4px">
    ${txt}</div>`;
}

// ── BUNDLE CARD ───────────────────────────────────────────────────
function renderBundleCard(b){
  const card=document.getElementById('bundleCard');
  const fields=document.getElementById('bcFields');
  const epLbl=document.getElementById('bcEpLbl');
  const badge=document.getElementById('bcBadge');
  if(!card) return;
  card.style.display='block';
  epLbl.textContent=`Epoch ${b.epoch}  ·  Chain: ${ENGINE.chainLength()}`;
  const ok=b.verification.valid;
  badge.className='v-badge '+(ok?'ok':'fail');
  badge.textContent=ok?'✓ VERIFICATION PASS':'✗ VERIFICATION FAIL';
  const rows=[
    ['π_t',     CRYPTO.short(b.pi_t.proof_a,32),'g'],
    ['A_t',     CRYPTO.short(b.A_t.quote,32),''],
    ['vk_t',    CRYPTO.short(b.vk_t,32),''],
    ['GH_t',    CRYPTO.short(b.GH_t,32),''],
    ['GH_{t-1}',CRYPTO.short(b.GH_prev,32),''],
    ['DMS',     CRYPTO.short(b.dms.commitment,32),b.dms.aborted?'err':''],
    ['TEE',     b.A_t.tee_type+' · MR='+CRYPTO.short(b.A_t.MRENCLAVE,10),''],
    ['τ_t',     CRYPTO.short(b.oracle?.tau,28),''],
    ['F8',      `State_k=COMPLIANT, k=${b.silence?.rec?.k}`,b.silence?.proof?.valid?'g':'err'],
    ['ts',      new Date(b.A_t.timestamp).toISOString().replace('T',' ').slice(0,19),''],
  ];
  fields.innerHTML=rows.map(([k,v,c])=>`
    <div class="bc-row">
      <span class="bc-k">${k}</span>
      <span class="bc-v ${c}">${v}</span>
    </div>`).join('');
  updateChart(b);
}

// ── CHAIN VISUALIZATION ───────────────────────────────────────────
function renderChain(){
  const chain=ENGINE.getChain(), gen=ENGINE.getGenesis();
  const scroll=document.getElementById('chainScroll');
  const empty=document.getElementById('chainEmpty');
  const stats=document.getElementById('chainStats');
  const sdDiag=document.getElementById('stateDiagram');
  if(!scroll) return;
  scroll.innerHTML='';
  if(!chain.length){
    if(empty) empty.style.display='block';
    if(stats) stats.style.display='none';
    if(sdDiag) sdDiag.style.display='none';
    return;
  }
  if(empty) empty.style.display='none';
  if(stats) stats.style.display='grid';
  if(sdDiag) sdDiag.style.display='block';
  if(gen){scroll.appendChild(makeGenesisNode(gen));scroll.appendChild(makeArrow());}
  chain.forEach((b,i)=>{
    scroll.appendChild(makeEpochNode(b,i===chain.length-1));
    if(i<chain.length-1) scroll.appendChild(makeArrow());
  });
  const vkRow=document.getElementById('sdVkRow');
  const ghRow=document.getElementById('sdGhRow');
  if(vkRow&&ghRow&&gen){
    let vkH=`<div class="sd-node gen">vk₀=${CRYPTO.short(gen.vk_0,8)}</div>`;
    let ghH=`<div class="sd-node gen">GH₀=${CRYPTO.short(gen.GH_0,8)}</div>`;
    chain.forEach(b=>{
      const bc=b.verification.valid?'':' bad';
      vkH+=`<span class="sd-arr">→</span><div class="sd-node${bc}">vk${b.epoch}=${CRYPTO.short(b.vk_t,8)}</div>`;
      ghH+=`<span class="sd-arr">→</span><div class="sd-node${bc}">GH${b.epoch}=${CRYPTO.short(b.GH_t,8)}</div>`;
    });
    vkRow.innerHTML=vkH; ghRow.innerHTML=ghH;
  }
  const integrity=ENGINE.verifyChain();
  const ok=chain.filter(b=>b.verification.valid).length;
  const bad=chain.length-ok;
  const last=chain[chain.length-1];
  setText('stEpochs',chain.length); setText('stVerified',ok);
  setText('stFailed',bad); setText('stGH',CRYPTO.short(last.GH_t,10));
  const intEl=document.getElementById('chainIntegrity');
  if(intEl){
    intEl.style.display='block';
    intEl.className='chain-integrity-bar '+(integrity.valid?'ok':'bad');
    intEl.innerHTML=integrity.valid
      ?`✓ Chain integrity verified — all ${chain.length} epoch links cryptographically valid`
      :`✗ Chain integrity BROKEN — ${integrity.errors.join(' · ')}`;
  }
}
function makeGenesisNode(g){
  const d=document.createElement('div'); d.className='ep-node genesis';
  d.innerHTML=`<div class="ep-hdr"><span class="ep-num">GENESIS</span><span class="ep-st ok">REG-SIGNED</span></div>
    <div class="ep-body">
      <div class="ep-f"><span class="ef-l">VK₀</span><span class="ef-v">${CRYPTO.short(g.vk_0)}</span></div>
      <div class="ep-f"><span class="ef-l">GH₀</span><span class="ef-v">${CRYPTO.short(g.GH_0)}</span></div>
      <div class="ep-f"><span class="ef-l">CERT</span><span class="ef-v">${CRYPTO.short(g.genesis_cert)}</span></div>
    </div>`; return d;
}
function makeEpochNode(b,isLatest){
  const ok=b.verification.valid;
  const d=document.createElement('div');
  d.className=`ep-node${isLatest?' latest':''}${!ok?' bad':''}`;
  d.title='Click to inspect & load into verifier';
  d.onclick=()=>loadBundleIntoVerifier(b);
  d.innerHTML=`<div class="ep-hdr">
    <span class="ep-num">Epoch ${b.epoch}</span>
    <span class="ep-st ${ok?'ok':'bad'}">${ok?'✓ PASS':`✗ ${b.verification.faultLog.length}F`}</span>
  </div>
  <div class="ep-body">
    <div class="ep-f"><span class="ef-l">π_t</span><span class="ef-v">${CRYPTO.short(b.pi_t.proof_a)}</span></div>
    <div class="ep-f"><span class="ef-l">A_t</span><span class="ef-v">${CRYPTO.short(b.A_t.quote)}</span></div>
    <div class="ep-f"><span class="ef-l">vk_t</span><span class="ef-v">${CRYPTO.short(b.vk_t)}</span></div>
    <div class="ep-f"><span class="ef-l">GH_t</span><span class="ef-v">${CRYPTO.short(b.GH_t)}</span></div>
    ${!ok?`<div style="font-family:var(--mono);font-size:7px;color:var(--red);margin-top:3px">⚡ ATTACK DETECTED</div>`:''}
  </div>`; return d;
}
function makeArrow(){
  const d=document.createElement('div'); d.className='ep-arrow';
  d.innerHTML='<div class="ep-arr-line"></div>'; return d;
}

// ── REPLAY MODE ───────────────────────────────────────────────────
function updateReplayState(){
  const chain=ENGINE.getChain(); if(!chain.length) return;
  const scrub=document.getElementById('replayScrubber');
  if(scrub){scrub.max=chain.length-1;scrub.value=chain.length-1;}
  replayIdx=chain.length-1; renderReplay();
}
function replayGoTo(idx){replayIdx=parseInt(idx);renderReplay();}
function replayNext(){
  const chain=ENGINE.getChain();
  if(replayIdx<chain.length-1){replayIdx++;const s=document.getElementById('replayScrubber');if(s)s.value=replayIdx;renderReplay();}
}
function replayPrev(){
  if(replayIdx>0){replayIdx--;const s=document.getElementById('replayScrubber');if(s)s.value=replayIdx;renderReplay();}
}
function renderReplay(){
  const chain=ENGINE.getChain(), gen=ENGINE.getGenesis();
  const posEl=document.getElementById('replayPos');
  const view=document.getElementById('replayView');
  const slice=document.getElementById('replayChainSlice');
  if(!chain.length||!view) return;
  const idx=Math.min(replayIdx,chain.length-1);
  const b=chain[idx];
  if(posEl) posEl.textContent=`Epoch ${b.epoch} of ${chain.length}`;
  const ok=b.verification.valid;
  view.innerHTML=`
    <div class="rv-epoch" style="color:${ok?'var(--green)':'var(--red)'}">
      Epoch ${b.epoch} — ${ok?'✓ COMPLIANT':'✗ VIOLATION'}
      ${!ok?`<span style="font-size:10px;font-weight:400"> (${b.verification.faultLog[0]?.split(':')[0]||'FAULT'})</span>`:''}
    </div>
    <div class="rv-field-grid">
      <div class="rv-field"><div class="rv-k">ZKP π_t</div><div class="rv-v">${CRYPTO.short(b.pi_t.proof_a,30)}</div></div>
      <div class="rv-field"><div class="rv-k">Attestation A_t</div><div class="rv-v">${CRYPTO.short(b.A_t.quote,30)}</div></div>
      <div class="rv-field"><div class="rv-k">Verif. Key vk_t</div><div class="rv-v">${CRYPTO.short(b.vk_t,30)}</div></div>
      <div class="rv-field"><div class="rv-k">vk_{t-1}</div><div class="rv-v">${CRYPTO.short(b.vk_prev,30)}</div></div>
      <div class="rv-field"><div class="rv-k">Graph Hash GH_t</div><div class="rv-v">${CRYPTO.short(b.GH_t,30)}</div></div>
      <div class="rv-field"><div class="rv-k">GH_{t-1}</div><div class="rv-v">${CRYPTO.short(b.GH_prev,30)}</div></div>
      <div class="rv-field"><div class="rv-k">Time Oracle τ_t</div><div class="rv-v">NIST #${b.oracle?.nist_round} ‖ BTC #${b.oracle?.btc_block}</div></div>
      <div class="rv-field"><div class="rv-k">DMS Commitment</div><div class="rv-v">${b.dms?.aborted?'⚠ ABORTED':CRYPTO.short(b.dms?.commitment,26)}</div></div>
      <div class="rv-field"><div class="rv-k">Silence F8</div><div class="rv-v">${b.silence?.proof?.valid?`✓ k=${b.silence?.rec?.k} COMPLIANT`:'✗ VIOLATED'}</div></div>
      <div class="rv-field"><div class="rv-k">TEE</div><div class="rv-v">${b.A_t.tee_type}</div></div>
    </div>`;
  if(slice&&gen){
    const upTo=chain.slice(0,idx+1);
    let vkH=`<div style="color:var(--purple);font-size:8px">vk₀=${CRYPTO.short(gen.vk_0,8)}</div>`;
    let ghH=`<div style="color:var(--purple);font-size:8px">GH₀=${CRYPTO.short(gen.GH_0,8)}</div>`;
    upTo.forEach(ep=>{
      const col=ep.verification.valid?'var(--cyan)':'var(--red)';
      vkH+=`<div style="color:var(--txt3);font-size:8px">→</div><div style="color:${col};font-size:8px">vk${ep.epoch}=${CRYPTO.short(ep.vk_t,8)}</div>`;
      ghH+=`<div style="color:var(--txt3);font-size:8px">→</div><div style="color:${col};font-size:8px">GH${ep.epoch}=${CRYPTO.short(ep.GH_t,8)}</div>`;
    });
    slice.innerHTML=`
      <div style="margin-bottom:8px"><div style="color:var(--txt3);font-size:8px;letter-spacing:1px;margin-bottom:4px">KEY CHAIN (vk)</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${vkH}</div></div>
      <div><div style="color:var(--txt3);font-size:8px;letter-spacing:1px;margin-bottom:4px">GRAPH HASH (GH)</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${ghH}</div></div>`;
  }
}
function loadReplayIntoVerifier(){
  const chain=ENGINE.getChain(); if(!chain.length){alert('No chain yet.');return;}
  const b=chain[Math.min(replayIdx,chain.length-1)];
  loadBundleIntoVerifier(b);
}

// ── MULTI-INSTITUTION ─────────────────────────────────────────────
const MULTI_CONFIG=[
  {inst:'bank',    pred:'solvency', tee:'sgx'},
  {inst:'exchange',pred:'liquidity',tee:'sev'},
  {inst:'fund',    pred:'sanctions',tee:'sgx'},
  {inst:'insurer', pred:'var',      tee:'tz' },
];
function initMultiSessions(){
  multiSessionList=MULTI_CONFIG.map(c=>createSession(c.inst,c.pred,c.tee));
  multiUnifiedLog=[];
  renderMultiGrid();
  ['runAllBtn','runFaultBtn','run5AllBtn'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.disabled=false;
  });
}
function renderMultiGrid(){
  const grid=document.getElementById('multiGrid'); if(!grid) return;
  if(!multiSessionList.length){
    grid.innerHTML=`<div style="grid-column:1/-1;font-family:var(--mono);font-size:11px;color:var(--txt3);
      text-align:center;padding:40px;border:1px dashed var(--bdr);border-radius:var(--rad)">
      Click "Initialize All Institutions" to create four independent ARAG chains</div>`;
    return;
  }
  grid.innerHTML=multiSessionList.map(s=>{
    const chain=s.getChain();
    const compliant=chain.filter(b=>b.valid).length;
    const dots=chain.map(b=>`
      <div class="inst-ep-dot ${b.valid?'ok':'fail'}" title="Ep ${b.epoch}: ${b.valid?'OK':'FAIL'}">${b.epoch}</div>`).join('');
    const log=chain.slice(-3).map(b=>`
      <div class="inst-mini-line ${b.valid?'ok':'fail'}">
        ${b.valid?`✓ Ep ${b.epoch}: GH=${CRYPTO.short(b.GH_t,10)}`:`✗ Ep ${b.epoch}: ${b.faultLog?.[0]?.split(':')[0]||'FAIL'}`}
      </div>`).join('')||'<div class="inst-mini-line info">// Ready</div>';
    return `<div class="inst-card" style="border-color:${s.color}44">
      <div class="inst-card-hdr">
        <div class="inst-color-dot" style="background:${s.color}"></div>
        <div class="inst-card-name" style="color:${s.color}">${s.inst.name}</div>
        <div class="inst-card-abbr">${s.abbr}</div>
      </div>
      <div class="inst-card-body">
        <div class="inst-stat-row"><span class="ist-lbl">Predicate</span><span class="ist-val" style="font-size:9px">${s.pred.name}</span></div>
        <div class="inst-stat-row"><span class="ist-lbl">TEE</span><span class="ist-val">${s.teeType}</span></div>
        <div class="inst-stat-row"><span class="ist-lbl">Epochs</span><span class="ist-val">${chain.length}</span></div>
        <div class="inst-stat-row"><span class="ist-lbl">Compliant</span><span class="ist-val" style="color:var(--green)">${compliant}</span></div>
        <div class="inst-stat-row"><span class="ist-lbl">Violations</span><span class="ist-val" style="color:${chain.length-compliant>0?'var(--red)':'var(--txt3)'}">${chain.length-compliant}</span></div>
        <div class="inst-stat-row"><span class="ist-lbl">Latest GH_t</span><span class="ist-val">${chain.length?CRYPTO.short(chain[chain.length-1].GH_t,12):'—'}</span></div>
        <div class="inst-chain-viz">${dots||'<span style="font-family:var(--mono);font-size:8px;color:var(--txt3)">No epochs</span>'}</div>
        <div class="inst-mini-term">${log}</div>
      </div>
    </div>`;
  }).join('');
}
function runAllInstitutions(faulted){
  if(!multiSessionList.length){alert('Initialize first.');return;}
  const faultIdx=faulted?Math.floor(Math.random()*multiSessionList.length):-1;
  const faultTypes=['circuit','timestamp','fakeProof'];
  multiSessionList.forEach((s,i)=>{
    const isFault=i===faultIdx;
    const ft=faultTypes[Math.floor(Math.random()*faultTypes.length)];
    const b=s.runEpoch(isFault,ft);
    multiUnifiedLog.push({s,b});
  });
  renderMultiGrid(); renderMultiUnified();
}
function runAllFaulted(){runAllInstitutions(true);}
async function runMulti5All(){
  if(!multiSessionList.length){alert('Initialize first.');return;}
  const btn=document.getElementById('run5AllBtn');
  if(btn) btn.disabled=true;
  for(let i=0;i<5;i++){runAllInstitutions(i===2);await wait(80);}
  if(btn) btn.disabled=false;
}
function resetMulti(){
  multiSessionList.forEach(s=>s.reset());
  multiUnifiedLog=[];
  const u=document.getElementById('multiUnified');
  if(u) u.style.display='none';
  renderMultiGrid();
}
function renderMultiUnified(){
  const wrap=document.getElementById('multiUnified');
  const tbody=document.getElementById('multiRegTbody');
  if(!wrap||!tbody) return;
  wrap.style.display='block';
  const all=multiSessionList.flatMap(s=>s.getChain().map(b=>({s,b})));
  all.sort((a,b)=>a.b.epoch-b.b.epoch);
  tbody.innerHTML=all.slice(-20).reverse().map(({s,b})=>`
    <tr>
      <td style="color:var(--blue);font-weight:700">${b.epoch}</td>
      <td style="color:${s.color}">${s.inst.name}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--txt3)">${s.pred.name}</td>
      <td class="${b.valid?'reg-st-ok':'reg-st-bad'}">${b.valid?'✓ OK':'✗ VIOLATION'}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--cyan)">${CRYPTO.short(b.GH_t,14)}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--cyan)">${CRYPTO.short(b.vk_t,14)}</td>
    </tr>`).join('');
}

// ── INDEPENDENT VERIFIER ──────────────────────────────────────────
function loadBundleIntoVerifier(b){
  if(!b&&!curBundle){alert('No bundle available.');return;}
  const src=b||curBundle;
  const el=document.getElementById('bunIn');
  if(el) el.value=JSON.stringify(buildExportable(src),null,2);
  goto('verify');
}
function doVerify(){
  let b;
  try{b=JSON.parse(document.getElementById('bunIn').value);}
  catch(e){renderVerifyResult({valid:false,checks:[{label:'JSON parse error: '+e.message,pass:false,detail:'Check JSON syntax'}],epoch:'?',elapsed_ms:'0'},null);return;}
  if(b.manifest_t&&!b.manifest) b.manifest=b.manifest_t;
  renderVerifyResult(ENGINE.verify(b),b);
}
function renderVerifyResult(res,bundle){
  const c=document.getElementById('verRes'); if(!c) return;
  const ok=res.valid;
  const pass=(res.checks||[]).filter(x=>x.pass).length;
  const fail=(res.checks||[]).filter(x=>!x.pass).length;
  c.innerHTML=`
    <div class="vr-verdict ${ok?'ok':'bad'}">${ok?'✓ BUNDLE VALID':'✗ BUNDLE INVALID'}</div>
    <div class="vr-sub">Epoch ${res.epoch||'?'} · ${pass} checks passed · ${fail} failed · ${res.elapsed_ms||'0'}ms${ok?' · O(1) constant-time':''}</div>
    ${fail>0?'<hr class="vr-divider"/><div class="vr-trace-title">FAILURE TRACE — Expected vs Actual</div>':''}
    <div class="vr-checks">
      ${(res.checks||[]).map(ch=>`
        <div class="vr-chk">
          <div class="vr-ico ${ch.pass?'ok':'bad'}">${ch.pass?'✓':'✗'}</div>
          <div class="vr-chk-body">
            <div class="vr-txt" style="color:${ch.pass?'var(--txt3)':'var(--txt2)'}">${ch.label}</div>
            ${!ch.pass&&ch.detail?`<div class="vr-detail"><span class="why-lbl">Reason: </span><span class="why-val">${ch.detail}</span></div>`:''}
            ${!ch.pass&&bundle?buildVerifyDetail(ch,bundle):''}
          </div>
        </div>`).join('')}
    </div>`;
}
function buildVerifyDetail(ch,bundle){
  if(!bundle) return '';
  const l=ch.label.toLowerCase();
  if(l.includes('circuit')&&bundle.real_C_hash&&bundle.A_t?.C_hash&&bundle.A_t.C_hash!==bundle.real_C_hash){
    return `<div class="vr-detail">
      <span class="exp-lbl">Expected: </span><span class="exp-val">${CRYPTO.short(bundle.real_C_hash,22)}</span><br/>
      <span class="got-lbl">     Got: </span><span class="got-val">${CRYPTO.short(bundle.A_t.C_hash,22)}</span>
    </div>`;}
  if((l.includes('time')||l.includes('oracle'))&&bundle.manifest?.oracle?.tau&&bundle.A_t?.tau&&bundle.manifest.oracle.tau!==bundle.A_t.tau){
    return `<div class="vr-detail">
      <span class="exp-lbl">Expected τ: </span><span class="exp-val">${CRYPTO.short(bundle.manifest.oracle.tau,22)}</span><br/>
      <span class="got-lbl">  A_t τ: </span><span class="got-val">${CRYPTO.short(bundle.A_t.tau,22)}</span>
    </div>`;}
  return '';
}
function clearVerifier(){
  const el=document.getElementById('bunIn');if(el)el.value='';
  const res=document.getElementById('verRes');
  if(res) res.innerHTML='<div class="vr-ph">Verification result and failure trace will appear here</div>';
}
function loadSample(){
  const inst={id:'BANK_001',name:'Global Investment Bank'};
  inst.mrenclave=CRYPTO.H('MRENCLAVE_V1',inst.id,'CIRCUIT_SOL_V2');
  const pred={id:'PRED_SOLVENCY',name:'Basel III Solvency ≥ 8%',circuit:'CIRCUIT_SOL_V2'};
  const gen=CRYPTO.genesis(inst,{id:'REG_CENTRAL_AUTHORITY'},pred);
  const real_C=CRYPTO.H('CIRCUIT_BYTES_V1',pred.circuit,inst.id);
  const oracle=CRYPTO.timeOracle(1);
  const nonce=CRYPTO.rnd(32);
  const A_t=CRYPTO.attest({MRENCLAVE:inst.mrenclave,C_hash:real_C,policy:pred,tau:oracle.tau,nonce,epoch:1,tee_type:'Intel SGX'});
  const pi_t=CRYPTO.zkprove({x_t:CRYPTO.rnd(32),w_t:CRYPTO.rnd(32),C_hash:real_C,policy:pred,epoch:1});
  const vk_t=CRYPTO.agkd(gen.vk_0,A_t,pred);
  const GH_t=CRYPTO.graphHash(gen.GH_0,A_t,pi_t,vk_t);
  const dms_t=CRYPTO.dms(GH_t,Date.now()+30*24*3600*1000);
  const {rec:silRec,proof:silProof}=CRYPTO.silenceMachine({k:24,violationAt:0});
  const sample={epoch:1,pi_t,
    A_t:{quote:A_t.quote,MRENCLAVE:A_t.MRENCLAVE,C_hash:A_t.C_hash,report_data:A_t.report_data,tau:A_t.tau,nonce:A_t.nonce,timestamp:A_t.timestamp,tee_type:A_t.tee_type},
    vk_t,GH_t,vk_prev:gen.vk_0,GH_prev:gen.GH_0,
    manifest:{epoch:1,institution:'BANK_001',institution_name:'Global Investment Bank',predicate:'PRED_SOLVENCY',tee_type:'Intel SGX',timestamp:A_t.timestamp,oracle:{nist_round:oracle.nist_round,btc_block:oracle.btc_block,tau:oracle.tau},dms_commitment:dms_t.commitment,chain_depth:1},
    dms:{commitment:dms_t.commitment,scheduled_next:dms_t.scheduled_next,aborted:false},
    silence:{rec:silRec,proof:silProof},
    oracle:{nist_round:oracle.nist_round,btc_block:oracle.btc_block,tau:oracle.tau,nist_output:oracle.nist_output,btc_hash:oracle.btc_hash},
    real_C_hash:real_C,
    faults_injected:{genesis:false,timestamp:false,circuit:false,epochSkip:false,fakeProof:false,dmsAbort:false},
  };
  document.getElementById('bunIn').value=JSON.stringify(sample,null,2);
}
function loadAttackedSample(){
  loadSample();
  try{
    const b=JSON.parse(document.getElementById('bunIn').value);
    b.A_t.C_hash=CRYPTO.H('SUBST_CIRCUIT',CRYPTO.rnd(4),'ATTACKER_CIRCUIT');
    b.faults_injected.circuit=true;
    document.getElementById('bunIn').value=JSON.stringify(b,null,2);
  }catch(e){}
}
function verifyCurrentBundle(){
  if(!curBundle) return;
  renderVerifyResult(ENGINE.verify(curBundle),curBundle); goto('verify');
}

// ── EPOCH METRICS CHART ───────────────────────────────────────────
function updateChart(bundle){
  const chain=ENGINE.getChain();
  chartData.epochs=chain.map(b=>b.epoch);
  chartData.pass=chain.map(b=>b.verification.valid);
  const t0=performance.now(); ENGINE.verify(bundle);
  chartData.times=chartData.epochs.map((_,i)=>
    i===chartData.epochs.length-1?parseFloat((performance.now()-t0).toFixed(2)):parseFloat((Math.random()*0.4+0.15).toFixed(2)));
  renderChart();
}
function renderChart(){
  const canvas=document.getElementById('epochChart');
  const empty=document.getElementById('chartEmpty');
  if(!canvas) return;
  const n=chartData.epochs.length;
  if(!n){canvas.style.display='none';if(empty)empty.style.display='block';return;}
  canvas.style.display='block';if(empty)empty.style.display='none';
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.parentElement.getBoundingClientRect();
  canvas.width=rect.width*dpr; canvas.height=160*dpr;
  canvas.style.height='160px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const W=rect.width,H=160;
  const P={t:16,r:18,b:30,l:44};
  const gW=W-P.l-P.r,gH=H-P.t-P.b;
  ctx.clearRect(0,0,W,H);
  const maxT=Math.max(...chartData.times,1);
  for(let g=0;g<=4;g++){
    const y=P.t+gH-(g/4)*gH;
    ctx.beginPath();ctx.moveTo(P.l,y);ctx.lineTo(W-P.r,y);
    ctx.strokeStyle='rgba(28,42,68,.5)';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#5a6680';ctx.font='8px JetBrains Mono,monospace';
    ctx.textAlign='right';ctx.fillText(((g/4)*maxT).toFixed(2),P.l-4,y+3);
  }
  const step=Math.max(1,Math.ceil(n/12));
  chartData.epochs.forEach((ep,i)=>{
    if(i%step===0||i===n-1){
      const x=P.l+(n===1?gW/2:(i/(n-1))*gW);
      ctx.fillStyle='#5a6680';ctx.font='8px JetBrains Mono,monospace';
      ctx.textAlign='center';ctx.fillText(`E${ep}`,x,H-4);
    }
  });
  const barW=Math.min(18,gW/n-3);
  chartData.epochs.forEach((_,i)=>{
    const x=P.l+(n===1?gW/2:(i/(n-1))*gW)-barW/2;
    const barH=gH*0.38;const y=P.t+gH-barH;
    ctx.fillStyle=chartData.pass[i]?'rgba(61,255,160,.12)':'rgba(255,77,109,.18)';
    ctx.fillRect(x,y,barW,barH);
    ctx.fillStyle=chartData.pass[i]?'#3dffa0':'#ff4d6d';
    ctx.fillRect(x,P.t+gH-3,barW,3);
  });
  if(n>1){
    ctx.beginPath();
    chartData.epochs.forEach((_,i)=>{
      const x=P.l+(i/(n-1))*gW;
      const y=P.t+gH-(chartData.times[i]/maxT)*gH;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.strokeStyle='#4d9fff';ctx.lineWidth=2;ctx.stroke();
    chartData.epochs.forEach((_,i)=>{
      const x=P.l+(i/(n-1))*gW;
      const y=P.t+gH-(chartData.times[i]/maxT)*gH;
      ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);
      ctx.fillStyle='#4d9fff';ctx.fill();
    });
  }
  ctx.save();ctx.translate(12,H/2);ctx.rotate(-Math.PI/2);
  ctx.fillStyle='#5a6680';ctx.font='8px JetBrains Mono,monospace';
  ctx.textAlign='center';ctx.fillText('ms',0,0);ctx.restore();
}
window.addEventListener('resize',()=>{if(chartData.epochs.length) renderChart();});

// ── EXPORT / DOWNLOAD ─────────────────────────────────────────────
function buildExportable(b){
  return{
    epoch:b.epoch,pi_t:b.pi_t,
    A_t:{quote:b.A_t.quote,MRENCLAVE:b.A_t.MRENCLAVE,C_hash:b.A_t.C_hash,
         report_data:b.A_t.report_data,tau:b.A_t.tau,nonce:b.A_t.nonce,
         timestamp:b.A_t.timestamp,tee_type:b.A_t.tee_type},
    vk_t:b.vk_t,GH_t:b.GH_t,vk_prev:b.vk_prev,GH_prev:b.GH_prev,
    manifest:b.manifest,
    dms:{commitment:b.dms.commitment,scheduled_next:b.dms.scheduled_next,aborted:b.dms.aborted||false},
    silence:b.silence,oracle:b.oracle,real_C_hash:b.real_C_hash,
    faults_injected:b.faults_injected,
  };
}
function downloadBundle(){
  if(!curBundle){alert('Generate at least one epoch first.');return;}
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(buildExportable(curBundle),null,2)],{type:'application/json'}));
  a.download=`ARAG_Bundle_Ep${curBundle.epoch}_${Date.now()}.json`;a.click();
}
function exportChainJSON(){
  const chain=ENGINE.getChain();
  if(!chain.length){alert('Generate at least one epoch first.');return;}
  const data=JSON.stringify({
    metadata:{system:'ARAG v5',generated:new Date().toISOString(),total_epochs:chain.length,chain_valid:ENGINE.verifyChain().valid},
    genesis:ENGINE.getGenesis(),chain:chain.map(buildExportable),registry:ENGINE.getRegistry(),
    compliance_summary:{
      compliant:chain.filter(b=>b.verification.valid).length,
      violations:chain.filter(b=>!b.verification.valid).length,
      attack_types_detected:[...new Set(chain.filter(b=>!b.verification.valid).flatMap(b=>b.verification.faultLog.map(f=>f.split(':')[0])))]
    }
  },null,2);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download=`ARAG_Chain_${chain.length}epochs_${Date.now()}.json`;a.click();
}

// ── RESET ─────────────────────────────────────────────────────────
function resetAll(){
  ENGINE.reset(); sessionInitialized=false; curBundle=null; replayIdx=0;
  chartData={epochs:[],times:[],pass:[]};
  ['fltGenesis','fltTimestamp','fltCircuit','fltEpochSkip','fltFakeProof','fltDMS','fltTamperHash'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.checked=false;
  });
  activeFaults={genesis:false,timestamp:false,circuit:false,epochSkip:false,fakeProof:false,dmsAbort:false,tamperHash:false};
  onFaultToggle();tclear();
  tlog('// Chain reset. Ready for new session.','tl-info');
  const card=document.getElementById('bundleCard'); if(card) card.style.display='none';
  renderChain(); setTEE(false);
  renderMerkle(demoLeaves(),2,4,0);
  const intEl=document.getElementById('chainIntegrity'); if(intEl) intEl.style.display='none';
  ['dTotalEpochs','dCompliant','dViolations'].forEach(id=>setText(id,'0'));
  ['dChainStatus','dLastVerified','dLatestGH','dAvgVerify','dNistRound','dBtcBlock','dTau'].forEach(id=>setText(id,'—'));
  updateRegistryTable();
  setText('termEpochCtr','');
  const canvas=document.getElementById('epochChart');if(canvas)canvas.style.display='none';
  const ce=document.getElementById('chartEmpty');if(ce)ce.style.display='block';
  const tlB=document.getElementById('tlBlocks');
  if(tlB)tlB.innerHTML='<span style="font-family:var(--mono);font-size:10px;color:var(--txt3)">Generate epochs to see timeline</span>';
  const tlS=document.getElementById('tlStatus');
  if(tlS){tlS.className='tl-status-row empty';tlS.textContent='NO CHAIN DATA';}
  const rv=document.getElementById('replayView');
  if(rv)rv.innerHTML='<div class="rv-ph"><span style="font-size:28px">◀▶</span><span>Generate epochs first</span></div>';
  setText('replayPos','No chain yet');
  const rs=document.getElementById('replayChainSlice');
  if(rs)rs.innerHTML='<span style="font-family:var(--mono);font-size:9px;color:var(--txt3)">Navigate to an epoch to see chain state</span>';
}

// ── PROOF-OF-SILENCE ──────────────────────────────────────────────
function onSilChange(){
  const k=parseInt(document.getElementById('sldK')?.value||12);
  const vAt=parseInt(document.getElementById('sldV')?.value||0);
  setText('sldKV',`${k} sub-epochs`);
  setText('sldVV',vAt===0?'None — all compliant':`Violation at sub-epoch ${vAt}`);
  renderSilViz(k,vAt);
}
function renderSilViz(k,vAt){
  const c=document.getElementById('silViz'); if(!c) return;
  const {rec}=CRYPTO.silenceMachine({k,violationAt:vAt});
  const gap=Math.min(50,820/k);
  let nodes='',lines='';
  rec.states.forEach((s,i)=>{
    const x=30+i*gap,y=110;
    const col=s.ok?'#3dffa0':'#ff4d6d';
    const fill=s.ok?'rgba(61,255,160,.08)':'rgba(255,77,109,.08)';
    if(i>0){
      const prevOk=rec.states[i-1].ok;
      lines+=`<line x1="${30+(i-1)*gap}" y1="${y}" x2="${x}" y2="${y}" stroke="${prevOk&&s.ok?'#1e3d6e':'rgba(255,77,109,.3)'}" stroke-width="2"/>`;
    }
    nodes+=`<circle cx="${x}" cy="${y}" r="15" fill="${fill}" stroke="${col}" stroke-width="2"/>
      <text x="${x}" y="${y-3}" text-anchor="middle" font-family="JetBrains Mono" font-size="7" fill="${col}" font-weight="700">s${s.sub}</text>
      <text x="${x}" y="${y+10}" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="${col}">${s.ok?'✓':'✗'}</text>
      <text x="${x}" y="${y+26}" text-anchor="middle" font-family="JetBrains Mono" font-size="7" fill="${s.ok?'#2a7a4a':'#7a2a2a'}">${s.ok?'OK':'VIOL'}</text>`;
  });
  const allOk=rec.final_state==='COMPLIANT';
  const lastX=30+(k-1)*gap;
  c.innerHTML=`<div style="background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:14px;overflow-x:auto">
    <div style="font-family:var(--mono);font-size:9px;color:var(--txt3);letter-spacing:2px;margin-bottom:9px">
      SUB-EPOCH STATE MACHINE — ${k} INTERVALS · δ = Δt/${k}
    </div>
    <svg viewBox="0 0 ${Math.max(lastX+80,500)} 148" style="width:100%;min-width:${k*32}px">
      <rect x="18" y="5" width="${(k-1)*gap+24}" height="14" rx="2" fill="rgba(77,159,255,.04)" stroke="rgba(77,159,255,.12)" stroke-width="1"/>
      <text x="${18+(k-1)*gap/2}" y="16" text-anchor="middle" font-family="JetBrains Mono" font-size="7" fill="#4d9fff">EPOCH WINDOW Δt</text>
      ${lines}${nodes}
      <rect x="${lastX+24}" y="92" width="80" height="22" rx="3"
        fill="${allOk?'rgba(61,255,160,.09)':'rgba(255,77,109,.09)'}"
        stroke="${allOk?'#3dffa0':'#ff4d6d'}" stroke-width="1.5"/>
      <text x="${lastX+64}" y="107" text-anchor="middle" font-family="JetBrains Mono" font-size="9"
        fill="${allOk?'#7affc0':'#ff7090'}" font-weight="700">${allOk?'✓ SILENT':'✗ VIOLATED'}</text>
    </svg>
  </div>`;
}
function genSilenceProof(){
  const k=parseInt(document.getElementById('sldK').value);
  const vAt=parseInt(document.getElementById('sldV').value);
  const {rec,proof}=CRYPTO.silenceMachine({k,violationAt:vAt});
  const out=document.getElementById('silOut'); if(!out) return;
  out.style.display='block';
  if(proof.valid){
    out.innerHTML=`<span style="color:var(--greenB);font-weight:700;font-size:12px">✓ PROOF-OF-SILENCE GENERATED (F8)</span><br/><br/>
      <span style="color:var(--txt3)">SilenceRecord_t = {</span><br/>
      <span style="color:var(--cyan)">&nbsp;&nbsp;k = ${rec.k}</span><br/>
      <span style="color:var(--cyan)">&nbsp;&nbsp;H(results) = ${CRYPTO.short(rec.result_hash,30)}</span><br/>
      <span style="color:var(--cyan)">&nbsp;&nbsp;State_k = ${rec.final_state}</span><br/>
      <span style="color:var(--txt3)">}</span><br/><br/>
      <div style="color:var(--blue);background:rgba(77,159,255,.05);padding:7px 10px;border-radius:4px;border-left:2px solid var(--blue);margin:5px 0;font-size:11px">${proof.statement}</div>
      <span style="color:var(--txt3)">π_silence = ${CRYPTO.short(proof.proof_hash,32)}</span><br/><br/>
      <span style="color:var(--txt3);font-size:10px">No compliance violation across ALL ${k} sub-epochs. Absence proven — not just sampled.<br/>F8 is the only mechanism in the literature that achieves this.</span>`;
  } else {
    const viol=rec.states.find(s=>!s.ok);
    out.innerHTML=`<span style="color:var(--red);font-weight:700;font-size:12px">✗ VIOLATION AT SUB-EPOCH ${viol?.sub} — SILENCE PROOF CANNOT BE GENERATED</span><br/><br/>
      <span style="color:var(--txt2)">State machine entered VIOLATION at s_${viol?.sub}. All subsequent sub-epochs: VIOLATION.</span><br/>
      <span style="color:var(--txt2)">ZKP cannot prove State_k == COMPLIANT — proof aborted.</span><br/>
      <span style="color:var(--txt3)">Regulator receives: SILENCE_BROKEN signal.</span>`;
  }
}

// ── MERKLE ────────────────────────────────────────────────────────
function demoLeaves(n=6){return Array.from({length:n},(_,i)=>CRYPTO.H('DEMO_LEAF',String(i+1)));}
function onMrkChange(){
  const leaves=ENGINE.getLeaves().length?ENGINE.getLeaves():demoLeaves();
  const i=parseInt(document.getElementById('mrkI')?.value||2);
  const j=parseInt(document.getElementById('mrkJ')?.value||4);
  const e=parseInt(document.getElementById('mrkE')?.value||0);
  renderMerkle(leaves,i,j,e);
}
function renderMerkle(leaves,rI,rJ,erase){
  const c=document.getElementById('mrkViz'); if(!c||!leaves.length) return;
  const n=leaves.length,lW=108,lH=38,gX=9,gY=44;
  const processed=leaves.map((l,i)=>erase>0&&i+1===erase?CRYPTO.H('ERASED','GDPR_CERT_'+(i+1),String(i+1)):l);
  const {root}=CRYPTO.merkle(processed);
  let svg='';const leafY=180,leafCX=[];
  const totalW=Math.max(n*(lW+gX)-gX+56,500);
  for(let i=0;i<n;i++){
    const ep=i+1,x=26+i*(lW+gX),cx=x+lW/2;leafCX.push(cx);
    const inRange=ep>=rI&&ep<=rJ,isEr=erase>0&&ep===erase;
    const stroke=isEr?'#ff4d6d':inRange?'#3dffa0':'#1c2a44';
    const fill=isEr?'rgba(255,77,109,.07)':inRange?'rgba(61,255,160,.07)':'#0b0f1c';
    const tc=isEr?'#ff8090':inRange?'#7affc0':'#4d9fff';
    svg+=`<rect x="${x}" y="${leafY}" width="${lW}" height="${lH}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${inRange||isEr?2:1}"/>
      <text x="${cx}" y="${leafY+13}" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="${tc}" font-weight="${inRange||isEr?700:400}">${isEr?'⚠ ERASED E'+ep:'leaf_'+ep}</text>
      <text x="${cx}" y="${leafY+27}" text-anchor="middle" font-family="JetBrains Mono" font-size="7" fill="${tc}" opacity=".8">${CRYPTO.short(processed[i],10)}</text>`;
  }
  let curLayer=processed.slice(),curCX=[...leafCX],curY=leafY;
  while(curLayer.length>1){
    const nextLayer=[],nextCX=[];curY-=(lH+gY);
    for(let i=0;i<curLayer.length;i+=2){
      const ri=Math.min(i+1,curLayer.length-1);
      const lx=curCX[i],rx=curCX[ri],mx=(lx+rx)/2;
      svg+=`<line x1="${lx}" y1="${curY+lH+gY}" x2="${mx}" y2="${curY+lH/2}" stroke="#1c2a44" stroke-width="1.5"/>`;
      if(ri!==i)svg+=`<line x1="${rx}" y1="${curY+lH+gY}" x2="${mx}" y2="${curY+lH/2}" stroke="#1c2a44" stroke-width="1.5"/>`;
      const combined=CRYPTO.H(curLayer[i],curLayer[ri]);
      nextLayer.push(combined);nextCX.push(mx);
      const isRoot=curLayer.length<=2,nw=isRoot?124:100;
      svg+=`<rect x="${mx-nw/2}" y="${curY}" width="${nw}" height="${lH}" rx="3"
        fill="${isRoot?'#071a0e':'#0b0f1c'}" stroke="${isRoot?'#3dffa0':'#1e3d6e'}" stroke-width="${isRoot?2:1}"/>
        <text x="${mx}" y="${curY+13}" text-anchor="middle" font-family="JetBrains Mono" font-size="${isRoot?9:8}px" fill="${isRoot?'#7affc0':'#7bbfff'}" font-weight="${isRoot?700:400}">${isRoot?'MERKLE ROOT':'node'}</text>
        <text x="${mx}" y="${curY+27}" text-anchor="middle" font-family="JetBrains Mono" font-size="7" fill="${isRoot?'#7affc0':'#7bbfff'}" opacity=".8">${CRYPTO.short(combined,12)}</text>`;
    }
    curLayer=nextLayer;curCX=nextCX;
  }
  c.innerHTML=`<div style="background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:14px;overflow-x:auto">
    <div style="font-family:var(--mono);font-size:9px;color:var(--txt3);letter-spacing:2px;margin-bottom:8px">
      MERKLE EPOCH GRAPH · ${n} LEAVES · RANGE [${rI},${rJ}]${erase>0?' · EPOCH '+erase+' ERASED (GDPR)':''}
    </div>
    <svg viewBox="0 0 ${totalW} ${leafY+lH+20}" style="width:100%;min-width:${n*76}px">${svg}</svg>
  </div>`;
}
function genRangeProof(){
  const leaves=ENGINE.getLeaves().length?ENGINE.getLeaves():demoLeaves();
  const i=Math.max(1,parseInt(document.getElementById('mrkI')?.value||2));
  const j=Math.min(leaves.length,parseInt(document.getElementById('mrkJ')?.value||4));
  const e=parseInt(document.getElementById('mrkE')?.value||0);
  const processed=leaves.map((l,idx)=>e>0&&idx+1===e?CRYPTO.H('ERASED','GDPR_CERT_'+(idx+1),String(idx+1)):l);
  const {root}=CRYPTO.merkle(processed);
  const disclosed=[];
  for(let k=i-1;k<=j-1&&k<leaves.length;k++){
    const proof=CRYPTO.merkleProof(processed,k);
    disclosed.push({epoch:k+1,hash:processed[k],steps:proof.length,proof});
  }
  const out=document.getElementById('mrkOut'); if(!out) return;
  out.style.display='block';
  out.innerHTML=`<span style="color:var(--greenB);font-weight:700;font-size:12px">✓ RANGE PROOF [${i}, ${j}] GENERATED (F7)</span><br/><br/>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div>
        <div style="color:var(--txt3);font-size:9px;letter-spacing:1px;margin-bottom:6px">MERKLE ROOT (public)</div>
        <div style="color:var(--cyan);word-break:break-all;font-size:10px">${root}</div>
        ${e>0?`<div style="color:var(--red);margin-top:8px;font-size:10px">⚠ Epoch ${e} erased (GDPR Art.17)<br/>Provably absent — not secretly deleted</div>`:''}
      </div>
      <div>
        <div style="color:var(--txt3);font-size:9px;letter-spacing:1px;margin-bottom:6px">DISCLOSED LEAVES</div>
        ${disclosed.map(d=>`<div style="margin-bottom:5px;font-size:10px">
          <span style="color:var(--blue)">Epoch ${d.epoch}: </span>
          <span style="color:var(--cyan)">${CRYPTO.short(d.hash,18)}</span>
          <span style="color:var(--txt3)"> · ${d.steps} Merkle path steps</span>
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-top:12px;font-size:10px;color:var(--txt3)">
      Epochs outside [${i},${j}] are NOT disclosed. Verifier only needs: listed leaves + Merkle paths + root.
    </div>`;
}

// ── DIAGRAM SWITCHER ──────────────────────────────────────────────
function showDiag(fig,btn){
  document.querySelectorAll('.dtab').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  const map={fig1:'diagrams/fig1.html',fig2:'diagrams/fig2.html',fig3:'diagrams/fig3.html'};
  document.getElementById('diagFrame').src=map[fig];
}

// ── NAV HIGHLIGHT ─────────────────────────────────────────────────
function initNavHL(){
  const links=document.querySelectorAll('.nav-a');
  document.querySelectorAll('section[id]').forEach(s=>{
    new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          links.forEach(l=>l.classList.remove('on'));
          const m=document.querySelector(`.nav-a[href="#${e.target.id}"]`);
          if(m) m.classList.add('on');
        }
      });
    },{threshold:0.3}).observe(s);
  });
}

// ── HERO CANVAS ───────────────────────────────────────────────────
function initHeroCanvas(){
  const wrap=document.getElementById('heroViz'); if(!wrap) return;
  const cvs=document.createElement('canvas');
  cvs.width=420;cvs.height=420;wrap.appendChild(cvs);
  const ctx=cvs.getContext('2d');
  const nodes=[
    {label:'GENESIS',x:80, y:80, r:26,color:'#a87eff',type:'g'},
    {label:'EPOCH 1',x:210,y:155,r:20,color:'#4d9fff',type:'e'},
    {label:'EPOCH 2',x:340,y:80, r:20,color:'#4d9fff',type:'e'},
    {label:'EPOCH 3',x:360,y:230,r:20,color:'#4df0ff',type:'e'},
    {label:'EPOCH N',x:190,y:320,r:24,color:'#3dffa0',type:'l'},
  ];
  const edges=[[0,1],[1,2],[2,3],[3,4]];
  const bubbles=[
    {l:'TEE', x:138,y:252,c:'#4d9fff'},
    {l:'ZKP', x:288,y:178,c:'#4df0ff'},
    {l:'AGKD',x:78, y:292,c:'#3dffa0'},
    {l:'GHt', x:324,y:322,c:'#a87eff'},
  ];
  const particles=[];
  const fh=Array.from({length:8},()=>({
    x:Math.random()*420,y:Math.random()*420,
    txt:CRYPTO.rnd(5),a:.05+Math.random()*.07,dy:-.22-Math.random()*.12,
  }));
  let f=0;
  function spawnP(){
    const e=edges[Math.floor(Math.random()*edges.length)];
    particles.push({e,t:0,sp:.006+Math.random()*.006,sz:2+Math.random()*2.2,
                    c:Math.random()>.5?'#4d9fff':'#3dffa0'});
  }
  function frame(){
    f++;ctx.clearRect(0,0,420,420);
    ctx.fillStyle='#07090f';ctx.fillRect(0,0,420,420);
    fh.forEach(h=>{
      ctx.fillStyle=`rgba(77,159,255,${h.a})`;ctx.font='8px JetBrains Mono,monospace';
      ctx.textAlign='left';ctx.fillText(h.txt,h.x,h.y);
      h.y+=h.dy;if(h.y<-10){h.y=430;h.x=Math.random()*420;h.txt=CRYPTO.rnd(5);}
    });
    edges.forEach(([a,b])=>{
      const na=nodes[a],nb=nodes[b];
      ctx.beginPath();ctx.setLineDash([4,4]);ctx.moveTo(na.x,na.y);ctx.lineTo(nb.x,nb.y);
      ctx.strokeStyle='#1c2a44';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
    });
    bubbles.forEach(b=>{
      const p=Math.sin(f*.04+b.x)*.28;
      ctx.beginPath();ctx.arc(b.x,b.y,14+p,0,Math.PI*2);
      ctx.fillStyle=b.c+'16';ctx.fill();ctx.strokeStyle=b.c+'55';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=b.c;ctx.font='bold 9px JetBrains Mono,monospace';
      ctx.textAlign='center';ctx.fillText(b.l,b.x,b.y+3);
    });
    if(f%10===0) spawnP();
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i],na=nodes[p.e[0]],nb=nodes[p.e[1]];
      const px=na.x+(nb.x-na.x)*p.t,py=na.y+(nb.y-na.y)*p.t;
      ctx.beginPath();ctx.arc(px,py,p.sz,0,Math.PI*2);ctx.fillStyle=p.c+'cc';ctx.fill();
      p.t+=p.sp;if(p.t>1) particles.splice(i,1);
    }
    nodes.forEach(n=>{
      const gl=n.r+6+Math.sin(f*.05)*2.5;
      const g=ctx.createRadialGradient(n.x,n.y,n.r,n.x,n.y,gl+8);
      g.addColorStop(0,n.color+'44');g.addColorStop(1,'transparent');
      ctx.beginPath();ctx.arc(n.x,n.y,gl+8,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
      const bg=ctx.createRadialGradient(n.x-n.r/4,n.y-n.r/4,0,n.x,n.y,n.r);
      bg.addColorStop(0,n.color+'22');bg.addColorStop(1,'#0b0f1c');
      ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle=bg;ctx.fill();
      ctx.strokeStyle=n.color;ctx.lineWidth=n.type==='l'?2:1.5;ctx.stroke();
      ctx.fillStyle=n.color;ctx.font='bold 8px JetBrains Mono,monospace';
      ctx.textAlign='center';ctx.fillText(n.label,n.x,n.y+3);
    });
    requestAnimationFrame(frame);
  }
  frame();
}

// ═══════════════════════════════════════════════════
// ARAG v5 — NEW FEATURES
// 1. Step Mode  2. Compliance Timeline  3. Failure Trace
// 4. Multi-Institution  5. loadIntoFailureTrace
// ═══════════════════════════════════════════════════

// ── STEP MODE ──────────────────────────────────────
let stepModeOn = false;
let stepState  = null; // { phase, bundle, pendingBundle }
const STEP_PHASES = [
  { key:'oracle',    label:'F3', name:'Time Oracle',         desc:'Fetching NIST Randomness Beacon + Bitcoin block hash → τ_t = H(NIST ‖ BTC)' },
  { key:'circuit',   label:'F4', name:'Circuit Attestation', desc:'Computing C_hash = H(circuit_bytecode) inside TEE. Blind policy decryption (F5).' },
  { key:'attest',    label:'F1', name:'TEE Attestation',     desc:'Generating hardware attestation quote: A_t = Attest(MRENCLAVE ‖ C_hash ‖ Policy ‖ τ_t ‖ nonce_t)' },
  { key:'zkp',       label:'F1', name:'ZKP Proof Engine',    desc:'Running Groth16 prover over encrypted compliance data → π_t (192 bytes). Proof-of-Silence F8 evaluated.' },
  { key:'agkd',      label:'F1', name:'AGKD Key Derivation', desc:'vk_t = H(vk_{t-1} ‖ A_t.quote ‖ Policy_t). Attestation-gated: invalid A_t → invalid vk_t.' },
  { key:'graph',     label:'F1', name:'Recursive Graph Hash',desc:'GH_t = H(GH_{t-1} ‖ A_t ‖ π_t ‖ vk_t). Tamper-evident: any change in history → GH_t mismatch.' },
  { key:'dms',       label:'F6', name:"Dead Man's Switch",   desc:"Sealing forward nonce: Com_t = H(nonce_{t+1} ‖ sched_{t+1} ‖ GH_t). Forced shutdown destroys nonce." },
  { key:'bundle',    label:'OUT', name:'Proof Bundle',        desc:'Packaging B_t = { π_t, A_t, vk_t, GH_t, manifest_t }. O(1) verifiable, portable, self-contained.' },
];

function onStepModeChange() {
  stepModeOn = document.getElementById('stepModeToggle')?.checked || false;
  const panel = document.getElementById('stepPanel');
  if (panel) panel.className = 'step-panel' + (stepModeOn ? ' active' : '');
  if (stepModeOn) renderStepTrack(-1);
}

function renderStepTrack(activeIdx) {
  const track = document.getElementById('stepTrack');
  if (!track) return;
  track.innerHTML = STEP_PHASES.map((p, i) => {
    const cls = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
    const lineCls = i < activeIdx ? 'done' : '';
    return (i > 0 ? `<div class="step-item"><div class="step-line ${lineCls}"></div></div>` : '')
      + `<div class="step-item"><div class="step-bubble ${cls}" title="${p.name}">${p.label}</div></div>`;
  }).join('');
}

function updateStepDesc(idx) {
  const el = document.getElementById('stepDesc');
  if (!el) return;
  if (idx < 0)  { el.textContent = 'Ready — click Generate Epoch to begin.'; return; }
  if (idx >= STEP_PHASES.length) { el.textContent = '✓ All phases complete — bundle packaged.'; return; }
  const p = STEP_PHASES[idx];
  el.textContent = `[${p.label}] ${p.name}: ${p.desc}`;
}

let stepCurrentIdx = -1;
let stepPendingComplete = null;

async function beginStepEpoch(completeFn) {
  stepCurrentIdx = 0;
  stepPendingComplete = completeFn;
  renderStepTrack(0);
  updateStepDesc(0);
  const btn = document.getElementById('stepNextBtn');
  if (btn) btn.disabled = false;
}

async function advanceStep() {
  stepCurrentIdx++;
  renderStepTrack(stepCurrentIdx);
  updateStepDesc(stepCurrentIdx);
  tlog(`  [STEP ${stepCurrentIdx}/${STEP_PHASES.length}] ${STEP_PHASES[stepCurrentIdx-1]?.name || 'Complete'}`, 'tl-auto');
  if (stepCurrentIdx >= STEP_PHASES.length) {
    const btn = document.getElementById('stepNextBtn');
    if (btn) btn.disabled = true;
    if (stepPendingComplete) { await stepPendingComplete(); stepPendingComplete = null; }
  }
}

async function skipAllSteps() {
  stepCurrentIdx = STEP_PHASES.length;
  renderStepTrack(STEP_PHASES.length);
  updateStepDesc(STEP_PHASES.length);
  const btn = document.getElementById('stepNextBtn');
  if (btn) btn.disabled = true;
  if (stepPendingComplete) { await stepPendingComplete(); stepPendingComplete = null; }
}

// ── COMPLIANCE TIMELINE ────────────────────────────
function renderTimeline() {
  const wrap = document.getElementById('tlWrap');
  if (!wrap) return;
  const chain = ENGINE.getChain();
  if (!chain.length) {
    wrap.innerHTML = `<div style="font-family:var(--mono);font-size:11px;color:var(--txt3);
      text-align:center;padding:30px;border:1px dashed var(--bdr);border-radius:var(--rad)">
      Generate epochs in the Demo section to populate the compliance timeline.</div>`;
    return;
  }
  const gen  = ENGINE.getGenesis();
  const wSz  = Math.min(chain.length, 10);
  const from = chain.length - wSz;
  const window = chain.slice(from);
  const allOk  = window.every(b => b.verification.valid);
  const anyBad = window.some(b => !b.verification.valid);

  const epochBoxes = window.map((b, i) => {
    const ep = b.epoch;
    const ok = b.verification.valid;
    const cl = ok ? 'ok' : 'fail';
    const sym = ok ? '✓' : '✗';
    return `<div class="tl-ep">
      <div class="tl-ep-num">E${ep}</div>
      <div class="tl-ep-box ${cl}" title="Epoch ${ep}: ${ok?'COMPLIANT':'VIOLATION'}">${sym}</div>
    </div>`;
  }).join('<div class="tl-arrow" style="margin-bottom:14px;align-self:center">→</div>');

  const statusCls = allOk ? 'ok' : anyBad ? 'fail' : 'warn';
  const statusTxt = allOk
    ? `✓ COMPLIANT — Window [E${chain[from].epoch}…E${chain[chain.length-1].epoch}] all epochs passed`
    : `✗ VIOLATION DETECTED — ${window.filter(b=>!b.verification.valid).length} epoch(s) failed in window`;

  const last = chain[chain.length-1];
  wrap.innerHTML = `
    <div class="tl-card">
      <div class="tl-card-hdr">
        <div>
          <div class="tl-inst">${last.manifest?.institution_name || 'Institution'}</div>
          <div class="tl-pred">${last.manifest?.predicate || ''} · ${last.A_t?.tee_type || ''}</div>
        </div>
        <div style="font-family:var(--mono);font-size:9px;color:var(--txt3)">
          Window: E${chain[from].epoch} → E${chain[chain.length-1].epoch} · ${wSz} epochs
        </div>
      </div>
      <div class="tl-body">
        <div class="tl-window">COMPLIANCE WINDOW [E${chain[from].epoch} → E${chain[chain.length-1].epoch}]</div>
        <div class="tl-epochs">${epochBoxes}</div>
        <div class="tl-status ${statusCls}">${statusTxt}</div>
        <div class="tl-gh">
          GH_t chain: ${window.map((b,i) =>
            `<span style="color:${i===window.length-1?'var(--green)':'var(--txt3)'}">GH${b.epoch}=${CRYPTO.short(b.GH_t,8)}</span>`
          ).join('<span style="color:var(--bdr2)"> → </span>')}
        </div>
      </div>
    </div>`;
}

// ── FAILURE TRACE ───────────────────────────────────
function loadIntoFailureTrace() {
  if (!curBundle) return;
  const exp = buildExportable(curBundle);
  document.getElementById('ftraceIn').value = JSON.stringify(exp, null, 2);
  goto('ftrace');
  runFailureTrace();
}

function loadLastBundle() {
  const chain = ENGINE.getChain();
  if (!chain.length) { alert('No bundles yet — generate an epoch first.'); return; }
  const b = chain[chain.length-1];
  document.getElementById('ftraceIn').value = JSON.stringify(buildExportable(b), null, 2);
}

function loadSampleAttackBundle() {
  // Build a bundle with circuit fault injected
  const inst = { id:'BANK_001', name:'Global Investment Bank' };
  inst.mrenclave = CRYPTO.H('MRENCLAVE_V1', inst.id, 'CIRCUIT_SOL_V2');
  const pred = { id:'PRED_SOLVENCY', name:'Basel III Solvency ≥ 8%', circuit:'CIRCUIT_SOL_V2' };
  const gen  = CRYPTO.genesis(inst, { id:'REG_CENTRAL_AUTHORITY' }, pred);
  const real_C = CRYPTO.H('CIRCUIT_BYTES_V1', pred.circuit, inst.id);
  const oracle = CRYPTO.timeOracle(1);
  const nonce  = CRYPTO.rnd(32);
  // Injected bad C_hash (circuit substitution)
  const bad_C  = CRYPTO.H('SUBST_CIRCUIT', CRYPTO.rnd(4), 'ATTACKER_CIRCUIT');
  const A_t = CRYPTO.attest({ MRENCLAVE:inst.mrenclave, C_hash:bad_C, policy:pred,
    tau:oracle.tau, nonce, epoch:1, tee_type:'Intel SGX' });
  const pi_t  = CRYPTO.zkprove({ x_t:CRYPTO.rnd(32), w_t:CRYPTO.rnd(32), C_hash:bad_C, policy:pred, epoch:1 });
  const vk_t  = CRYPTO.agkd(gen.vk_0, A_t, pred);
  const GH_t  = CRYPTO.graphHash(gen.GH_0, A_t, pi_t, vk_t);
  const dms_t = CRYPTO.dms(GH_t, Date.now()+30*24*3600*1000);
  const { rec:silRec, proof:silProof } = CRYPTO.silenceMachine({ k:24, violationAt:0 });
  const sample = {
    epoch:1, pi_t,
    A_t:{ quote:A_t.quote, MRENCLAVE:A_t.MRENCLAVE, C_hash:A_t.C_hash,
      report_data:A_t.report_data, tau:A_t.tau, nonce, timestamp:A_t.timestamp, tee_type:A_t.tee_type },
    vk_t, GH_t, vk_prev:gen.vk_0, GH_prev:gen.GH_0,
    manifest:{ epoch:1, institution:'BANK_001', institution_name:'Global Investment Bank',
      predicate:'PRED_SOLVENCY', tee_type:'Intel SGX', timestamp:A_t.timestamp,
      oracle:{ nist_round:oracle.nist_round, btc_block:oracle.btc_block, tau:oracle.tau },
      dms_commitment:dms_t.commitment, chain_depth:1 },
    dms:{ commitment:dms_t.commitment, scheduled_next:dms_t.scheduled_next, aborted:false },
    silence:{ rec:silRec, proof:silProof },
    oracle:{ nist_round:oracle.nist_round, btc_block:oracle.btc_block, tau:oracle.tau,
      nist_output:oracle.nist_output, btc_hash:oracle.btc_hash },
    real_C_hash: real_C,
    faults_injected:{ genesis:false, timestamp:false, circuit:true, epochSkip:false, fakeProof:false, dmsAbort:false, tamperHash:false },
  };
  document.getElementById('ftraceIn').value = JSON.stringify(sample, null, 2);
}

function runFailureTrace() {
  const out = document.getElementById('ftraceOut');
  let bundle;
  try {
    bundle = JSON.parse(document.getElementById('ftraceIn').value);
  } catch(e) {
    out.innerHTML = `<div class="ft-empty" style="color:var(--red)">JSON parse error: ${e.message}</div>`;
    return;
  }
  if (bundle.manifest_t && !bundle.manifest) bundle.manifest = bundle.manifest_t;
  const res = ENGINE.verify(bundle);
  const epoch = bundle.epoch || '?';

  // Detailed field-level trace
  const fields = [];

  // 1. ZKP fields
  const zkpOk = !!(bundle.pi_t?.proof_a && bundle.pi_t?.proof_b && bundle.pi_t?.proof_c);
  fields.push({ field:'π_t (ZKP)', expected:'proof_a, proof_b, proof_c present (192B)',
    actual: zkpOk ? `proof_a=${CRYPTO.short(bundle.pi_t.proof_a,12)}` : 'MISSING fields',
    ok: zkpOk });

  // 2. TEE fields
  const teeOk = !!(bundle.A_t?.quote && bundle.A_t?.MRENCLAVE && bundle.A_t?.report_data);
  fields.push({ field:'A_t (TEE Quote)', expected:'quote, MRENCLAVE, report_data present',
    actual: teeOk ? `MRENCLAVE=${CRYPTO.short(bundle.A_t.MRENCLAVE,12)}` : 'MISSING fields',
    ok: teeOk });

  // 3. AGKD recompute
  let agkdExp = null, agkdOk = false;
  if (bundle.vk_prev && bundle.A_t && bundle.manifest?.predicate) {
    agkdExp = CRYPTO.agkd(bundle.vk_prev, bundle.A_t, { id:bundle.manifest.predicate });
    agkdOk  = agkdExp === bundle.vk_t;
  }
  fields.push({ field:'vk_t (AGKD)', expected: agkdExp ? CRYPTO.short(agkdExp,14) : 'recompute failed',
    actual: CRYPTO.short(bundle.vk_t,14), ok: agkdOk });

  // 4. Graph hash recompute
  let ghExp = null, ghOk = false;
  if (bundle.GH_prev && bundle.A_t && bundle.pi_t && bundle.vk_t) {
    ghExp = CRYPTO.graphHash(bundle.GH_prev, bundle.A_t, bundle.pi_t, bundle.vk_t);
    ghOk  = ghExp === bundle.GH_t;
  }
  fields.push({ field:'GH_t (Graph Hash)', expected: ghExp ? CRYPTO.short(ghExp,14) : 'recompute failed',
    actual: CRYPTO.short(bundle.GH_t,14), ok: ghOk });

  // 5. Chain advance
  const chainOk = !!(bundle.GH_t && bundle.GH_prev && bundle.GH_t !== bundle.GH_prev);
  fields.push({ field:'Chain Advance', expected:'GH_t ≠ GH_prev',
    actual: chainOk ? 'distinct hashes' : 'GH_t === GH_prev (no advance!)', ok: chainOk });

  // 6. DMS
  const dmsOk = !!(bundle.dms?.commitment?.length === 64 && bundle.dms?.scheduled_next && !bundle.dms?.aborted);
  fields.push({ field:"DMS (F6)", expected:'commitment(64), scheduled_next, not aborted',
    actual: bundle.dms?.aborted ? 'NONCE DESTROYED' : dmsOk ? CRYPTO.short(bundle.dms?.commitment,14) : 'invalid',
    ok: dmsOk });

  // 7. Circuit binding
  if (bundle.real_C_hash && bundle.A_t?.C_hash) {
    const cbOk = bundle.A_t.C_hash === bundle.real_C_hash;
    fields.push({ field:'C_hash (F4)', expected: CRYPTO.short(bundle.real_C_hash,14),
      actual: CRYPTO.short(bundle.A_t.C_hash,14), ok: cbOk });
  }

  // 8. Time oracle
  if (bundle.manifest?.oracle?.tau && bundle.A_t?.tau) {
    const tauOk = bundle.manifest.oracle.tau === bundle.A_t.tau;
    fields.push({ field:'τ_t (F3)', expected: CRYPTO.short(bundle.manifest.oracle.tau,14),
      actual: CRYPTO.short(bundle.A_t.tau,14), ok: tauOk });
  }

  const allOk    = fields.every(f => f.ok);
  const failures = fields.filter(f => !f.ok);

  // Inject-flag causes
  const injected = bundle.faults_injected || {};
  const causeMap = {
    genesis:    { title:'Fraudulent Genesis (F2a)', body:'vk_0 was created without regulator co-signature. The genesis commitment H(TEE_pub ‖ REG_pub ‖ policy ‖ nonce) cannot be verified against the regulator\'s public key.' },
    timestamp:  { title:'Time Rollback (F3)', body:'τ_t does not match current NIST Randomness Beacon round. The attacker injected a backdated time anchor to replay a previously-compliant state.' },
    circuit:    { title:'Circuit Substitution (F4)', body:'A_t.C_hash ≠ H(registered_circuit_bytecode). The compliance circuit was swapped at runtime. The TEE attestation binds C_hash — any substitution is immediately detectable.' },
    epochSkip:  { title:'Registry Gap (F2b)', body:'Epoch number is missing from the append-only regulator registry. A gap at position N is cryptographic proof that epoch N was suppressed — it is impossible to hide non-compliant periods.' },
    fakeProof:  { title:'Fake Attestation (F1/F4)', body:'A_t.MRENCLAVE does not match the trusted hardware registry. The attestation quote was not produced by genuine trusted hardware and cannot be accepted.' },
    dmsAbort:   { title:'Dead Man\'s Switch Abort (F6)', body:'The forward nonce nonce_{t+1} was destroyed when the TEE was forcibly shut down. The commitment Com_t is now unprovable — forced silence becomes cryptographic evidence of interference.' },
    tamperHash: { title:'Graph Hash Tamper (F1)', body:'GH_prev was corrupted before computing GH_t. The recursive chain link H(GH_{t-1} ‖ A_t ‖ π_t ‖ vk_t) now points to a tampered history. Any verifier recomputing GH_t from scratch will detect the mismatch immediately.' },
  };

  const activeCauses = Object.entries(injected).filter(([k,v]) => v && causeMap[k]);

  const tableRows = fields.map(f => `
    <tr>
      <td class="ft-field">${f.field}</td>
      <td class="ft-expect" title="${f.expected}">${f.expected}</td>
      <td class="ft-actual" title="${f.actual}">${f.actual}</td>
      <td class="ft-status ${f.ok?'ok':'fail'}">${f.ok?'✓':'✗'}</td>
    </tr>`).join('');

  const causeHtml = activeCauses.length ? activeCauses.map(([k]) => {
    const c = causeMap[k];
    return `<div class="ft-cause fail">
      <div class="ft-cause-title fail">✗ ROOT CAUSE: ${c.title}</div>
      <div class="ft-cause-body">${c.body}</div>
    </div>`;
  }).join('') : (allOk ? `<div class="ft-cause ok">
    <div class="ft-cause-title ok">✓ No attacks injected — all fields verified from bundle alone</div>
    <div class="ft-cause-body">The verifier derived all expected values independently and confirmed every field. This bundle is genuine.</div>
  </div>` : `<div class="ft-cause fail">
    <div class="ft-cause-title fail">✗ Cryptographic mismatch detected</div>
    <div class="ft-cause-body">One or more fields failed independent recomputation. See table above for which fields diverge from expected values.</div>
  </div>`);

  const implHtml = !allOk ? `<div class="ft-implication">
    ⚠ Security Implication: ${failures.map(f => f.field).join(', ')} ${failures.length===1?'is':'are'} invalid.
    ${failures.some(f=>f.field.includes('GH')) ? 'The recursive hash chain is broken — chain history cannot be trusted.' : ''}
    ${failures.some(f=>f.field.includes('vk')) ? 'Key derivation chain is broken — all downstream epochs are invalidated.' : ''}
    ${failures.some(f=>f.field.includes('C_hash')) ? 'The compliance circuit binding is broken — proof may have been generated with a different (lax) circuit.' : ''}
    ${failures.some(f=>f.field.includes('τ')) ? 'Time anchor is invalid — the proof may have been generated at a different point in time (replay attack).' : ''}
  </div>` : '';

  out.innerHTML = `
    <div class="ft-header">
      <div class="ft-ep ${allOk?'valid':'invalid'}">
        ${allOk ? '✓ BUNDLE VALID' : `✗ INVALID — Epoch ${epoch}`}
      </div>
      <div class="ft-sub">
        ${fields.filter(f=>f.ok).length}/${fields.length} checks passed
        · Verify time: ${res.elapsed_ms}ms
        · ${allOk ? 'O(1) independent verification complete' : failures.length + ' field(s) failed'}
      </div>
    </div>
    <table class="ft-table">
      <thead><tr><th>Field</th><th>Expected</th><th>Actual</th><th>Status</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${causeHtml}
    ${implHtml}`;
}

// ── MULTI-INSTITUTION ────────────────────────────────
const MI_INSTITUTIONS = [
  { id:'BANK_001',     name:'Global Investment Bank', pred:'solvency', tee:'sgx',  color:'var(--blue)',   predName:'Basel III Solvency' },
  { id:'EXCHANGE_002', name:'Crypto Exchange Ltd.',   pred:'sanctions',tee:'sev',  color:'var(--purple)', predName:'AML Sanctions' },
  { id:'FUND_003',     name:'Meridian Hedge Fund',    pred:'var',      tee:'tz',   color:'var(--cyan)',   predName:'VaR Limit' },
];

let miState = {}; // { instId: { engine, gen, round, log, attacks } }
let miRegLog = [];
let miRound  = 0;

function multiInitAll() {
  miState = {};
  miRegLog = [];
  miRound = 0;
  MI_INSTITUTIONS.forEach(inst => {
    // Each institution gets its own independent ENGINE clone (we simulate via separate state objects)
    miState[inst.id] = {
      inst, round: 0, log: [], attacks: {},
      chain: [], genesis: null, ready: false,
    };
    const s = miState[inst.id];
    // Build genesis
    const instObj = { id: inst.id, name: inst.name };
    instObj.mrenclave = CRYPTO.H('MRENCLAVE_V1', inst.id, ENGINE.PRED[inst.pred].circuit);
    s.real_C_hash = CRYPTO.H('CIRCUIT_BYTES_V1', ENGINE.PRED[inst.pred].circuit, inst.id);
    s.genesis = CRYPTO.genesis(instObj, { id:'REG_CENTRAL_AUTHORITY', name:'Central Authority' }, ENGINE.PRED[inst.pred]);
    s.vk_cur  = s.genesis.vk_0;
    s.GH_cur  = s.genesis.GH_0;
    s.ready   = true;
    s.log.push({ text:`Genesis established. vk_0=${CRYPTO.short(s.genesis.vk_0,10)}`, ok:true });
  });
  document.getElementById('miBtnRun').disabled   = false;
  document.getElementById('miBtnBatch').disabled = false;
  document.getElementById('miReg').style.display = 'block';
  document.getElementById('miStatus').textContent = 'All 3 institutions initialized. Ready to run epoch rounds.';
  renderMultiGrid();
}

function miRunEpochFor(instId) {
  const s = miState[instId];
  if (!s?.ready) return null;
  const inst  = s.inst;
  const pred  = ENGINE.PRED[inst.pred];
  const epoch = s.round + 1;
  const oracle = CRYPTO.timeOracle(epoch);
  const nonce  = CRYPTO.rnd(32);
  const tau    = s.attacks.timestamp
    ? CRYPTO.H('BACKDATED', String(epoch-10))
    : oracle.tau;
  const C_hash = s.attacks.circuit
    ? CRYPTO.H('SUBST_CIRCUIT', CRYPTO.rnd(4))
    : s.real_C_hash;
  const mrenclave = s.attacks.fakeProof
    ? CRYPTO.H('SPOOFED_MRENCLAVE', CRYPTO.rnd(8))
    : CRYPTO.H('MRENCLAVE_V1', instId, pred.circuit);
  const A_t = CRYPTO.attest({ MRENCLAVE:mrenclave, C_hash, policy:pred, tau, nonce, epoch, tee_type:ENGINE.TEE[inst.tee] });
  const pi_t = CRYPTO.zkprove({ x_t:CRYPTO.rnd(32), w_t:CRYPTO.rnd(32), C_hash, policy:pred, epoch });
  const vk_t = CRYPTO.agkd(s.vk_cur, A_t, pred);
  const GH_t = s.attacks.tamperHash
    ? CRYPTO.H('TAMPERED', s.GH_cur, CRYPTO.rnd(4))
    : CRYPTO.graphHash(s.GH_cur, A_t, pi_t, vk_t);
  const dms_t = CRYPTO.dms(GH_t, Date.now()+30*24*3600*1000);
  const faultLog = [];
  if (s.attacks.timestamp)  faultLog.push('TIMESTAMP_FAULT: τ_t mismatch');
  if (s.attacks.circuit)    faultLog.push('CIRCUIT_SUBSTITUTION: C_hash mismatch');
  if (s.attacks.fakeProof)  faultLog.push('FAKE_ATTESTATION: MRENCLAVE mismatch');
  if (s.attacks.tamperHash) faultLog.push('HASH_TAMPER: GH_prev corrupted');
  const valid = faultLog.length === 0;
  const bundle = { epoch, pi_t, A_t, vk_t, GH_t, vk_prev:s.vk_cur, GH_prev:s.GH_cur,
    manifest:{ epoch, institution:instId, institution_name:inst.name, predicate:pred.id,
      tee_type:ENGINE.TEE[inst.tee], oracle, timestamp:A_t.timestamp },
    dms:dms_t, faults_injected:{...s.attacks}, verification:{valid, faultLog} };
  if (valid) { s.vk_cur = vk_t; s.GH_cur = GH_t; }
  s.round++;
  s.chain.push(bundle);
  s.log.push({ text:`E${epoch}: ${valid ? '✓ PASS' : '✗ FAIL — '+faultLog[0]}`, ok:valid });
  return bundle;
}

async function multiRunRound() {
  if (!Object.keys(miState).length) { multiInitAll(); }
  miRound++;
  MI_INSTITUTIONS.forEach(inst => {
    const b = miRunEpochFor(inst.id);
    if (b) {
      miRegLog.push({
        round: miRound, instId: inst.id, instName: inst.name,
        pred: ENGINE.PRED[inst.pred].name, status: b.verification.valid,
        GH_t: b.GH_t, tee: ENGINE.TEE[inst.tee],
        attacks: Object.keys(b.faults_injected).filter(k=>b.faults_injected[k]).join(', ')||'—'
      });
    }
  });
  document.getElementById('miStatus').textContent = `Round ${miRound} complete. ${miRegLog.length} total registry entries.`;
  renderMultiGrid();
  renderMiRegistry();
}

async function multiRunBatch(n) {
  for (let i = 0; i < n; i++) { await multiRunRound(); await wait(60); }
}

function multiReset() {
  miState = {}; miRegLog = []; miRound = 0;
  document.getElementById('miBtnRun').disabled   = true;
  document.getElementById('miBtnBatch').disabled = true;
  document.getElementById('miReg').style.display = 'none';
  document.getElementById('miStatus').textContent = '';
  renderMultiGrid(true);
}

function toggleMiAttack(instId, atk) {
  if (!miState[instId]) return;
  const s = miState[instId];
  s.attacks[atk] = !s.attacks[atk];
  renderMultiGrid();
}

function renderMultiGrid(empty) {
  const grid = document.getElementById('multiInstGrid');
  if (!grid) return;
  if (empty || !Object.keys(miState).length) {
    grid.innerHTML = `<div style="grid-column:1/-1;font-family:var(--mono);font-size:11px;color:var(--txt3);
      text-align:center;padding:30px;border:1px dashed var(--bdr);border-radius:var(--rad)">
      Click "Initialize All Institutions" to start.</div>`;
    return;
  }
  grid.innerHTML = MI_INSTITUTIONS.map(inst => {
    const s = miState[inst.id];
    if (!s) return '';
    const total    = s.chain.length;
    const compliant= s.chain.filter(b=>b.verification.valid).length;
    const violations = total - compliant;
    const lastOk   = s.chain.length ? s.chain[s.chain.length-1].verification.valid : true;
    const badges   = s.chain.slice(-16).map(b =>
      `<div class="mi-ep ${b.verification.valid?'ok':'fail'}" title="E${b.epoch}">${b.verification.valid?'✓':'✗'}</div>`
    ).join('');
    const atkBtns  = ['timestamp','circuit','fakeProof','tamperHash'].map(atk => {
      const armed = !!s.attacks[atk];
      const labels = { timestamp:'Time Rollback', circuit:'Circuit Sub.', fakeProof:'Fake Attest.', tamperHash:'Tamper Hash' };
      return `<button class="mi-atk-btn ${armed?'armed':''}" onclick="toggleMiAttack('${inst.id}','${atk}')"
        title="${armed?'ARMED — click to disarm':'Click to arm attack'}">
        ${armed?'⚡ ':''}${labels[atk]}</button>`;
    }).join('');
    const logHtml = s.log.slice(-5).map(l =>
      `<div class="${l.ok?'mi-log-ok':'mi-log-fail'}">${l.text}</div>`).join('');
    return `
      <div class="mi-card ${lastOk?'':'attack'}" style="border-color:${!lastOk?'var(--red)':''}">
        <div class="mi-hdr">
          <div class="mi-name" style="color:${inst.color}">${inst.name}</div>
          <div class="mi-badge ${lastOk?'ok':'fail'}">${lastOk?'COMPLIANT':'VIOLATION'}</div>
        </div>
        <div class="mi-body">
          <div class="mi-chain">${badges || '<span style="font-family:var(--mono);font-size:9px;color:var(--txt3)">No epochs yet</span>'}</div>
          <div class="mi-stats">
            <div class="mi-stat"><span class="mi-sv">${total}</span><span class="mi-sl">Epochs</span></div>
            <div class="mi-stat"><span class="mi-sv" style="color:var(--green)">${compliant}</span><span class="mi-sl">Passed</span></div>
            <div class="mi-stat"><span class="mi-sv" style="color:${violations>0?'var(--red)':'var(--txt3)'}">${violations}</span><span class="mi-sl">Failed</span></div>
          </div>
          <div style="font-family:var(--mono);font-size:9px;color:var(--txt3);margin-bottom:6px">ARM ATTACKS:</div>
          <div class="mi-attacks">${atkBtns}</div>
          <div class="mi-log">${logHtml || '<span style="opacity:.4">No log yet</span>'}</div>
        </div>
      </div>`;
  }).join('');
}

function renderMiRegistry() {
  const tbody = document.getElementById('miRegTbody');
  if (!tbody) return;
  tbody.innerHTML = miRegLog.slice(-20).reverse().map(r => `
    <tr>
      <td>${r.round}</td>
      <td style="font-family:var(--mono);font-size:9px">${r.instName}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--txt3)">${r.pred}</td>
      <td class="${r.status?'reg-st-ok':'reg-st-bad'}">${r.status?'✓ PASS':'✗ FAIL'}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--cyan)">${CRYPTO.short(r.GH_t,12)}</td>
      <td style="font-family:var(--mono);font-size:9px;color:var(--txt3)">${r.tee}</td>
      <td style="font-family:var(--mono);font-size:9px;color:${r.attacks!=='—'?'var(--red)':'var(--txt3)'}">
        ${r.attacks}
      </td>
    </tr>`).join('');
}

// ── STEP MODE HOOK into runEpoch ────────────────────
// Wrap the existing runEpoch to support step-by-step
const _origRunEpochV5 = runEpoch;
window.runEpoch = async function(silent) {
  if (!stepModeOn || silent) {
    return _origRunEpochV5.call(this, silent);
  }
  // Step mode: begin phases, defer bundle generation
  const btn = document.getElementById('runBtn');
  btn.disabled = true; btn.textContent = '⏳ Step mode…';
  stepCurrentIdx = -1;
  renderStepTrack(0);

  // We run the actual epoch immediately (crypto is fast) but reveal it phase by phase
  const instKey = document.getElementById('selInst').value;
  const predKey = document.getElementById('selPred').value;
  const teeKey  = document.getElementById('selTEE').value;
  const k       = parseInt(document.getElementById('selEpochSize')?.value||24);
  ENGINE.setFaults(activeFaults);
  if (!sessionInitialized) {
    ENGINE.init(instKey, predKey, teeKey);
    sessionInitialized = true;
  }
  const bundle = ENGINE.runEpoch(k);
  curBundle = bundle;
  tclear();
  tlog(`[STEP MODE] Epoch ${bundle.epoch} computed — advancing through phases…`, 'tl-auto');

  await beginStepEpoch(async () => {
    // Completion callback — reveal the bundle
    tlog(`✓ EPOCH ${bundle.epoch} COMPLETE — chain depth: ${ENGINE.chainLength()}`, bundle.verification.valid?'tl-ok':'tl-err');
    renderBundleCard(bundle);
    renderChain();
    renderTimeline();
    onMrkChange();
    updateDashboard(bundle);
    renderAttackResult(bundle);
    btn.disabled = false;
    btn.innerHTML = '▶ &nbsp;Generate Epoch';
    setTEE(true, `TEE ACTIVE · Chain depth: ${ENGINE.chainLength()}`);
  });
  // Log each phase as we go
  STEP_PHASES.forEach((p,i) => {
    const stepLogs = {
      oracle: `  τ_t = ${CRYPTO.short(bundle.oracle?.tau,22)}`,
      circuit:`  C_hash = ${CRYPTO.short(bundle.A_t?.C_hash,22)}`,
      attest: `  A_t quote = ${CRYPTO.short(bundle.A_t?.quote,22)}`,
      zkp:    `  π_t proof_a = ${CRYPTO.short(bundle.pi_t?.proof_a,22)}`,
      agkd:   `  vk_t = ${CRYPTO.short(bundle.vk_t,22)}`,
      graph:  `  GH_t = ${CRYPTO.short(bundle.GH_t,22)}`,
      dms:    `  DMS = ${CRYPTO.short(bundle.dms?.commitment,22)}`,
      bundle: `  B_t = { π_t, A_t, vk_t, GH_t, manifest }`,
    };
  });
};

// ── HOOK renderBundleCard for timeline ──────────────
const _rbcOrig = window.renderBundleCard || renderBundleCard;
window.renderBundleCard = function(b) {
  _rbcOrig(b);
  renderTimeline();
  updateChart(b);
};

