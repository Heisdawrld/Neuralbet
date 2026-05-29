# Contributing to NeuralBet

Thanks for your interest in contributing! Here's how to get involved.

---

## Development Setup

```bash
git clone https://github.com/Heisdawrld/Neuralbet.git
cd Neuralbet
npm install
cp .env.example .env.local
# Edit .env.local with your credentials
npm run dev
```

## Running Tests

```bash
npm test              # All 467 tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**All tests must pass before submitting a PR.** The CI pipeline runs:
1. `npm test` — 467 tests
2. `npm run build` — strict TypeScript (no `ignoreBuildErrors`)
3. `npm run lint` — ESLint

---

## Contribution Guidelines

### Engine Changes

Any change to the prediction engine (`src/lib/prediction-engine/v5/`) must:

1. **Include tests** — unit tests for new functions, updated tests for modified behavior
2. **Pass backtest** — run `npm run backtest` and confirm Brier score doesn't regress
3. **Use named constants** — no magic numbers. Export every coefficient.
4. **Be NaN-safe** — use `safeNum()` for every numeric access from feature vectors
5. **Document** — update `docs/ENGINE.md` or `docs/INTELLIGENCE.md` as needed

### Intelligence Modules

New intelligence modules must follow the pattern:

1. Create `intelligence/your-module.ts`
2. Add flag to `flags.ts` (default: ON)
3. Gate with `isIntelligenceEnabled('your_module')`
4. Write tests in `__tests__/your-module.test.ts`
5. Wire into pipeline in `index.ts`
6. Add ablation test: `npm run ablate -- --module=your_module`
7. Document in `docs/INTELLIGENCE.md`

### UI Changes

- Follow the existing dark cyberpunk design system
- Use Tailwind utility classes + custom CSS classes from `globals.css`
- Test on mobile (bottom nav) and desktop (sidebar)
- Use Framer Motion for animations

### Code Style

- TypeScript strict mode
- No `any` types without justification
- Descriptive variable names
- Comments for non-obvious logic
- Keep functions pure when possible

---

## Pull Request Process

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run build: `npm run build`
6. Commit with a descriptive message
7. Push and open a PR against `main`

### PR Title Format

```
Phase X.Y: Brief description of what changed
```

Examples:
- `Phase 2.10: Add corner-kick intelligence module`
- `Phase 4.1: Redesign prediction cards with intelligence badges`
- `fix: handle null referee data in set-piece module`

### PR Description

Include:
- **WHAT** — what changed and why
- **ADD** — new files/tests
- **FIX** — bugs fixed (if any)
- **VERIFIED** — `npm test` count, `npm run build` status

---

## Reporting Issues

Open an issue with:
- **What happened** vs **what you expected**
- **Steps to reproduce**
- **Environment** (Node version, OS, browser)
- **Screenshots** (for UI bugs)

---

## Questions?

Open a discussion or reach out to [@Heisdawrld](https://github.com/Heisdawrld).
