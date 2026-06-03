
## [ERR-20260603-001] vitest_path_alias

**Logged**: 2026-06-03T06:04:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
Vitest could not resolve the Next.js `@/*` path alias in the Cipher model test.

### Error
```text
Error: Cannot find package '@/lib/utils' imported from /tmp/neuralbet-v2/src/lib/cipher/model.ts
```

### Context
- Command: `vitest run`
- File: `src/lib/cipher/model.ts`
- Cause: Next build resolves `@/*`, but Vitest needs explicit alias config or relative imports.

### Suggested Fix
Use relative imports inside engine modules unless/until a Vitest alias config is added.

### Metadata
- Reproducible: yes
- Related Files: src/lib/cipher/model.ts, src/lib/cipher/__tests__/model.test.ts

---
