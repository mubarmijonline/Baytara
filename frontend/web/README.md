# Baytara — Main Website (Phase 1 front-end)

Arabic-first (RTL) React + Vite front-end for the Baytara veterinary learning platform.
This is the **Phase 1** deliverable: a clickable, responsive site built with **mock data**
(no backend yet) for client approval. UI follows `design-systems/baytara/`.

## Run

```bash
npm install
npm run dev      # local dev server (http://localhost:5173)
npm run build    # production static build → dist/
npm run preview  # preview the production build
```

## Structure

- `src/theme/` — design tokens (accent `#e11b22`, gradients, Tajawal font) + global CSS
- `src/data/mock.js` — mock content mirroring the design (replaced by real APIs in Phase 3)
- `src/layouts/` — shared shell: top bar, sticky header, footer
- `src/components/` — reusable UI (CourseCard, PageHero, primitives)
- `src/pages/` — routes:
  - Design pages: Home, Courses, CourseDetail, Instructor, Pricing, Business, Auth, Dashboard
  - Added pages: About, Blog + BlogPost, Content, Contact, Learn (video player mock), NotFound

## Notes

- Fully RTL (`dir="rtl"`, `lang="ar"`); Arabic default, multilingual-ready later.
- The Learn page's player is a placeholder; Phase 5 swaps in the VdoCipher DRM player.
- All navigation (course/instructor open, pricing & auth toggles, catalog filters) is wired.
