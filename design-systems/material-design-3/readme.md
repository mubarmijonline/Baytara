# Material Design 3 — Design System (in progress)

Source: m3.material.io (official M3 baseline "purple" scheme), github.com/mui/material-ui (component inventory reference).

## Status
This project is being converted from a single-file style guide (`Material Design 3.dc.html`) into a proper, reusable Design System (tokens + component primitives + UI kits) so future AI sessions can build against real components instead of a screenshot.

Done so far:
- `tokens/colors.css` — full M3 color role tokens (light `:root` + dark `[data-theme="dark"]`), same values used live in `Material Design 3.dc.html`.
- `styles.css` — root import entry point.

Still to do (next session should continue this list):
- `tokens/typography.css` (15-role type scale), `tokens/elevation.css`, `tokens/shape.css`.
- Component primitives as `.jsx` + `.d.ts` + `.prompt.md` (Button, IconButton, FAB, TextField, Card, Chip, Switch, Checkbox, Radio, Slider, NavBar, NavRail, List, Dialog, Snackbar) with `@dsCard` specimen HTML per directory.
- Fonts: no local font files available — using Google Fonts CDN (Roboto Flex + Roboto + Material Symbols Outlined). Flagged substitution: if the user has real licensed font files, swap in `@font-face` here.
- `SKILL.md` for Claude Code portability.
- A UI kit recreation (e.g. a settings screen) composing the primitives.

## Reference
`Material Design 3.dc.html` (project root) remains a full interactive style-guide/gallery — light/dark toggle, seed-color theming, and every M3 component — useful as a visual reference while the structured system above is completed.

## To make this usable as a Design System by other projects
Set this project's file type to **Design System** via the Share menu.
