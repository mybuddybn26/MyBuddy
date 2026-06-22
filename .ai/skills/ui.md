# UI (Frontend)

> For comprehensive design rules, colors, typography, and component patterns, see `.ai/DESIGN.md`.

## Stack

- **React 19** with functional components and hooks.
- **Tailwind CSS** v4 with centralized theme tokens in `vitejs/src/index.css`.
- **Lucide** icons only — no other icon library.

## Theme Tokens

```css
--color-primary-50 through --color-primary-900
--color-success / --color-warning / --color-danger
--color-surface / --color-surface-alt / --color-surface-dark / --color-surface-dark-alt
--font-sans
--animate-fade-in / --animate-slide-up / --animate-pulse-soft
```

Never use raw hex values in components. Use Tailwind classes that reference these tokens.

## Component Patterns

- **State**: `useState` for local, React Context for shared (Toast, Theme).
- **API**: Always through `vitejs/src/api.ts`. Never inline `fetch`.
- **Toast**: `useToast()` from `components/Toast.tsx`.
- **Icons**: Import from `lucide-react`. Size 14-20px. Use `aria-label` on icon-only buttons.

## Layout

- Input bar: `[Camera] [___Message___] [Mic] [Phone]`
- Font: Inter (loaded from Google Fonts).
- Rounded corners: `rounded-xl` / `rounded-2xl`.
- Transitions: `transition-colors` / `transition-all` under 250ms.

## Accessibility

- WCAG AA contrast in both light and dark modes.
- Keyboard navigation on all interactive elements.
- `aria-label` on all icon-only buttons.
- Visible focus rings (`focus:ring-2`).

## Common Mistakes

- Using emojis as UI elements instead of Lucide icons.
- Hardcoding colors instead of Tailwind classes.
- Inline `fetch` instead of using `api.ts`.
- Missing `aria-label` on icon buttons.

## Verification

- [ ] All icons are from Lucide
- [ ] No raw hex colors in components
- [ ] API calls go through `api.ts`
- [ ] Interactive elements have keyboard support
- [ ] Icon buttons have `aria-label`
