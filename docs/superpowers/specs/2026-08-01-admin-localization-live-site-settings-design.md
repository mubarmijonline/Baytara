# Admin Localization, Live Site Settings, and User Retention Design

## Objective

Make the Admin portal fully bilingual, make the public website's existing design editable from Site Settings with an accurate live preview, and reduce production users to exactly these two active accounts:

- `ahmeddiab1712@gmail.com`, role `admin`
- `mubarmijonline@gmail.com`, role `instructor`

All other users must be removed after a verified production backup. Existing VdoCipher credentials and platform folder settings must remain intact.

## Scope

### User retention

Add a confirmation-gated CLI operation that:

1. Resolves the two retained email addresses case-insensitively.
2. Aborts without changing data unless each address resolves to exactly one user.
3. Sets the Ahmed account to active `admin` and the Mubarmij Online account to active `instructor`.
4. Removes every other user and any dependent user-only records that prevent deletion.
5. Preserves all site settings, taxonomy, and VdoCipher configuration.
6. Reports retained identities, removed-user count, and final role counts.

Production execution requires a fresh database backup and post-operation verification showing exactly two users.

### Complete Admin localization

The existing Admin language provider remains the source of language, direction, and persistence. Every routed Admin page and shared Admin component must use language-aware copy rather than hard-coded Arabic UI strings.

Coverage includes:

- Dashboard
- Payments and payment details
- Veterinarian verification
- Courses and course content
- Video Library and video editor
- Bundles
- Hierarchy
- Categories
- Content and articles
- Users and user details
- Messages
- Site Settings
- Shared list editors, dialogs, validation errors, empty states, statuses, actions, and modal labels

In English mode, application chrome and UI copy must be English and the document must be LTR. Arabic may still appear where it is user-entered or catalog data with no English value.

### Fixed-design Site Settings

Site Settings will edit the current public-site design rather than provide a drag-and-drop builder. The editor is organized into these views:

- Home
- Header and footer
- About
- Business
- Contact and social links
- Integrations

Every translatable website field has Arabic and English values. Repeated content such as statistics, testimonials, benefits, trust marks, and footer columns can be added, edited, removed, and reordered. Structural layout, visual tokens, navigation destinations, and component composition remain controlled by code.

Integration credentials remain in a separate view and are never exposed through the public settings endpoint or preview messages.

## Settings Contract

Backend defaults represent the text and repeated content currently hard-coded in the public website. Admin reads return a deep merge of saved settings over these defaults, so the current design is immediately visible and editable even before the first save.

Translatable scalar values use this stored shape:

```json
{
  "ar": "Arabic value",
  "en": "English value"
}
```

Repeated records use localized fields only where needed. Non-translatable values such as URLs, phone numbers, numeric labels, and integration modes remain scalar.

The public `GET /api/v1/settings` endpoint:

1. Excludes every key beginning with `secret_`.
2. Deep-merges saved public values over defaults.
3. Recursively resolves localized values using `?lang=en` or `Accept-Language`, with Arabic fallback.
4. Returns the existing display-oriented shapes expected by public components, minimizing frontend coupling to storage details.

The Admin GET endpoint returns full bilingual values. The Admin PUT endpoint validates the supported schema, preserves unspecified secret values, and rejects malformed localized or repeated content instead of storing arbitrary shapes.

## Public Website Data Flow

The public application gains one settings provider at the layout boundary. It fetches settings once per page load and supplies the result through context. Existing components consume that context instead of issuing independent settings requests.

Saved workflow:

1. Admin saves settings.
2. Backend validates and persists them.
3. A normal public-site load fetches the localized settings.
4. Header, homepage, About, Business, Contact, social links, and footer render the saved values while retaining safe code defaults during request failure.

Preview workflow:

1. Site Settings embeds the actual same-origin public website in an iframe using preview mode.
2. Admin localizes the unsaved bilingual draft for the selected preview language.
3. Admin sends the draft through `window.postMessage` with a namespaced message type.
4. The public settings provider accepts messages only from the same origin and only while preview mode is active.
5. Public components rerender immediately from the draft without saving.

This uses the real website components, so the preview cannot drift from production design.

## Admin Settings Experience

Desktop uses an editor and preview split view. The editor remains the primary pane and the preview stays visible while fields change. Smaller screens stack the preview below the editor.

The page includes:

- Section tabs for the six settings views
- Arabic and English inputs grouped side by side
- Reorderable repeated-content editors
- Arabic/English preview control
- Home/About/Business preview destination control
- Refresh-preview command
- Sticky save bar with saving, success, and error states

The preview is read-only. Navigation inside the iframe is constrained to previewable public pages.

## Error Handling

- Missing public settings use current-design defaults.
- Public settings request failure keeps the website usable and logs no secret values.
- Invalid Admin payloads return `422` with stable validation codes.
- Preview messages with the wrong origin, type, or payload shape are ignored.
- User cleanup aborts atomically if retained users are missing, duplicated, or deletion violates an unhandled dependency.
- Save failure preserves the unsaved Admin draft.

## Testing

Backend coverage:

- Default settings and deep merge behavior
- Recursive Arabic/English localization and fallback
- Secret exclusion from public settings
- Admin settings validation and secret preservation
- User-retention confirmation, exact account resolution, dependent cleanup, role correction, and rollback behavior

Admin coverage:

- Every routed page renders English UI copy in English mode
- Arabic mode and RTL remain intact
- Settings tabs edit bilingual values without losing draft state
- Repeated content remains ordered
- Preview receives same-origin localized draft messages
- Saving submits the validated settings structure

Public website coverage:

- Settings are fetched once through the provider
- Header, Home, About, Business, Contact, and Footer render API settings
- Preview mode applies valid same-origin draft messages immediately
- Invalid preview messages are ignored

Production verification:

- Full backend, Admin, and public frontend test suites
- Production builds
- Fresh database backup
- Exactly two retained users with expected roles
- Authenticated Admin browser pass in Arabic and English
- Live preview reflects an unsaved edit
- Saved edit appears on the public website and is restored to the intended content after verification
- VdoCipher credentials and folder browsing remain operational

## Deployment

Deploy backend, Admin, and public web builds using explicit web-readable modes. Restart the backend, verify health, then run authenticated browser checks before executing the user-retention command. The retention command runs last so implementation failures cannot interfere with account access.
