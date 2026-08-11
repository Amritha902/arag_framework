# ARAG — narration scripts

**Read this first.**

Don't read these out word for word. Read a section, look away, then say it in your
own words. Your version will be better than mine because it'll sound like you.
Stumbling, saying "um", restarting a sentence — all of that is fine and actually
helps. A perfectly smooth read is the thing that sounds fake.

Rough pace: about 140 words a minute. Times below are approximate.

Record on your phone in a quiet room, or use OBS / QuickTime / the Xbox Game Bar
(Win+G) to record voice over the video playing full screen.

---

# VIDEO 1 — "What is ARAG?" (explainer, ~4:40)

### Title slide (~0:00–0:12)

> Hi, I'm Amritha. This is ARAG — Adaptive Recursive Attestation Graph. It's the
> system I've been building with Yugeshwaran, under Dr. Sritama Roy. I'll explain
> what problem it solves and how it works.

### The problem (~0:12–0:35)

> So the problem we started with is this. Banks, crypto exchanges, hedge funds —
> they all have to prove to a regulator that they followed the rules. Capital
> above eight percent, every customer screened against sanctions lists, risk
> limits not breached.
>
> And the way they prove it today is they hand over their data. Auditors come in
> and go through customer records, positions, balances.

### Three things wrong (~0:35–1:05)

> There are three problems with that.
>
> First, that data is sensitive. Proving you followed a rule shouldn't mean
> exposing all your customers.
>
> Second, an audit is a snapshot. It tells you what was true in March. It doesn't
> tell you what was true last Tuesday.
>
> And third, it runs on trust. Records can be edited before anybody looks at them.
>
> So what we wanted was a way to prove compliance continuously, without showing
> the data, where cheating actually gets caught.

### Why existing tools don't work (~1:05–1:40)

> The obvious question is why not just use something that already exists. We
> looked at three things.
>
> Secure hardware — TEEs, like Intel SGX. It runs your code in a sealed enclave
> and signs a report saying it wasn't tampered with. But it only proves that
> *an* enclave ran. It doesn't prove which program was inside it.
>
> Zero-knowledge proofs. These prove a statement is true without revealing the
> data. But a proof on its own doesn't tell you that real hardware, on real data,
> produced it. Someone could just make it up.
>
> And blockchains. They prove a record existed and wasn't changed. But they only
> prove what was written down. They say nothing about what was left out.

### Our idea (~1:40–2:10)

> So our idea was to chain them together, epoch by epoch.
>
> We split time into epochs. In each epoch the enclave checks the rule on
> encrypted data, makes a zero-knowledge proof, and gets the hardware to sign
> exactly what it ran.
>
> And then the important bit — we hash that result together with the previous
> epoch's hash. So every epoch is welded onto the one before it.

### Why chaining matters (~2:10–2:35)

> Why does that matter? Because if you go back and change any epoch, every hash
> after it stops matching. You can't quietly rewrite history.
>
> We do the same thing with the verification key. And we derive that key from
> the hardware attestation itself. So if you fake an attestation you get a broken
> key, and a broken key breaks every epoch after it. That's the part we call AGKD.

### Figure 1 (~2:35–2:50)

> This is the whole system. Institution on the left, regulator on the right, and
> the epoch chain running along the bottom.

### One epoch (~2:50–3:15)

> These are the eight steps that happen in every epoch. Take the time from the
> NIST beacon and a Bitcoin block so the timestamp can't be faked. Hash the
> compliance program itself. Have the hardware sign all of it together. Generate
> the proof — it comes to a hundred and ninety-two bytes. Derive the new key,
> fold everything into the previous hash, seal a commitment for the next epoch,
> and send the bundle to the regulator.

### Figure 2 (~3:15–3:25)

> That's the key derivation and the recursive hash drawn out across three epochs.

### The hard part (~3:25–3:50)

> Honestly, this next part is what took us the longest.
>
> Once you combine hardware attestation, zero-knowledge proofs and a recursive
> chain, you get attacks that none of the three has to worry about on its own.
> Working those out and closing each one is most of what the patent covers.
> There are eight mechanisms, and each one exists because of a specific attack.

### The attack table (~3:50–4:10)

> So — starting your own fake chain, that's stopped by requiring the regulator to
> co-sign genesis. Backdating a proof is stopped by anchoring time to the NIST
> beacon. Swapping in an easier program is caught because the program's hash is
> signed into the attestation. Skipping a bad epoch shows up because the registry
> is append-only, so the gap itself is the evidence. And so on — seven attacks,
> seven answers.

