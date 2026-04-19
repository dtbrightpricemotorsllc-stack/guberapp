# Contributing

## Readability rule: no faint text on body copy

The app is used outdoors in sunlight. Faint text — anything below ~80%
opacity on a colored background — becomes unreadable. A previous cleanup
pass removed all `text-muted-foreground/{50,60,70}` from `client/src`,
and we want to keep it that way.

### What to avoid on body copy

- `text-white/{10..70}` and `placeholder:text-white/{10..70}`
- `text-foreground/{10..70}` and `text-muted-foreground/{10..70}`
- Standalone `opacity-50` and `opacity-60` utilities (Tailwind variants
  like `disabled:opacity-50`, `hover:opacity-50`, etc. are fine — they
  describe an interaction state, not a baseline rendering)
- Inline `style={{ color: "rgba(255,255,255, 0.x)" }}` where `x <= 7`
- Inline `style={{ color: "#ffffffXX" }}` 8-digit hex with low alpha

### What to use instead

- For secondary text on dark surfaces: `text-white/80` or above, or the
  theme token `text-muted-foreground` (which is tuned for contrast in
  both light and dark mode).
- For primary body copy: `text-foreground`.

### Decorative exceptions

If the faint color is genuinely decorative (a dot separator, an icon
hint, a watermark, brand chrome like the stacked logo letters), add a
comment on the same or previous line:

```tsx
{/* faint-text-allow: decorative dot separator */}
<span className="text-white/20">·</span>
```

### Automated enforcement

Both checks run automatically on every push and pull request via GitHub
Actions (`.github/workflows/readability-check.yml`). A failing check
blocks the PR until the issue is resolved or the usage is annotated with
an allow comment.

To also catch violations before they leave your machine, install the
provided pre-commit hook once per clone:

```
git config core.hooksPath .githooks
```

After that, `git commit` will run both checks and abort if any
unannotated violation is found.

### Checking manually

```
node scripts/check-faint-text.mjs
node scripts/check-dark-gradients.mjs
```

Each script scans `client/src` (excluding the generated shadcn primitives
in `client/src/components/ui/`) and exits non-zero if any unannotated
violation is found.

---

## Readability rule: no near-black hex stops in inline style gradients

Cards and panels written with JSX `style` props like

```tsx
style={{ background: "linear-gradient(135deg, #001a0a, #002d12)" }}
```

produce pitch-black surfaces that are unreadable outdoors. The Tailwind
utility checker cannot see these because they bypass the class system.

### What to avoid

- `style={{ background: "linear-gradient(..., #000, ...)" }}` and any hex
  stops where every RGB channel is ≤ 0x44 (≈ 27 % brightness).
- This includes: `#000`, `#0a0a0a`, `#001a0a`, `#0d0d1a`, `#002d12`, etc.

### What to use instead

- Replace hard-coded dark hex stops with lighter values (each channel > 0x44).
- Prefer CSS custom properties / theme tokens so colours adapt to the theme:
  ```tsx
  style={{ background: "linear-gradient(135deg, var(--color-surface-dark), var(--color-surface))" }}
  ```

### Decorative exceptions

If a dark gradient is genuinely non-text (e.g. a full-bleed hero image
overlay placed behind readable white text), add an allow comment:

```tsx
{/* dark-gradient-allow: hero overlay behind high-contrast text */}
<div style={{ background: "linear-gradient(to bottom, #000, transparent)" }} />
```

The checker (`scripts/check-dark-gradients.mjs`) looks for the token
`dark-gradient-allow` on the flagged line or the line immediately above it.
