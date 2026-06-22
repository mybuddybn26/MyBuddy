# TypeScript

## Configuration

- **Strict mode** enabled in both `fastify/tsconfig.json` and `vitejs/tsconfig.json`.
- **ESM** modules (`"type": "module"` in package.json, `.js` extensions in imports).
- **Target**: ES2022+ for Node, ESNext for Vite.

## Conventions

- **No `any`** — use proper types, `unknown` when needed, or explicit type assertions.
- **Interfaces** for object shapes; **type aliases** for unions and primitives.
- **PascalCase** for types/interfaces; **camelCase** for variables/functions.
- **Export patterns**: named exports preferred over default exports (except Fastify plugins).
- **Import extensions**: Always use `.js` extension for local imports in ESM (even for `.ts` files).

## Fastify-Specific

- Route handlers typed: `async (request: FastifyRequest, reply: FastifyReply) => {...}`
- Request body cast: `const body = request.body as { field: string }`
- TypeBox schemas for all route inputs.

## React-Specific

- `useRef<T>(null)` for DOM/instance refs.
- `useState<T>()` with explicit type parameter when inference fails.
- `useCallback` with proper deps — every referenced variable must be in the array.
- Event handlers: `React.FormEvent`, `React.ChangeEvent<HTMLInputElement>`, etc.

## Common Mistakes

- Unused imports/variables — TypeScript strict flags these as errors.
- Missing `.js` extension on local imports in ESM.
- Using `any` instead of proper types.
- Missing deps in `useCallback` causing stale closures.

## Verification

- [ ] `pnpm typecheck` passes with 0 errors
- [ ] No `any` types (unless truly necessary with comment justifying)
- [ ] All imports resolve correctly
