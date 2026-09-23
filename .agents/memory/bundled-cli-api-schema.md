---
name: Bundled CLI and API schema quirks
description: Two tooling compatibility traps encountered in the distributor research API.
---

Keep CLI execution code in a separate module from the reusable API implementation; do not rely on `import.meta.url` matching `process.argv[1]` to suppress a CLI main block when esbuild bundles an imported module.

**Why:** In a bundled server, the imported module's `import.meta.url` can resolve to the server entry point, causing the CLI block to run at API startup despite passing checks in direct Node execution.

**How to apply:** Put the reusable function in an import-safe module and the argument parsing/output in a separate executable file whenever code must run both from the server and the command line.

Use OpenAPI `number`, not `integer`, for generated response fields until the schema generator and installed Zod versions are aligned.

**Why:** Current Orval emits `zod.int()` for `integer`, but this workspace's Zod 3 lacks that method, breaking typecheck after code generation.

**How to apply:** For new generated API schemas involving integral response fields, use `number` and enforce integer constraints in implementation, or upgrade toolchain compatibly before changing the specification.