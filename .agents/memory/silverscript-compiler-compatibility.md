---
name: SilverScript compiler compatibility
description: Replit Rust toolchain mismatch with recent upstream SilverScript and the verified release-binary alternative
---

Recent upstream SilverScript source requires a newer Rust compiler than the available Replit `rust-stable` module, so a source build can fail before evaluating any covenant.

**Why:** A source checkout required Rust 1.94 while the available module supplied 1.88. The official prebuilt Linux `silverc` release binary successfully compiled a prototype without installing a different Rust toolchain.

**How to apply:** For covenant work, check the upstream minimum Rust version before changing the workspace toolchain. A successful binary compile checks syntax and code generation only; it does **not** establish consensus correctness, deployed-token compatibility, or fund safety. Match any owner modes to the actual deployed token template: KRON's SDK describes address-presence mode 3, but the upstream KCC-20 example shows only modes 0–2.