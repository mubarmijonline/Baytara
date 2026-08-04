# Main Category Video Lock Design

## Goal

Improve the public website category browsing experience and make protected video playback visibly locked for visitors who are not signed in.

## Approved Scope

- Enhance category presentation on the main website without changing the catalog API contract.
- Link category cards on the home page directly to the filtered video library.
- Let `/videos?category=<slug>` open the library with that category selected.
- Show a clear locked/register state on video cards when playback is unavailable to the current visitor.
- Show a clearer locked panel on video detail before anonymous playback.

## Architecture

This is a frontend-only change in the public React app. The existing API already returns `category`, `access_type`, `can_play`, `requires_auth`, and `requires_phone`, so components can derive the UI state locally. The video detail page keeps the existing secure playback flow and only changes the pre-play presentation.

## Components

- `frontend/web/src/pages/Videos.jsx`: richer category filter cards and query-string category initialization.
- `frontend/web/src/pages/Home.jsx`: category cards navigate to `/videos?category=<slug>`.
- `frontend/web/src/components/VideoCard.jsx`: locked/register overlay and card-level CTA.
- `frontend/web/src/pages/VideoDetail.jsx`: clearer locked overlay for anonymous or incomplete-account viewers.
- `frontend/web/src/lib/i18n.jsx`: Arabic and English strings for the new locked/category copy.
- `frontend/web/src/pages/videos.test.jsx`: regression tests for the public website behavior.

## Testing

Use Vitest for the React behavior and Vite build for compilation. The tests must prove the new UI states fail before implementation and pass after implementation.
