// ── ARAG Crypto Utilities (browser-native, no dependencies) ──

const CRYPTO = (() => {

  // Pure-JS SHA-256
  const SHA256 = (() => {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const rotr = (n,b) => (n>>>b)|(n<<(32-b));
    return {
      hash(msg) {
        const m = typeof msg==='string' ? new TextEncoder().encode(msg) : msg;
        const l = m.length;
        const buf = new ArrayBuffer(Math.ceil((l+9)/64)*64);
        const b = new Uint8Array(buf);
        b.set(m); b[l]=0x80;
        new DataView(buf).setUint32(buf.byteLength-4,l*8,false);
        const w32 = new Int32Array(buf);
        let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
        let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
        for(let i=0;i<w32.length;i+=16){
          const w=new Array(64);
          for(let j=0;j<16;j++)w[j]=w32[i+j];
          for(let j=16;j<64;j++){
            const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3);
            const s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);
            w[j]=(w[j-16]+s0+w[j-7]+s1)|0;
          }
          let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
          for(let j=0;j<64;j++){
            const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
            const ch=(e&f)^(~e&g);
            const T1=(h+S1+ch+K[j]+w[j])|0;
            const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
            const maj=(a&b)^(a&c)^(b&c);
            const T2=(S0+maj)|0;
            h=g;g=f;f=e;e=(d+T1)|0;d=c;c=b;b=a;a=(T1+T2)|0;
          }
          h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;
          h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
        }
        return [h0,h1,h2,h3,h4,h5,h6,h7].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
      }
    };
  })();

  const H = (...parts) => SHA256.hash(parts.join('||'));
  const rnd = (n=32) => { const a=new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const short = (h,n=16) => h ? h.slice(0,n)+'…' : '—';

  // TEE Attestation simulation
  function attest({MRENCLAVE, C_hash, policy, tau, nonce, epoch, tee_type='Intel SGX'}) {
    const report_data = H(MRENCLAVE, C_hash, JSON.stringify(policy), tau, nonce, String(epoch));
    return { MRENCLAVE, C_hash, policy_hash:H(JSON.stringify(policy)), tau, nonce,
             report_data, quote:H('TEE_QUOTE', report_data, MRENCLAVE),
             timestamp:Date.now(), tee_type, security_version:'0x0f' };
  }

  // ZKP simulation (Groth16)
  function zkprove({x_t, w_t, C_hash, policy, epoch}) {
    const stmt = H(x_t, C_hash, JSON.stringify(policy), String(epoch));
    return { proof_a:H('G16_A',stmt,rnd(4)), proof_b:H('G16_B',stmt,rnd(4)), proof_c:H('G16_C',stmt,rnd(4)),
             statement_hash:stmt, public_inputs:H(stmt,'PUB'), size_bytes:192 };
  }

  // AGKD
  const agkd = (vk_prev, A_t, policy) => H(vk_prev, A_t.quote, policy.id||JSON.stringify(policy));

  // Recursive graph hash
  const graphHash = (GH_prev, A_t, pi_t, vk_t) => H(GH_prev, A_t.quote, pi_t.proof_a, vk_t);

  // Time oracle (NIST + BTC simulation)
  function timeOracle(epoch) {
    const round = Math.floor(Date.now()/60000)+epoch;
    const nist  = H('NIST_BEACON', String(round));
    const block = 830000+epoch*144;
    const btc   = H('BTC_BLOCK', String(block));
    return { nist_round:round, nist_output:nist, btc_block:block, btc_hash:btc, tau:H(nist,btc) };
  }

  // Dead Man's Switch
  function dms(GH_t, scheduled_next) {
    const nn = rnd(32);
    return { nonce_next:nn, commitment:H(nn,String(scheduled_next),GH_t), scheduled_next };
  }

  // Genesis
  function genesis(institution, regulator, policy) {
    const pHash = H(JSON.stringify(policy));
    const MRENC = H('MRENCLAVE_GENESIS', institution.id, String(Date.now()));
    const tee_pub = H('TEE_PUB', institution.id, rnd(8));
    const reg_pub = H('REG_PUB', regulator.id);
    const nonce   = rnd(32);
    const vk_0    = H(tee_pub, reg_pub, pHash, nonce);
    const A0 = attest({MRENCLAVE:MRENC, C_hash:H('GENESIS_CIRCUIT'), policy:{genesis:true},
                       tau:H('GENESIS_TIME',String(Date.now())), nonce, epoch:0});
    const reg_sig  = H('REG_SIG', A0.quote, vk_0);
    const GH_0     = H(vk_0, A0.quote, reg_sig);
    const cert     = H('GENESIS_CERT', vk_0, GH_0, String(Date.now()));
    return { vk_0, GH_0, genesis_cert:cert, A_genesis:A0, tee_pub, reg_pub, nonce_reg:nonce, MRENCLAVE:MRENC };
  }

  // Merkle tree
  function merkle(leaves) {
    if(!leaves.length) return { root:'', tree:[[]] };
    let layer = leaves.map(l=>H('LEAF',l));
    const tree = [layer.slice()];
    while(layer.length>1){
      const next=[];
      for(let i=0;i<layer.length;i+=2) next.push(H(layer[i], i+1<layer.length?layer[i+1]:layer[i]));
      layer=next; tree.push(layer.slice());
    }
    return { root:layer[0], tree };
  }

  function merkleProof(leaves, idx) {
    const {tree} = merkle(leaves);
    const proof=[]; let i=idx;
    for(let lv=0;lv<tree.length-1;lv++){
      const sib = i%2===0?i+1:i-1;
      if(sib<tree[lv].length) proof.push({hash:tree[lv][sib], dir:i%2===0?'R':'L'});
      i=Math.floor(i/2);
    }
    return proof;
  }

  // Proof-of-Silence state machine
  function silenceMachine({k, violationAt=0}) {
    const states=[]; let cur='COMPLIANT';
    for(let i=1;i<=k;i++){
      const ok = !(violationAt>0 && i===violationAt) && cur==='COMPLIANT';
      if(!ok) cur='VIOLATION';
      states.push({sub:i, ok, state:cur});
    }
    const hashes = states.map(s=>H('R',String(s.sub),String(s.ok)));
    const rec = { k, result_hash:H(...hashes), final_state:cur, states };
    const proof = { valid:cur==='COMPLIANT', proof_hash: cur==='COMPLIANT'?H('SILENCE',rec.result_hash,String(k)):null, statement:`State_${k}==COMPLIANT AND k==${k} AND all TRUE` };
    return { rec, proof };
  }

  return { H, rnd, short, attest, zkprove, agkd, graphHash, timeOracle, dms, genesis, merkle, merkleProof, silenceMachine };
})();
