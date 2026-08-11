# ARAG — full narration scripts

Two scripts. **Record them as two separate audio files.**

---

## HOW TO RECORD (read this to whoever is narrating)

**Format:** MP3, WAV or M4A. Phone voice-recorder is fine.

**Room:** anywhere quiet. No fan, no AC, windows shut. Hold the phone about
20 cm away and slightly off to the side of the mouth, not straight in front
(that causes popping on "p" and "b" sounds).

**The one rule that matters:**
Each section below is numbered — [1], [2], [3] and so on. **Pause for about
2 seconds of silence between sections.** Just stop, breathe, then start the
next one. Those silences are how the sections get separated for editing.

**Do not try to match the video length.** Read at a comfortable pace and take
as long as each section takes. The video gets re-timed to fit the narration,
not the other way round.

**Mistakes:** if a sentence goes wrong, pause, then say the whole sentence
again from the start. The bad take gets cut. Don't restart the section.

**Tone:** explaining to a colleague, not presenting at a conference. Normal
speaking pace. A little warmth is good. Don't over-enunciate.

**Send back:** two files, named so it's obvious which is which —
`explainer.mp3` and `demo.mp3`.

---
---

# SCRIPT 1 — EXPLAINER
*16 sections · roughly 4 to 5 minutes*

---

**[1]**

This is ARAG — Adaptive Recursive Attestation Graph. It's a system for proving
that a financial institution followed the rules, without that institution having
to hand over any of its data. It's patent pending, developed at VIT Chennai by
Amritha S and Yugeshwaran P, supervised by Dr. Sritama Roy.

---

**[2]**

Let's start with the problem.

Banks, crypto exchanges and hedge funds all have to prove to a regulator that
they followed the rules. Capital above eight percent. Every customer screened
against sanctions lists. Risk limits not breached.

The way they prove it today is by handing over the data. Auditors come in and go
through customer records, positions and balances.

---

**[3]**

There are three problems with that.

First, that data is sensitive. Proving you followed a rule shouldn't mean
exposing all of your customers.

Second, an audit is a snapshot. It tells you what was true in March. It doesn't
tell you what was true last Tuesday.

And third, it runs on trust. Records can be edited before anybody looks at them.

So the goal was a way to prove compliance continuously, without showing the data,
where cheating actually gets caught.

---

**[4]**

The obvious question is: why not use something that already exists? Three things
come close, and each one falls short.

Secure hardware — trusted execution environments, like Intel SGX. These run your
code inside a sealed enclave and sign a report saying it wasn't tampered with.
But that only proves an enclave ran. It doesn't prove which program was inside it.

Zero-knowledge proofs. These prove a statement is true without revealing the data
behind it. But a proof on its own doesn't tell you that real hardware, working on
real data, produced it.

And blockchains. They prove a record existed at a point in time and wasn't
changed afterwards. But they only prove what was written down. They say nothing
about what was deliberately left out.

---

**[5]**

So the idea behind ARAG is to chain them together, epoch by epoch.

Time is split into epochs. In each epoch, the institution's secure enclave checks
the rule against encrypted data, produces a zero-knowledge proof, and gets the
hardware to sign exactly what it ran.

And then the important step — that result is hashed together with the previous
epoch's hash. Every epoch is welded onto the one before it.

---

**[6]**

Why does that matter?

Because if you go back and change any epoch, every hash after it stops matching.
You cannot quietly rewrite history.

The same thing is done with the verification key, and that key is derived from
the hardware attestation itself. So a faked attestation gives you a broken key,
and a broken key breaks every epoch that follows. That mechanism is called AGKD —
attestation-gated key derivation.

---

**[7]**

This is the full system. The institution is on the left, the regulator on the
right, and the recursive epoch chain runs along the bottom.

---

**[8]**

Here is what happens inside a single epoch. Eight steps.

Take the time from the NIST randomness beacon and the latest Bitcoin block hash,
so the timestamp can't be faked.

Hash the compliance program itself, inside the enclave, before running it.

Have the hardware sign the enclave identity, that program hash, the policy and
the time — all together.

Generate the zero-knowledge proof that the rule held. It comes to a hundred and
ninety-two bytes.

Derive the new verification key from the old key plus this attestation.

Fold everything into the previous epoch's hash.

Seal a commitment to the next epoch's secret, so shutting the system down leaves
a mark.

And package it all into one bundle, which goes to the regulator's registry.

---

**[9]**

This diagram shows the key derivation and the recursive hash drawn out across
three consecutive epochs.

---

**[10]**

Now, the part that took the longest.

Once you combine hardware attestation, zero-knowledge proofs and a recursive
chain, you get attacks that none of the three has to worry about on its own.
Working those out and closing each one is most of what the patent covers. There
are eight mechanisms, and each one exists because of a specific attack.

---

**[11]**

Here are those attacks and what stops them.

Starting your own fake chain from scratch — stopped by requiring the regulator to
co-sign the genesis state.

Backdating a proof to replay a day you passed — stopped by anchoring time to the
NIST beacon and a Bitcoin block.

Swapping in an easier compliance program — caught, because the program's hash is
signed into the attestation.

Skipping the epoch where you failed — caught, because the registry is append-only,
so the gap itself is the evidence.

Faking an attestation with no real hardware — caught, because the enclave identity
is checked against a trusted registry.

