# Module Architecture

The platform is built as a set of **modules** under `apps/web/src/modules/`.
Each module is a self-contained feature: it owns its components, actions,
queries, and types, and exposes a small public surface through a `manifest`.

The goal: any module can be moved, renamed, or split into its own package
without touching the others. The day the platform grows past tasks, this
property is what makes that growth cheap instead of painful.

## Layout

```
apps/web/src/modules/
├── registry.ts          # the bridge: enumerates built-in module manifests
├── types.ts             # shared types every module may import
├── shell/               # built-in shell (admin nav, notifications, …)
│   ├── manifest.ts
│   ├── module-types.ts
│   └── actions/
├── tasks/               # first workspace app
│   ├── manifest.ts
│   ├── queries.ts
│   ├── actions/
│   ├── components/
│   ├── lib/
│   └── layout-types.ts
└── docs/                # knowledge pages / wiki (peer module)
    ├── manifest.ts
    ├── queries.ts
    ├── actions/
    ├── components/
    └── lib/
```

Docs product notes: [`docs/docs-module.md`](./docs-module.md).

A new module is just a new sibling directory with a `manifest.ts` exporting
a `ModuleManifest`. The shell picks it up once it's added to `registry.ts`.

## The rule

> **A file inside `modules/<A>/...` may not import from `modules/<B>/...` when `A !== B`.**

Two files are explicitly exempt from this rule:

- **`modules/registry.ts`** — the bridge. It enumerates every module's
  `manifest.ts` and exposes `moduleRegistry`, `navItemsFor()`, etc. This is
  the *only* place where the modules tree is allowed to know about all
  modules at once.
- **`modules/types.ts`** — shared types (`ModuleManifest`, `NavItem`,
  `SessionUserLike`). It imports nothing from modules and is itself importable
  by any module.

### What's allowed

| From | To | OK? |
| --- | --- | --- |
| `modules/tasks/components/board.tsx` | `modules/tasks/actions/...` | ✓ same module |
| `modules/tasks/components/board.tsx` | `modules/types.ts` | ✓ shared types |
| `modules/tasks/manifest.ts` | `modules/types.ts` | ✓ shared types |
| `modules/registry.ts` | `modules/<x>/manifest.ts` | ✓ bridge |
| `modules/tasks/queries.ts` | `@/lib/rbac` | ✓ non-module code |

### What's not

| From | To | Why |
| --- | --- | --- |
| `modules/tasks/queries.ts` | `modules/shell/...` | tasks reaching into shell |
| `modules/shell/actions/admin.ts` | `modules/tasks/queries.ts` | shell reaching into tasks |
| `modules/tasks/components/x.tsx` | `modules/registry.ts` | modules go through types, not the registry |

If you genuinely need to share code between two modules, the right places
are, in order of preference:

1. **`packages/shared`** — Zod schemas, type registries, generic utilities.
   This is for code with no React/server-runtime dependency.
2. **`modules/types.ts`** — small type definitions shared by manifests.
3. **Promote the consumer into a new module** — if a piece of code is shared
   across two modules, it's probably a third module waiting to be named.

## Enforcement

`pnpm module:check` (and the pre-commit hook) runs
`scripts/check-module-boundaries.mjs`, which walks every `.ts` / `.tsx` file
under `apps/web/src/modules/`, resolves each import, and fails the build if a
cross-module edge is found.

```bash
pnpm module:check
# → Scanned 77 module files. No cross-module imports found.
# → Module boundary check passed.
```

The script is a soft, fast check. It does not parse TypeScript — it resolves
import specifiers against the filesystem. If a file is renamed or moved, the
check will silently miss it. That's fine; it's a soft rule, not a hard one.
The point is to make accidental coupling visible, not to police every commit.

## Adding a new module

1. Create `apps/web/src/modules/<slug>/` with at least a `manifest.ts`.
2. Implement `ModuleManifest` from `modules/types.ts`. The `access(user)`
   predicate decides who sees the module's nav items.
3. Add the manifest to the `moduleRegistry` array in `modules/registry.ts`.
4. Run `pnpm module:check` — it should still pass.
5. If the module needs shared types, add them to `modules/types.ts`. Do not
   import from sibling modules' internals.