### Proof-of-Silence (~4:10–4:30)

> This one is the part I think is most novel.
>
> Every system we found in the literature proves that something *happened*. A
> transaction, a block, a signature. We wanted to prove that something *didn't*
> happen. That no violation occurred at any point in the window — across every
> sub-epoch in it. Not a sample of them. All of them.

### Cost + applications + close (~4:30–end)

> The nice property is verification doesn't grow. Checking epoch ten thousand is
> the same work as checking epoch three, and either way the verifier learns
> nothing about the data.
>
> We're aiming this at banks, exchanges and funds first, but it applies anywhere
> a rule has to be proven continuously — emissions caps, clinical trials, supply
> chains.
>
> So in short: ARAG lets an institution prove it followed the rules, continuously,
> without revealing anything — and prove that it never broke them. Thanks.

---

# VIDEO 2 — working demo (~5:40)

### Opening (~0:00–0:10)

> This is ARAG actually running. Everything you see here is computed live in the
> browser — none of the hashes or proofs are pre-recorded.

### Mechanisms (~0:10–0:35)

> These are the eight mechanisms. They're grouped into trust initialisation,
> temporal integrity, execution authenticity and continuous compliance. Each one
> is here because of a specific attack.

### Setup + step mode (~0:35–1:00)

> I'll set it up as a bank running Basel III solvency on Intel SGX. And I'll turn
> on step mode so we can walk through one epoch phase by phase instead of it all
> happening at once.

### The eight phases (~1:00–2:00)

Narrate as each step highlights — one line each, don't rush:

> First the time oracle — NIST beacon plus a Bitcoin block hash. The institution
> can't choose this value.
>
> Then it hashes the compliance circuit itself, inside the enclave, before running it.
>
> Now the hardware attestation — it signs the enclave ID, the circuit hash, the
> policy and the time, all together.
>
> The prover runs. That's the Groth16 proof, a hundred and ninety-two bytes.
>
> Key derivation — new key from the old key plus this attestation.
>
> The recursive graph hash. This is the one that makes history tamper-evident.
>
> The dead man's switch — sealing a commitment to the next epoch's secret.
>
> And the bundle gets packaged and committed to the registry.

### Chain (~2:00–2:25)

> I'll run three more epochs. Each one takes the previous hash and key as input.
> And you can see the chain here — genesis through epoch four.

### Verification (~2:25–2:45)

> This is the verifier. It only gets the bundle, nothing else. Nine checks, all
> passing, under a millisecond — and notice it never walks the chain. That's the
> constant-time property.

### Attacks (~2:45–4:15)

Say the attack name, let it run, then say what caught it:

> Now I'll attack it. Seven attacks, one at a time, and the system isn't told
> which one is on.
>
> Time rollback — a backdated timestamp to replay a day that passed. Caught,
> because it doesn't match the NIST beacon round.
>
> Circuit substitution — swapping the compliance program for an easier one.
> Caught, the program hash doesn't match the registered one.
>
> Fake attestation — no real hardware behind it. Caught, the enclave ID isn't in
> the trusted registry.
>
> Fraudulent genesis — starting a separate chain without the regulator. Caught,
> there's no co-signature.
>
> Missing epoch — leaving out the one that failed. Caught, the registry is
> append-only so the gap is the evidence.
>
> Dead man's switch abort — shutting it down so no proof gets made. Caught, the
> sealed secret is destroyed.
>
> And tampering with an earlier hash to edit history. Caught, recomputing the
> chain doesn't match.

### Failure trace (~4:15–4:35)

> This is the auditor's view. It re-derives the key and the hash from the bundle
> independently and compares field by field, then maps each failure back to the
> attack that explains it.

### Silence + Merkle (~4:35–5:00)

> Proof-of-Silence — proving no violation across the whole window, not at sampled
> points.
>
> And the range proof, so a regulator can audit epochs i to j without touching
> the rest of the chain.

### Multi-institution (~5:00–5:30)

> Last thing — three institutions running at once. Different rules, different TEE
> vendors, one shared registry. I'll arm circuit substitution on the crypto
> exchange only. And you can see only that one fails — the bank and the fund keep
> verifying. A compromise doesn't spread.

### Close (~5:30–end)

> So that's it. Eight mechanisms, seven attacks all caught, verification that
> stays constant however long the chain gets, and none of the underlying data
> disclosed at any point. Thanks for watching.
