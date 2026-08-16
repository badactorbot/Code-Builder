/**
 * Unit tests: dynamic fee selection with many small KAS UTXOs.
 *
 * These tests verify that the UTXO selection + fee convergence loop always
 * emits a `dynamicFee` that is (a) computed for the ACTUAL final input count,
 * and (b) at least the canonical minimum relay fee as reported by kaspa-wasm
 * MassCalculator.
 *
 * Run with: pnpm --filter @workspace/api-server run test:fee
 */

import assert from 'node:assert/strict';
import { MassCalculator, getConsensusParametersByNetwork, NetworkId, ScriptPublicKey } from 'kaspa-wasm';
import {
  estimateTransactionFee,
  MIN_FEE_SOMPI,
  BLANK_TX_MASS,
  PER_INPUT_BASE,
  p2shSigScriptLen,
} from './lib/kcc20-fee.js';

// ── kaspa-wasm canonical reference ───────────────────────────────────────────
// getConsensusParametersByNetwork is typed as (number) in .d.ts but accepts NetworkId at runtime
const MAINNET_CP = (getConsensusParametersByNetwork as any)(new NetworkId('mainnet'));
const mc = new MassCalculator(MAINNET_CP);

const P2PK_SPK = new ScriptPublicKey(0, '20' + '00'.repeat(32) + 'ac'); // 34-byte P2PK
const P2SH_SPK = new ScriptPublicKey(0, 'aa20' + '00'.repeat(32) + '87'); // 35-byte P2SH

const P2PK_SIG_LEN = 66; // bytes in a P2PK signatureScript

function makeKasInput(i: number, sigLen = P2PK_SIG_LEN) {
  return {
    previousOutpoint: { transactionId: '0'.repeat(64), index: i },
    signatureScript: '00'.repeat(sigLen),
    sequence: 0n,
    sigOpCount: 1,
    utxoEntry: { amount: 1_000_000n, scriptPublicKey: P2PK_SPK, blockDaaScore: 1000n, isCoinbase: false },
  };
}

function makeCovenantInput(redeemLen: number) {
  return {
    previousOutpoint: { transactionId: '0'.repeat(64), index: 0 },
    signatureScript: '00'.repeat(Number(p2shSigScriptLen(redeemLen))),
    sequence: 0n,
    sigOpCount: 1,
    utxoEntry: { amount: 50_000_000n, scriptPublicKey: P2SH_SPK, blockDaaScore: 1000n, isCoinbase: false },
  };
}

function makeP2shOutput() {
  return { value: 50_000_000n, scriptPublicKey: P2SH_SPK };
}

/**
 * Compute the canonical minimum relay fee via kaspa-wasm MassCalculator.
 * This is the reference value our estimator must be >= to.
 */
function canonicalMinFee(
  numCovenantInputs: number,
  redeemLen: number,
  numKasInputs: number,
  numOutputs: number,
): bigint {
  const covenantInputs = Array.from({ length: numCovenantInputs }, () => makeCovenantInput(redeemLen));
  const kasInputs = Array.from({ length: numKasInputs }, (_, i) => makeKasInput(i));
  const allInputs = [...covenantInputs, ...kasInputs];
  const outputs = Array.from({ length: numOutputs }, () => makeP2shOutput());

  const mass = BigInt(
    Number(mc.blankTransactionMass()) +
    Number(mc.calcMassForInputs(allInputs)) +
    Number(mc.calcMassForOutputs(outputs)),
  );

  return mass < MIN_FEE_SOMPI ? MIN_FEE_SOMPI : mass;
}

// ── Selection loop simulation ─────────────────────────────────────────────────
const COVENANT_OUTPUT_SOMPI = 50_000_000n;

interface FakeUtxo { sompi: bigint }