Shutting the machine down so no proof gets made — caught, because a sealed secret
dies with it, which makes the silence provable.

And editing an older hash to rewrite history — caught, because recomputing the
chain no longer matches.

---

**[12]**

This next one is the most novel part.

Every system in the literature proves that something happened — a transaction, a
block, a signature.

ARAG proves that something did not happen. That no violation occurred at any
point in the window, across every single sub-epoch in it. Not a sample of them.
All of them. That's what Proof-of-Silence means.

---

**[13]**

This shows the sub-epoch state machine behind Proof-of-Silence, and the Merkle
tree that lets a regulator audit any slice of the chain on its own.

---

**[14]**

One more useful property: verification doesn't grow.

Checking epoch ten thousand takes exactly the same work as checking epoch three.
Each proof is a hundred and ninety-two bytes, the chain can run indefinitely, and
either way the verifier learns nothing at all about the underlying data.

---

**[15]**

The first targets are banks, exchanges and funds — Basel III capital rules,
sanctions screening, risk limits.

But it applies anywhere a rule has to be proven continuously. Emissions caps.
Clinical trial protocols. Supply chain provenance. Data residency guarantees.

---

**[16]**

So, in short. ARAG lets an institution prove it followed the rules — continuously,
cheaply, and without revealing anything — and prove that it never broke them.

Thank you.

---
---

# SCRIPT 2 — DEMO
*15 sections · roughly 5 minutes*

---

**[1]**

This is ARAG actually running. Everything shown here is computed live in the
browser by the code in the repository. None of the hashes or proofs are
pre-recorded.

---

**[2]**

These are the eight mechanisms behind the system, grouped into trust
initialisation, temporal integrity, execution authenticity and continuous
compliance. Each one is here because of a specific attack it closes.

---

**[3]**

The run is set up as a global investment bank, checking Basel III solvency, on
Intel SGX hardware. Step mode is switched on, so a single epoch can be walked
through phase by phase instead of running all at once.

---

**[4]**

First, the time oracle. The NIST randomness beacon, combined with the latest
Bitcoin block hash. The institution cannot choose or influence this value.

Next, circuit attestation. The compliance program itself is hashed, inside the
enclave, before it runs.

Then the hardware attestation. The enclave identity, the program hash, the policy
and the time are all signed together.

---

**[5]**

The prover runs next. That's the Groth16 zero-knowledge proof, a hundred and
ninety-two bytes, generated over encrypted data. The sub-epoch silence check runs
at the same time.

Then key derivation. The new verification key comes from the previous key
combined with this attestation.

Then the recursive graph hash. This is the step that makes the entire history
tamper-evident.

---

**[6]**

The dead man's switch seals a commitment to the next epoch's secret, so a forced
shutdown becomes visible.

And finally everything is packaged into one portable proof bundle and committed
to the regulator's registry. That's one complete epoch.

---

**[7]**

Now three more epochs are generated normally. Each one takes the previous hash
and the previous key as its input.

And this is the chain — genesis through epoch four. Every node carries its own
attestation, its own proof, and its own derived key.

---

**[8]**

This is the independent verifier. It receives the bundle and nothing else. It
re-derives every field from scratch and checks them.

Nine checks, all passing, in well under a millisecond. And notice it never walks
the chain. That's the constant-time property — verification cost doesn't depend on
how long the chain is.

---

**[9]**

Now the system gets attacked. Seven attacks, armed one at a time. The system is
never told which attack is active — it simply re-derives everything and reports
what doesn't match.

---

**[10]**

Time rollback. A backdated timestamp, to replay a day that already passed.
Caught — the timestamp doesn't match the NIST beacon round.

Circuit substitution. Swapping the compliance program at runtime for a more
lenient one. Caught — the program hash doesn't match the registered one.

Fake attestation. A synthetic attestation with no real hardware behind it.
Caught — the enclave identity isn't in the trusted registry.

---

**[11]**

Fraudulent genesis. Starting an entirely separate chain without the regulator
knowing. Caught — there's no regulator co-signature on the first key.

Missing epoch. Leaving out the epoch that failed, so the regulator never sees it.
Caught — the registry is append-only, so the gap itself is the evidence.

Dead man's switch abort. Shutting the enclave down so no proof is ever produced.
Caught — the sealed forward secret is destroyed, which makes the silence provable.

And tampering with an earlier hash, to rewrite history. Caught — recomputing the
chain from the bundle no longer matches.

---

**[12]**

This is the failure trace analyser — the auditor's view. It independently
re-derives the key and the hash from the bundle, compares every field, and maps
each failure back to the exact attack that explains it.

---

**[13]**

Proof-of-Silence. This generates a proof that no violation occurred across the
entire window, not just at sampled points.

And the range proof, built on a Merkle tree, which lets a regulator audit epochs
i through j without touching the rest of the chain.

---

**[14]**

Finally, three institutions running at the same time. Different compliance rules,
different TEE vendors, one shared regulator registry.

Circuit substitution is armed on the crypto exchange only. And when the round
runs, only that institution fails. The bank and the hedge fund keep verifying
normally. A compromise in one place does not spread across the registry.

---

**[15]**

So that's the system. Eight mechanisms, seven attack vectors all detected,
verification that stays constant however long the chain grows, and none of the
underlying data disclosed at any point.

Thank you for watching.

---
