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

### Checking locally

```
node scripts/check-faint-text.mjs
```

The script scans `client/src` (excluding the generated shadcn primitives
in `client/src/components/ui/`) and exits non-zero if any unannotated
faint-text usage is found.