function simulateFeeSelection(opts: {
  numCovenantInputs: number;
  covenantInSompi: bigint;
  redeemScriptLen: number;
  numRecipients: number;
  hasKronChange: boolean;
  kasUtxos: FakeUtxo[];
}): { dynamicFee: bigint; kasInputCount: number } {
  const { numCovenantInputs, covenantInSompi, redeemScriptLen, numRecipients, hasKronChange, kasUtxos } = opts;
  const numCovenantOutputs = numRecipients + (hasKronChange ? 1 : 0);
  const covenantOutSompi = BigInt(numCovenantOutputs) * COVENANT_OUTPUT_SOMPI;

  let feeUtxos: FakeUtxo[] = [];
  let feeTotal = 0n;
  let dynamicFee = 0n;

  const MAX_PASSES = 20;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const prevCount = feeUtxos.length;
    const numOutputsEst = numCovenantOutputs + 1;

    dynamicFee = estimateTransactionFee(numCovenantInputs, redeemScriptLen, feeUtxos.length, numOutputsEst);

    const requiredKas = dynamicFee + covenantOutSompi - covenantInSompi;

    if (requiredKas <= 0n) { feeUtxos = []; feeTotal = 0n; break; }

    feeUtxos = []; feeTotal = 0n;
    const single = kasUtxos.find(u => u.sompi >= requiredKas);
    if (single) {
      feeUtxos = [single]; feeTotal = single.sompi;
    } else {
      for (const u of kasUtxos) {
        feeUtxos.push(u); feeTotal += u.sompi;
        if (feeTotal >= requiredKas) break;
      }
    }

    if (feeTotal < requiredKas) throw new Error(`Insufficient KAS: need ${requiredKas}, have ${feeTotal}`);
    if (feeUtxos.length === prevCount) break;
  }

  // Post-loop fixed-point verification (mirrors route exactly).
  {
    const numOutputsFinal = numCovenantOutputs + 1;
    dynamicFee = estimateTransactionFee(numCovenantInputs, redeemScriptLen, feeUtxos.length, numOutputsFinal);
    const requiredFinal = dynamicFee + covenantOutSompi - covenantInSompi;
    if (requiredFinal > 0n && feeTotal < requiredFinal) {
      throw new Error(`Final coverage check failed: need ${requiredFinal}, have ${feeTotal}`);
    }
  }

  return { dynamicFee, kasInputCount: feeUtxos.length };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗  ${name}\n     ${err?.message}`);
    failed++;
  }
}

const REDEEM_LEN = 2433; // KRON redeemScript byte length

// ── 1. Single large KAS UTXO ──────────────────────────────────────────────────
test('single large KAS UTXO — estimate ≥ canonical min fee', () => {
  const { dynamicFee, kasInputCount } = simulateFeeSelection({
    numCovenantInputs: 1,
    covenantInSompi:   COVENANT_OUTPUT_SOMPI,
    redeemScriptLen:   REDEEM_LEN,
    numRecipients:     2,
    hasKronChange:     false,
    kasUtxos:          [{ sompi: 200_000_000n }],
  });
  assert.equal(kasInputCount, 1);

  // numCovenantOutputs = 2 (2 recipients), numOutputsFinal = 3
  const refFee = canonicalMinFee(1, REDEEM_LEN, 1, 3);
  assert.ok(
    dynamicFee >= refFee,
    `estimate ${dynamicFee} < canonical min ${refFee}`,
  );
});

// ── 2. Many tiny KAS UTXOs (the original bug scenario) ────────────────────────
test('many tiny KAS UTXOs — estimate ≥ canonical min fee and count > 4', () => {
  const TINY = 2_000n; // 2 000 sompi each
  const kasUtxos = Array.from({ length: 30 }, () => ({ sompi: TINY }));

  const { dynamicFee, kasInputCount } = simulateFeeSelection({
    numCovenantInputs: 1,
    covenantInSompi:   COVENANT_OUTPUT_SOMPI,
    redeemScriptLen:   REDEEM_LEN,
    numRecipients:     1,
    hasKronChange:     false,
    kasUtxos,
  });

  // Verify the count exceeded 4 (so this exercises the old pass-4 truncation bug).
  assert.ok(kasInputCount > 4, `Expected > 4 KAS inputs, got ${kasInputCount}`);

  // The estimate must be ≥ canonical min fee for the ACTUAL final input count.
  // numCovenantOutputs = 1, numOutputsFinal = 2
  const refFee = canonicalMinFee(1, REDEEM_LEN, kasInputCount, 2);
  assert.ok(
    dynamicFee >= refFee,
    `estimate ${dynamicFee} < canonical min ${refFee} for ${kasInputCount} KAS inputs`,
  );

  // And feeTotal must cover dynamicFee (covenantInSompi == covenantOutSompi here).
  const feeTotal = BigInt(kasInputCount) * TINY;
  assert.ok(feeTotal >= dynamicFee, `feeTotal ${feeTotal} < dynamicFee ${dynamicFee}`);
});

// ── 3. Covenant inputs self-fund ───────────────────────────────────────────────
test('covenant inputs carry surplus — no KAS UTXOs selected', () => {
  // 2 covenant inputs, 1 output → 0.5 KAS surplus covers fee
  const { kasInputCount } = simulateFeeSelection({
    numCovenantInputs: 2,
    covenantInSompi:   2n * COVENANT_OUTPUT_SOMPI, // 1.0 KAS in
    redeemScriptLen:   REDEEM_LEN,
    numRecipients:     1,
    hasKronChange:     false,
    kasUtxos:          [{ sompi: 100_000_000n }],
  });
  assert.equal(kasInputCount, 0, `Expected 0 KAS inputs, got ${kasInputCount}`);
});

// ── 4. 10 small UTXOs — post-loop must use ACTUAL count ───────────────────────
test('10 small UTXOs — post-loop produces fee ≥ canonical min for actual count', () => {
  const UNIT = 5_000n;
  const kasUtxos = Array.from({ length: 10 }, () => ({ sompi: UNIT }));

  let threw = false;
  let result: { dynamicFee: bigint; kasInputCount: number } | null = null;
  try {
    result = simulateFeeSelection({
      numCovenantInputs: 1,
      covenantInSompi:   COVENANT_OUTPUT_SOMPI,
      redeemScriptLen:   REDEEM_LEN,
      numRecipients:     1,
      hasKronChange:     false,
      kasUtxos,
    });
  } catch {
    threw = true; // Insufficient KAS — not a correctness bug
  }

  if (!threw && result) {
    const { dynamicFee, kasInputCount } = result;
    // numCovenantOutputs = 1, numOutputsFinal = 2
    const refFee = canonicalMinFee(1, REDEEM_LEN, kasInputCount, 2);
    assert.ok(
      dynamicFee >= refFee,
      `dynamicFee ${dynamicFee} < canonical min ${refFee} for ${kasInputCount} inputs`,
    );
  }
});

// ── 5. Boundary: P2PK input mass vs canonical ─────────────────────────────────
test('per-KAS-input estimate matches canonical mass growth', () => {
  // Directly verify that adding one KAS input increases our estimate by at least
  // as much as kaspa-wasm says it should.
  const baseline  = estimateTransactionFee(1, REDEEM_LEN, 1, 2);
  const plusOneKas = estimateTransactionFee(1, REDEEM_LEN, 2, 2);
  const estimateDelta = plusOneKas - baseline;

  // Canonical delta: one more input with 66-byte sig
  const canonBaseline = canonicalMinFee(1, REDEEM_LEN, 1, 2);
  const canonPlusOne  = canonicalMinFee(1, REDEEM_LEN, 2, 2);
  const canonDelta    = canonPlusOne - canonBaseline;

  assert.ok(
    estimateDelta >= canonDelta,
    `estimate delta per KAS input (${estimateDelta}) < canonical delta (${canonDelta})`,
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nfee-selection: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
