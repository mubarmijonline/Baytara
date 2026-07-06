# Baytara

## Design systems

Two designs synced from claude.ai/design are stored under `design-systems/`:

- [`design-systems/baytara/`](design-systems/baytara/) — "Baytara" (بيطرة), an Arabic RTL online-learning platform. Source: [claude.ai/design/p/bda5ea54-94dd-46c9-b290-e9f996587fc6](https://claude.ai/design/p/bda5ea54-94dd-46c9-b290-e9f996587fc6?file=Baytara+Home.dc.html)
- [`design-systems/material-design-3/`](design-systems/material-design-3/) — Material Design 3 style guide/gallery + starter design tokens. Source: [claude.ai/design/p/9c9b055f-c665-4d20-8567-49b5ad431771](https://claude.ai/design/p/9c9b055f-c665-4d20-8567-49b5ad431771?file=Material+Design+3.dc.html)

Each `.dc.html` file is a self-contained Claude Design component (template + a `Component extends DCLogic` class) rendered by the bundled `support.js` runtime — open it in a browser after serving the folder, or `npm create vite@latest` around it to turn it into a real app.