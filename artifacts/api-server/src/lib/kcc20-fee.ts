/**
 * KCC-20 / KRON covenant transaction fee estimation.
 *
 * ## How Kaspa mass is calculated (verified against kaspa-wasm@0.13 MassCalculator)
 *
 * Mass formula (grams ≈ bytes for most terms):
 *
 *   total_mass = blankTransactionMass()                  // 94
 *              + Σ inputs  ( PER_INPUT_BASE + sigScriptLen )
 *              + Σ outputs ( perOutputMass )
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
 * @param numCovenantInputs  Number of P2SH covenant UTXOs being spent.
 * @param redeemScriptLen    Byte length of the redeemScript (same for all KRON UTXOs of one version).
 * @param numKasInputs       Number of plain P2PK KAS fee UTXOs being spent.
 * @param numOutputs         Total number of outputs (covenant + optional KAS change).
 *                           Pass `numCovenantOutputs + 1` as a conservative estimate when
 *                           the final KAS-change output may or may not exist.
 */
export function estimateTransactionFee(
  numCovenantInputs: number,
  redeemScriptLen: number,
  numKasInputs: number,
  numOutputs: number,
): bigint {
  const covenantInputMass = BigInt(numCovenantInputs) * (PER_INPUT_BASE + p2shSigScriptLen(redeemScriptLen));
  const kasInputMass      = BigInt(numKasInputs)      * (PER_INPUT_BASE + P2PK_SIG_SCRIPT_LEN);
  // Use P2SH output mass conservatively for all outputs (P2SH is heavier than P2PK).
  const outputMass        = BigInt(numOutputs)        * P2SH_OUTPUT_MASS;

  const computeMass = BLANK_TX_MASS + covenantInputMass + kasInputMass + outputMass;

  // Add 10 % overhead for estimation variance, then enforce the absolute minimum.
  const fee = (computeMass * 11n) / 10n;
  return fee < MIN_FEE_SOMPI ? MIN_FEE_SOMPI : fee;
}

/**
 * Exported constants for use in tests that need to independently verify
 * the canonical fee against kaspa-wasm MassCalculator.
 */
export { BLANK_TX_MASS, PER_INPUT_BASE, P2SH_OUTPUT_MASS, P2PK_OUTPUT_MASS, p2shSigScriptLen };
