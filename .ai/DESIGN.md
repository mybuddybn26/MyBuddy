# DESIGN.md — Buddy Visual Identity & Design System

> **Centralized design rules.** Every UI change must follow this document.
> Never hardcode colors, introduce new icon libraries, or deviate from these patterns.

---

## 1. Design Philosophy

Buddy's UI should feel:

- **Aspen Snow** — the official theme: background #FFFFF7, clean, spacious, like fresh snow.
- **Premium AI assistant** — not just a chatbot, but a polished product.
- **Clean** — generous whitespace, no clutter, every element has purpose.
- **Calm** — soft ice blue accents, deep blue anchors, no harsh contrasts.
- **Trustworthy** — predictable behavior, clear feedback, no dark patterns.
- **Spacious** — breathing room between elements, generous padding, never cramped.
- **Intelligent** — design reflects intelligence: precise, professional, considered.
- **Mobile-first** — touch-friendly targets (min 44px), responsive layouts.
- **Accessible** — WCAG AA contrast, keyboard navigation, screen reader support.

### Design Identity
- **Primary Identity:** Aspen Snow (#FFFFF7) + Deep Professional Blue.
- **Avoid:** green nature palette, purple AI gradients, neon colors, harsh gray backgrounds.

Quality reference: premium AI tools, modern productivity apps — but not copied directly.

---

## 2. Color System — Aspen Snow

All colors are defined as CSS custom properties in `vitejs/src/index.css` via `@theme`.

### Theme Name
**Aspen Snow** — the official Buddy theme.

Background: `#FFFFF7` (warm white, like fresh snow in sunlight).

### Primary Identity: True Deep Royal Blue
```
--color-primary-50:  #eff6ff   ← Lightest backgrounds
--color-primary-100: #dbeafe   ← Hover, subtle fills
--color-primary-200: #bfdbfe   ← Selection, borders
--color-primary-300: #93c5fd   ← Active states
--color-primary-400: #60a5fa   ← Accent elements
--color-primary-500: #3b82f6   ← BUTTONS, primary actions
--color-primary-600: #2563eb   ← Hover states
--color-primary-700: #1d4ed8   ← Active, gradient stops
--color-primary-800: #1e40af   ← Headings, emphasis
--color-primary-900: #1e3a8a   ← Darkest text emphasis
```
**Note:** True deep royal blue — no purple undertones. Avoid indigo or violet-tinged blues.

### Surface (Aspen Snow)
```
--color-surface:      #FFFFF7   ← Page background (Aspen Snow signature)
--color-surface-alt:  #FEFEF0   ← Card/panel background (warm white)
--color-surface-dark: #0f172a   ← Page background (dark mode)
--color-surface-dark-alt: #1e293b ← Card background (dark mode)
```

### Accent: Soft Ice Blue
```
--color-accent:  #38bdf8   ← Soft ice blue accent
```

### Semantic
```
--color-success: #10b981   ← Success messages
--color-warning: #f59e0b   ← Warning messages
--color-danger:  #ef4444   ← Error messages
```

### Text (Tailwind classes referencing tokens)
- Primary text: `text-slate-800` / `text-slate-200` (dark mode)
- Secondary text: `text-slate-500` / `text-slate-400` (dark mode)
- Muted text: `text-slate-400` / `text-slate-500` (dark mode)
- White text: `text-white` (on primary/hero backgrounds)

### Rules
- **Never hardcode hex values** in component JSX — use Tailwind theme classes or `var(--color-*)` inline.
- **Use Tailwind classes** that reference the theme tokens above.
- **Selected navigation** must remain readable (white text on primary gradient, or `bg-white/20 text-white`).
- **Maintain WCAG AA contrast** in both light and dark modes.
- **Aspen Snow background** (#FFFFF7) must be the default page background.
- **Cards** should use `white` or `#FEFEF0` backgrounds.
- **Waveform colors** should use `var(--color-success)` for listening, `var(--color-primary-500)` for speaking.
- **Recording indicators** should use `var(--color-danger)` with opacity/transparency, never hardcoded `#ef4444`.

### Avoid
- Purple undertones in primary blue (do not use indigo, violet, or purple-tinged blues).
- Green/nature palette (do not use green tones outside of `--color-success`).
- Purple AI gradients (no purple-to-blue gradients).
- Neon/fluorescent colors.
- Harsh gray backgrounds (do not use gray tones that clash with Aspen Snow).

---

## 3. Typography

| Usage | Size | Weight | Line Height |
|---|---|---|---|
| Page heading | `text-2xl` (24px) | Bold (700) | Tight |
| Card heading | `text-xl` (20px) | Semibold (600) | Normal |
| Body text | `text-sm` (14px) | Normal (400) | Relaxed (1.6) |
| Labels / meta | `text-xs` (12px) | Medium (500) | Normal |
| Chat input | `text-sm` (14px) | Normal (400) | Normal |
| Code / mono | `text-xs` (12px) | Normal (400) | Normal (font-mono) |

**Font family:** `Inter` (Google Fonts), fallback to `system-ui, -apple-system, sans-serif`.

**Rules:**
- Never use text smaller than `text-xs` (12px).
- Keep chat message text at `text-sm` with `leading-relaxed`.
- Headings use `font-bold` or `font-semibold`.
- Use `font-mono` for numbers/tokens only.

---

## 4. Spacing & Layout

| Element | Value | Tailwind |
|---|---|---|
| Page padding | 16px | `p-4` |
| Card padding | 12-16px | `px-3 py-2` to `p-4` |
| Chat message gap | 12px | `space-y-3` |
| Input bar padding | 12-16px | `px-4 py-3` |
| Sidebar width (desktop) | 256px | `w-64` |
| Modal padding | 24px | `p-6` |
| Button gap (input bar) | 8px | `gap-2` |
| Action button gap | 4px | `gap-1` |

**Breakpoints:**
- Mobile: `< 768px` (`md:` breakpoint)
- Tablet: `768px` - `1024px`
- Desktop: `> 1024px`

**Rules:**
- Consistent spacing — don't mix `p-3` and `p-4` in the same component group.
- Mobile layout uses bottom nav bar; desktop uses left sidebar.
- Chat input bar: `[Camera] [Message] [Mic/Phone]` in a single flex row.

---

## 5. Border Radius & Shadows

### Radius Tokens
| Element | Value | Tailwind |
|---|---|---|
| Chat bubbles | 20px / 4px asymmetric | `.chat-bubble-user`, `.chat-bubble-assistant` |
| Cards | 16px | `rounded-2xl` |
| Modals | 16px | `rounded-2xl` |
| Buttons (input bar) | 12px | `rounded-xl` |
| Input fields | 12px | `rounded-xl` |
| Dropdown menus | 12px | `rounded-xl` |
| Small buttons/tags | 8px | `rounded-lg` |

### Shadow Tokens
| Level | Value | Usage |
|---|---|---|
| Small | `0 1px 4px rgba(0,0,0,0.04)` | Cards, assistant bubbles |
| Medium | `0 4px 24px rgba(0,0,0,0.06)` | Glass cards, modals |
| Large | `0 4px 16px rgba(37,99,235,0.3)` | Voice button active |

**Rules:**
- Soft shadows only — no `box-shadow` with high opacity or hard edges.
- No inconsistent border radius — stick to `rounded-xl` or `rounded-2xl`.

---

## 6. Icon System

**Lucide only.** Import from `lucide-react`. Default size 18-20px.

### Standard Mappings
| Purpose | Icon | Size |
|---|---|---|
| Chat | `MessageCircle` | 18-20px |
| Ledger | `BookOpen` | 18-20px |
| Documents | `FileText` | 18-20px |
| Budgets | `ClipboardList` | 18-20px |
| Billing | `Coins` | 18-20px |
| Settings | `Settings` | 18-20px |
| Camera | `Camera` | 20px |
| Microphone | `Mic` | 20px |
| Mic Off | `MicOff` | 20px |
| Voice Call | `PhoneCall` | 20px |
| End Call | `PhoneOff` | 20px |
| Send | `Send` | 20px |
| Copy | `Copy` | 14px |
| Copied (success) | `CircleCheck` | 14px |
| Like | `ThumbsUp` | 14px |
| Dislike | `ThumbsDown` | 14px |
| Retry | `RotateCcw` | 14px |
| Read Aloud | `Volume2` | 14px |
| Share | `Share2` | 14px |
| Pause | `Pause` | 14px |
| Play | `Play` | 14px |
| Stop | `Square` | 14px |
| Loading | `Loader2` (with `animate-spin`) | 14-24px |
| Delete | `Trash2` | 14-18px |
| Edit | `Pencil` | 14-18px |
| Close | `X` | 18-20px |
| Menu | `Menu` | 24px |
| Logout | `LogOut` | 16px |
| Expand | `ChevronDown` | 16px |
| Collapse | `ChevronUp` | 16px |
| Search | `Search` | 16px |
| User/Profile | `User` | 16-20px |
| File/PDF | `FileText` | 18px |
| Finance | `Wallet` | 18-20px |
| Home | `House` | 18-20px |

### Rules
- No emojis as UI elements (emoji in welcome text is acceptable as decorative content).
- No Material Icons, Heroicons, Font Awesome.
- Icon-only buttons must have `aria-label`.
- Icons inherit theme color via Tailwind text classes.
- Tooltips on hover for icon-only controls where helpful.

---

## 7. Component Rules

### Buttons
```tailwind
// Primary (filled)
className='px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50'

// Secondary (outline)
className='px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors'

// Danger
className='px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors'

// Icon button
className='p-2.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-xl transition-colors'

// Ghost
className='p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors'
```

States: default, hover, active (scale-95), disabled (opacity-50, cursor-not-allowed), loading (spinner replaces text).

### Inputs
```tailwind
className='px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all disabled:opacity-50'
```

### Modals
- Overlay: `fixed inset-0 bg-black/50` (or `bg-black/30`).
- Card: `bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4`.
- Animation: `animate-slide-up` (0.3s ease-out).
- Close button: `X` icon in top-right.
- Click overlay to dismiss.

### Toast Notifications
- Position: fixed bottom-center (`.toast-container`).
- Types: success (green), error (red), warning (amber), info (blue).
- Duration: success 4s, error 8s, warning 6s, info 5s.
- Max visible: 3.
- Dismiss on click.

### Action Buttons (Response Actions)
- Layout: `flex items-center gap-1 mt-2 flex-wrap`.
- Size: `px-2 py-1 text-xs`.
- Selected: highlighted background (`bg-emerald-50` for like, `bg-red-50` for dislike).
- Default: `text-slate-400 hover:text-primary-500 hover:bg-primary-50`.
- Icon + text: icon 14px, text hidden on small screens (`hidden sm:inline`).

---

## 8. Chat UI

### Bubble Styles
```
User:     gradient (primary-500 → primary-600), white text, r=20px/20px/4px/20px, max-w 80%
Buddy:    white background, slate-800 text, border e2e8f0, r=20px/20px/20px/4px, max-w 85%, subtle shadow
```

### Input Bar Layout
```
[Camera] [___Type a message…___] [Mic/Phone]
```
- Camera: opens file picker for image upload.
- Mic (no text): one-shot STT → transcribes → pastes into input.
- Phone: opens VoiceCallModal for continuous conversation.
- Send (text present): submits text message.

### Response Actions
Appear below every non-streaming assistant message:
```
[Copy] [Good] [Bad] [Retry] [Read] [Share]
```
- Copy: copies text, shows check icon for 2s.
- Good/Bad: toggleable, one vote per message, backend synced.
- Bad: opens FeedbackDialog with reason checkboxes.
- Retry: removes assistant + user message, re-sends.
- Read: speech synthesis via SpeechControls.

---

## 9. Voice UI

### Voice Call Modal
- Full-screen: `bg-slate-900 text-white`.
- Header: status indicator (green dot) + duration + mute + end call.
- Center: avatar (primary circle) + waveform + state text.
- Bottom: interrupt button (when speaking) or reconnect (when disconnected).

### Waveform
- Real audio levels from `AudioContext` analyser.
- 5 animated bars, color changes by state (green=listening, blue=speaking).
- Height: 4-40px, animated via `requestAnimationFrame`.
- No fake/decorative animations.

### States & Indicators
| State | Visual |
|---|---|
| Listening | Green waveform + "I'm listening..." |
| Thinking | Spinning loader + "Let me think..." |
| Speaking | Blue waveform + avatar pulses |
| Interrupted | "Go ahead..." + returns to listening |
| Disconnected | Red "Disconnected" + reconnect button |

---

## 10. Documents UI

- Upload: Camera button in input bar opens file picker.
- Document list: card-based, showing image thumbnail + AI summary preview.
- Analysis: AI reads image, identifies document type (bill/letter/permit/statement/other).
- Confidence: inferred from AI response keywords, not displayed as percentage.
- Errors: "Image file not found" or "AI analysis failed" with retry.

---

## 11. Settings UI

- Settings page accessible from sidebar navigation.
- Page content: unknown — existing settings page not inspected. Verify before implementing.

---

## 12. Custom Chat Backgrounds

- Not currently implemented. Verify before implementing.

---

## 13. Animations

| Animation | Duration | Easing | Usage |
|---|---|---|---|
| `animate-fade-in` | 0.3s | ease-out | Welcome screen |
| `animate-slide-up` | 0.3s | ease-out | Messages, modals |
| `animate-pulse-soft` | 2s | infinite | Recording button |
| `animate-bounce-soft` | 0.6s | ease-out | Notifications |
| `transition-colors` | default | — | Hover states |
| `transition-all` | default | — | Button states |

**Rules:**
- Subtle only — no flashy effects.
- Duration 150-250ms for interactive transitions.
- Respect `prefers-reduced-motion` (not yet implemented — add if implementing new animations).

---

## 14. Accessibility

- **WCAG AA contrast** — primary text on surfaces meets minimum contrast.
- **Keyboard navigation** — all interactive elements are focusable.
- **ARIA labels** — `aria-label` on every icon-only button.
- **Focus states** — `focus:ring-2 focus:ring-primary-100` on inputs; visible ring on buttons.
- **Touch targets** — minimum 44px (Tailwind `p-2.5` + icon = ~44px).
- **Screen reader** — semantic HTML, `role` attributes on groups, live regions for toasts.

---

## 15. Responsive Design

| Breakpoint | Behavior |
|---|---|
| Desktop (`>= md`) | Sidebar (256px) + content area; horizontal input bar |
| Mobile (`< md`) | Top header + bottom nav; vertical stacking; modal-width inputs |

- Sidebar collapses to bottom navigation on mobile.
- Response action labels hide on small screens (`hidden sm:inline`).
- Chat input remains usable on all screen sizes.

---

## 16. States (Empty, Loading, Error, Success)

Every feature must handle:

| State | Pattern |
|---|---|
| **Empty** | Centered message with icon + description (e.g., "Welcome to MyBuddy!") |
| **Loading** | `Loader2` with `animate-spin`, or skeleton placeholder |
| **Error** | Toast notification + inline message with retry option |
| **Success** | Toast confirmation (e.g., "Response copied.") |

---

## 17. Design Anti-Patterns (Do NOT)

- Introduce new icon libraries (Lucide only).
- Hardcode colors (use Tailwind theme tokens).
- Create random gradients (use `.gradient-header` or primary gradient pattern).
- Make inconsistent buttons (follow primary/secondary/danger/ghost patterns).
- Use unreadable selected states (always maintain text contrast).
- Create fake loading states that never resolve.
- Remove accessibility labels from existing components.
- Break dark mode (if implemented — currently not fully enabled).
- Add excessive animations (keep under 250ms).
- Change layout without documented reason (update this file if layout changes).

---

## 18. Design Verification Checklist

Before completing any UI task:

- [ ] Uses Lucide icons only
- [ ] Uses Tailwind theme tokens (no hardcoded hex)
- [ ] Selected text is readable
- [ ] Light mode works
- [ ] Mobile layout works
- [ ] Keyboard focus visible
- [ ] Screen reader labels on icon buttons
- [ ] Loading state present
- [ ] Error state present
- [ ] Empty state present
- [ ] No duplicate component styles
- [ ] No unrelated UI changes
