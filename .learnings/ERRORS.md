
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

## [ERR-20260603-002] live_vercel_url_404

**Logged**: 2026-06-03T08:28:00Z
**Priority**: high
**Status**: pending
**Area**: deployment

### Summary
The provided live Vercel URL returned 404 during smoke check.

### Error
```text
https://neuralbet-lovat.vercel.app/ -> 404: NOT_FOUND
```

### Context
- User provided live URL for verification.
- Need re-check after Phase 3.1 push.
- Possible causes: Vercel deployment failed, alias not pointing to project, project still deploying, or build env missing.

### Suggested Fix
After successful push, inspect Vercel deployment status/logs or ask user to check project alias if URL still 404.

### Metadata
- Reproducible: yes
- Related Files: deployment/Vercel

---
