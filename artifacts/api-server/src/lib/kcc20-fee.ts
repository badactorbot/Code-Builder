/**
 * KCC-20 / KRON covenant transaction fee estimation.
 *
 * ## How Kaspa mass is calculated (verified against kaspa-wasm@0.13 MassCalculator)
 *
 * ### Compute mass
 *
 * Formula (grams ≈ bytes for most terms):
 *
 *   compute_mass = blankTransactionMass()                  // 94
 *                + Σ inputs  ( PER_INPUT_BASE + sigScriptLen )
 *                + Σ outputs ( perOutputMass )
 *
 * Constants (measured from `new MassCalculator(getConsensusParametersByNetwork(new NetworkId('mainnet')))`):
 *   mc.blankTransactionMass()                               = 94
 *   mc.calcMassForInputs([{ signatureScript: '' }])         = 1052 per input
 *   mc.calcMassForOutputs([P2SH output])                    = 423
 *   mc.calcMassForOutputs([P2PK output])                    = 412
 *   signatureScript bytes contribute 1 gram each (already included in calcMassForInputs)
 *   mc.calcSignatureMassForInputs always returns 0 — sig bytes counted in calcMassForInputs
 *
 * Signature script sizes:
 *   P2PK KAS fee input:  1-byte push + 64-byte Schnorr sig = 65 bytes
 *                        (using 66 here to be conservative, covering SIGHASH-type variants)
 *   P2SH covenant input: 66-byte sig + OP_PUSHDATA2 (1B) + 2B length + redeemScript bytes
 *                        = 69 + redeemScriptLen  (OP_PUSHDATA2 used when script > 255 bytes)
 *
 * ### Storage mass (KIP-0009)
 *
 * Kaspa charges additional mass for outputs with small sompi values:
 *
 *   storage_mass = C × ( Σ(1/output_value) − Σ(1/input_value) )
 *
 * where C = 10,000,000,000 and the sums are integer divisions (sompi).
 * Storage mass is clamped to 0 when inputs offset the output sum completely.
 * This term dominates for dust-level KAS UTXOs used as fee inputs.
 *
 * ### Fee
 *
 *   mass = max(compute_mass, storage_mass)
 *   fee  = max( mass × 1.1,  MIN_FEE_SOMPI )
 *
 * The 10 % overhead is applied once to the dominant mass component.
 * The minimum relay fee equals the mass in sompi (1 sompi/gram), with a hard floor.
 */

/** Absolute minimum relay fee enforced by the network. */
export const MIN_FEE_SOMPI = 1_000n;

// ── Constants measured from kaspa-wasm@0.13 MassCalculator (mainnet) ─────────
const BLANK_TX_MASS     = 94n;
const PER_INPUT_BASE    = 1052n;  // base mass per input (header + UTXO overhead)
const P2SH_OUTPUT_MASS  = 423n;   // per P2SH covenant output
const P2PK_OUTPUT_MASS  = 412n;   // per P2PK (KAS change) output

// Signature-script lengths (upper-bound estimates):
const P2PK_SIG_SCRIPT_LEN = 66n;  // 1-byte push + 64-byte Schnorr + 1-byte SIGHASH

// Storage-mass constant (KIP-0009)
const STORAGE_MASS_C = 10_000_000_000n;

// Fixed sompi value carried by every KRON covenant UTXO (0.5 KAS).
// Used as the covenant-input side of the storage-mass offset.
const COVENANT_SOMPI = 50_000_000n;

/**
 * P2SH covenant signatureScript length for a given redeemScript size.
 * Layout: [sig (66B)] [OP_PUSHDATA2 (1B)] [2B length] [redeemScript]
 * OP_PUSHDATA2 is always used for KRON scripts (> 255 bytes).
 */
function p2shSigScriptLen(redeemScriptLen: number): bigint {
  return 66n + 1n + 2n + BigInt(redeemScriptLen);  // = 69 + redeemScriptLen
}

/**
 * Estimate the relay fee (sompi) for a KCC-20 covenant transaction.
 *
 * Both compute mass and storage mass (KIP-0009) are calculated; the fee is
 * based on whichever component is larger, with a single 10 % overhead applied
 * at the end.
 *
 * @param numCovenantInputs  Number of P2SH covenant UTXOs being spent.
 * @param redeemScriptLen    Byte length of the redeemScript (same for all KRON UTXOs of one version).
 * @param kasInputValues     Actual sompi values of the plain P2PK KAS fee UTXOs being spent.
 *                           Tiny values here dominate storage mass — pass the real amounts.
 * @param outputValues       Actual sompi values of every transaction output (covenant outputs
 *                           + optional KAS change). Pass `COVENANT_OUTPUT_SOMPI` as a
 *                           conservative placeholder for an unknown KAS-change amount.
 */
export function estimateTransactionFee(
  numCovenantInputs: number,
  redeemScriptLen: number,
  kasInputValues: bigint[],
  outputValues: bigint[],
): bigint {
  const numKasInputs = kasInputValues.length;
  const numOutputs   = outputValues.length;

  // ── Compute mass ────────────────────────────────────────────────────────────
  const covenantInputMass = BigInt(numCovenantInputs) * (PER_INPUT_BASE + p2shSigScriptLen(redeemScriptLen));
  const kasInputMass      = BigInt(numKasInputs)      * (PER_INPUT_BASE + P2PK_SIG_SCRIPT_LEN);
  // Use P2SH output mass conservatively for all outputs (P2SH is heavier than P2PK).
  const outputMass        = BigInt(numOutputs)        * P2SH_OUTPUT_MASS;

  const computeMass = BLANK_TX_MASS + covenantInputMass + kasInputMass + outputMass;

  // ── Storage mass (KIP-0009) ─────────────────────────────────────────────────
  // storage_mass = C × ( Σ(1/output_value) − Σ(1/input_value) ), clamped ≥ 0.
  // Integer arithmetic: each term is STORAGE_MASS_C / value.
  let storageOutSum = 0n;
  for (const v of outputValues) {
    if (v > 0n) storageOutSum += STORAGE_MASS_C / v;
  }

  let storageInSum = 0n;
  // Covenant inputs each carry a fixed 0.5 KAS.
  storageInSum += BigInt(numCovenantInputs) * (STORAGE_MASS_C / COVENANT_SOMPI);
  // KAS fee inputs — dust inputs here can dominate storage mass.
  for (const v of kasInputValues) {
    if (v > 0n) storageInSum += STORAGE_MASS_C / v;
  }

  const storageMass = storageOutSum > storageInSum ? storageOutSum - storageInSum : 0n;

  // ── Final fee ───────────────────────────────────────────────────────────────
  // Take the larger of the two mass components, apply a single 10 % overhead.
  const mass = computeMass > storageMass ? computeMass : storageMass;
  const fee  = (mass * 11n) / 10n;
  return fee < MIN_FEE_SOMPI ? MIN_FEE_SOMPI : fee;
}

/**
 * Exported constants for use in tests that need to independently verify
 * the canonical fee against kaspa-wasm MassCalculator.
 */
export { BLANK_TX_MASS, PER_INPUT_BASE, P2SH_OUTPUT_MASS, P2PK_OUTPUT_MASS, p2shSigScriptLen, COVENANT_SOMPI as COVENANT_FEE_SOMPI };
