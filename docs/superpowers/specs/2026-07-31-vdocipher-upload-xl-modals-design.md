# VdoCipher Upload and XL Admin Modals Design

Date: 2026-07-31

## Goal

Let an administrator upload a local video file from Baytara's Videos page directly to VdoCipher, place it in the folder matching Baytara's course logic, and create the corresponding Baytara video record after upload. Make every admin modal use one extra-large responsive size.

## Scope

- Add `Upload to VdoCipher` to the existing Videos page.
- Upload to VdoCipher from the browser using temporary credentials issued by Baytara's backend.
- Let the admin select standalone or a course before upload.
- Show upload progress and prevent closing or submitting twice while uploading.
- Create the Baytara `Lesson` record after VdoCipher accepts the file.
- Change the shared modal and confirmation/prompt dialog to the same XL responsive width.
- Keep all existing users and the cleaned production database unchanged.

English admin localization is a separate change because it affects every page and is independent of video upload and modal sizing.

## Upload Flow

1. The admin opens an XL upload modal from the Videos page.
2. The admin enters a title, chooses a file, and selects standalone or a course.
3. The frontend asks Baytara for VdoCipher upload credentials.
4. The backend verifies admin access, ensures the matching VdoCipher folder exists, and requests temporary upload credentials from VdoCipher using the server-side API secret.
5. The browser uploads the file directly to VdoCipher's returned S3 upload URL with `XMLHttpRequest`, allowing upload progress without sending the large file through Flask.
6. After a successful upload, the frontend calls the existing VdoCipher import endpoint to create the Baytara video record with the returned video ID and selected course.
7. The Videos list refreshes and displays the new row. VdoCipher encoding status may remain queued until processing finishes.

The VdoCipher API secret never reaches the browser. Only temporary upload fields returned for that one upload are exposed.

## Backend

Extend the existing VdoCipher admin client with an upload-credentials method using:

- `PUT https://dev.vdocipher.com/api/videos`
- query parameters: `title` and `folderId`

Add one admin-only endpoint:

- `POST /api/v1/admin/vdocipher/upload-credentials`
- body: `{title, course_id?}`
- response: `{video_id, upload_link, fields}`

The endpoint validates the title and course, ensures the course or standalone folder, and normalizes VdoCipher's `clientPayload` into fields suitable for browser `FormData`.

The existing `POST /api/v1/admin/vdocipher/import` remains responsible for creating the Baytara video record after upload.

## Frontend

Add an upload button to `Videos.jsx`. The modal contains:

- title
- local video file
- standalone/course destination
- upload progress
- upload and cancel commands
- inline API/upload errors

The browser posts the returned fields plus `success_action_status=201`, an empty `success_action_redirect`, and the file last in the multipart body, matching VdoCipher's documented browser upload sequence.

The production CSP permits HTTPS uploads to VdoCipher's returned Amazon S3 hosts while retaining the current restrictions for other scripts and connections.

## XL Modals

The shared `.modal` width becomes:

- desktop: up to `1200px`
- viewport constraint: `calc(100vw - 40px)`
- height: up to `calc(100vh - 40px)` with internal scrolling

Remove the confirmation dialog's inline `400px` override so all admin modals use the same rule. Mobile behavior remains responsive.

## Errors and Safety

- Missing API secret: show the existing `no_api_key` error.
- Missing title, file, or course: reject before requesting credentials.
- VdoCipher credential failure: no Baytara row is created.
- File upload failure: no Baytara row is created; retry starts a new upload request.
- Baytara import failure after file upload: show the VdoCipher video ID so the admin can import it from the existing VdoCipher picker instead of uploading again.
- Repeated submission is disabled while uploading.

## Testing

- Extend the VdoCipher backend self-check to verify the upload-credentials endpoint, folder selection, normalized upload fields, and invalid course handling.
- Add a small frontend upload helper self-check for successful and failed XHR completion if the current frontend toolchain supports it without new dependencies; otherwise verify through the production build and a manual browser upload against VdoCipher.
- Verify all admin modals inherit the XL rule and the dialog no longer has a fixed inline width.
- Run the admin production build and all backend self-checks against isolated temporary databases.

## Explicitly Deferred

- Resumable/chunked uploads.
- Uploading multiple files in one action.
- Moving an existing VdoCipher video between folders through an undocumented API.
- Full Arabic/English admin localization; it receives its own design and implementation pass.
