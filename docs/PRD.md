# Baytara (بيطرة): functional PRD

**Status, 2026-10-01.** Website, student area, admin portal and instructor portal are live on
baytara.app. The Android app is code complete and has not run on hardware; the iOS app has
never been compiled. Card payment is built and waits on gateway credentials; no real payment
has been taken yet. Self-service account deletion is built (milestone 27) and goes live with
its deploy.

This document describes behaviour only. How it is built lives in the implementation plan
and the milestone files.

---

## 1. Purpose and audience

Baytara is an Arabic-first (right to left, English available) e-learning and advisory platform
for veterinary medicine in Egypt and the region. It sells and streams protected video courses,
and gives away free videos, articles and book summaries to bring people back.

- **Primary audience:** veterinarians and veterinary students, who verify their status to unlock
  specialist content.
- **Secondary audience:** livestock owners, breeders and other non-vets, who get free content and
  a paid tier of their own.
- **Business goals:** sell courses on the web (including through links sent over WhatsApp and
  email), keep paid video from leaking, and make every leak traceable to one account.

---

## 2. Users and roles

Every account has exactly one role: student, instructor or admin. There is no separate owner
role. Admin accounts are created by the operator from the server; there is no forced password
change on first sign-in.

### Visitor (not signed in)
- Browse the home page, catalogue, course pages, video library, paths, bundles, instructor
  profiles, the library shelves, policy pages, about, contact and business pages.
- See prices and what each item requires.
- Open a public certificate verification page.
- Cannot play any video (free ones included) or read a book summary; is asked to sign in.

### Student (general)
- Everything a visitor can do, plus: play free content, buy paid "general" content, take exams,
  earn certificates, review courses they bought, manage profile and devices, read notifications,
  read book summaries.
- Must have a phone number on file before any video plays (the phone gate).
- Sees vet-only items in listings, with a lock that explains how to unlock them.

### Student (verified vet)
Verification ("توثيق") marks a student as a veterinarian or as a veterinary student. Both
unlock exactly the same content; the label differs only.

What verification unlocks, by access tier:

| Tier | Price | Who may watch or buy |
| --- | --- | --- |
| Free | free | anyone with an account |
| Vet free | free | verified vets only |
| Baytarian | paid | verified vets only |
| General | paid | non-vets only; a verified vet is refused it |

- A verified vet is never offered a price or a buy button on a general item; they are told the
  tier is for non-vets.
- A non-vet looking at vet-only content is told to verify, not asked to pay.

### Instructor
- Uses the instructor portal only. Sees and edits only their own courses, units, lessons,
  students and sales. Anything belonging to another instructor behaves as if it does not exist.
- Creates courses (including setting price, tier, access period and publishing them), units and
  lessons, and writes the course exam.
- Video rights are three switches an admin sets per instructor: add (on by default), edit (off by
  default), delete (off by default).

### Admin
- Full control of content, people, money records, verification, video monitoring and site
  settings through the admin portal.
- Exempt from audience rules and from the video sharing limits.
- Receives operational notifications: device change requests, automatic verifications to
  review, and accounts blocked for suspicious playback.

---

## 3. Screens and flows

### 3.1 Website (public)
- **Header:** الكورسات, الفيديوهات, الاستشارات (opens the free advisory content), مكتبة بيطرة,
  العضوية (explains the four tiers), للشركات, plus search, notifications bell and account.
- **Phone tab bar:** الرئيسية, الكورسات, مكتبة بيطرة, and لوحتي (or "تسجيل الدخول" for a visitor).
  Hidden on the lesson player.
- **Home:** CMS-driven hero and trust chips; resume card "أكمل من حيث توقفت" (real next lesson,
  percent, courses, hours watched, streak) for a signed-in learner, a featured course otherwise;
  the "تعرّف على المنصة" strip of platform videos; paths; categories; free videos; instructors;
  testimonials; business banner; closing call to action. Restrained motion, fully off when the
  device asks for reduced motion.
- **Policy pages:** privacy, refund, terms, digital delivery. All four are linked from the
  footer whether or not the CMS sets a link. Footer and checkout show accepted payment methods.
- **Contact:** a form whose messages land in the admin inbox. **Business:** a page for
  organisations, CMS-driven.

### 3.2 Sign-up, sign-in, phone gate and devices
- **Sign-up (email):** name, email, phone (validated; country picker) and a password of at least
  8 characters.
- **Sign-in:** email and password, or Google. The Google button is hidden when Google sign-in is
  not configured. A Google account may arrive with no phone.
- **Phone gate:** a signed-in account with no phone is sent to a focused "add your phone" step
  before any video, then returned to where it was going. The phone is printed in the video
  watermark, which is why it is mandatory.
- **Device limit:** an account may be signed in on two machines. Several browsers on the same
  machine count as one. Signing in on a third machine is refused with the list of registered
  machines and a message explaining that a slot must be freed from one of them.
- **Device change ("swap"):** from the account screen a learner may remove a machine themselves
  once per window (180 days by default, admin-set; the window starts at the first removal). The
  screen shows changes left and when the window resets. Once spent, the screen offers a request
  to an admin ("طلب تغيير جهاز"); a pending request is shown as pending with "do not send
  another". An admin approval grants one more change in the current window.
- **Sign-out** frees that device's slot.

### 3.3 Catalogue and discovery
- **Courses catalogue:** search by title; filters for category, level (beginner, intermediate,
  advanced, breeders), access tier, duration (under 3 h, 3 to 8 h, 8 h and over), minimum rating;
  sorts: newest, oldest, most popular, top rated, price up, price down. Each filter shows how many
  results it would give, counted with that filter itself excluded, and a zero is shown, not hidden.
- **Video library:** standalone videos with search, category chips, tier and length filters
  (under 10 min, 10 to 30, over 30) and sorts (newest, oldest, longest, shortest). Pinned videos
  lead the default order.
- **Everything is listed to everyone.** Each card says what is needed (sign in, phone,
  verification, purchase, renewal) rather than hiding the item.
- **Course page:** title, category, rating tile (absent until there are reviews), lessons,
  minutes, learners, tier, level, last-updated date, objectives "ماذا ستتعلّم", what the course
  includes (access period, device allowance, lesson and hour counts, certificate), curriculum
  grouped into units, instructor, reviews, related courses, and a purchase card with a free
  preview lesson ("ابدأ المشاهدة مجاناً") when one exists.
- **Vet-only lock** on course and video pages: "وثّق حسابك كطبيب بيطري للمشاهدة" with the button
  "توثيق الحساب الآن", which opens verification and returns to the same page.
- **Learning paths:** ordered shelves of courses with a level, a course count and total length.
  A path has no price; each course keeps its own.
- **Bundles:** a set of courses and/or standalone videos sold together at one price, with its own
  tier and access period.
- **Instructor profile:** bio, expertise, real course and learner counts, courses.
- **Library (مكتبة بيطرة):** two shelves, articles and book summaries. Every page is public and
  shareable; reading a book summary needs an account and opens in an in-page reader with no
  download, print or text selection, remembering the last page on that device. The old blog
  address redirects here and old article links still open.

### 3.4 Purchase
- **What can be bought:** a course, a renewal of a lapsed course, a bundle, or a standalone video.
  A lesson inside a course cannot be bought on its own.
- **Flow:** buy page shows the item and the server's price, an optional discount code box, the
  accepted methods, then hands off to the gateway's hosted page. On return, a callback screen asks
  the server for the real outcome and shows paid, failed, or "still processing, do not pay again".
- **Gateway:** checkout uses Kashier when its keys are saved in the admin, Fawaterak otherwise. With
  neither configured, the buy page says payment is not open yet instead of failing mid-form.
- **Direct payment link:** each paid, published course has a link an admin copies with "لينك الدفع".
  Opening it signs the buyer in if needed (the link survives the sign-in), shows the course and
  price, gets the server quote, then goes straight to the gateway. Meant for WhatsApp and email.
- **Discount codes ("أكواد الخصم"):** applying a code re-quotes and shows the new total with the
  list price struck through. A code that fails at checkout fails the checkout.
- **Renewal:** an expired enrolment offers renewal, not a new purchase, priced at a percentage of
  the course price (30% by default, admin-set). Lifetime courses have nothing to renew.
- **InstaPay receipt review:** not live. There is no screen for a student to upload a receipt and
  no review queue in the admin; see section 5.

### 3.5 Lesson player
- Lesson bar with course title, "الدرس n من N" and course progress; the video; lesson title,
  description, duration and an in-progress chip; side panel with this course's units (with ticks)
  and a second tab browsing all content.
- **A refusal is a panel in the middle of the player** with the reason and the one action that
  clears it: sign in, add phone, verify, buy, or renew. Where nothing can be done (wrong tier for a
  vet, unsupported browser, rate limit) there is no button.
- **Unsupported browser:** for protected video, the player shows guidance naming the right
  browser, a copy-link button and get-the-app, instead of starting playback. Free unprotected
  video plays with a one-line suggestion.
- Resumes where the learner stopped. Progress, streak and hours update from actual viewing.

### 3.6 Exams and certificates
- The course page and the exam page say an exam exists before the course is finished; questions
  are handed out only once every lesson is complete.
- **Sitting:** a paper of questions (all, or a random draw from a bank), a countdown when there is
  a time limit, automatic submission at zero, then the score, pass or fail, and (if the examiner
  allows) the marking with per-question explanations. Retries are unlimited.
- **Achievement certificate:** issued automatically when the learner finishes a course that offers
  a certificate and, if the course has a live exam, has passed it. It has a public verification
  page by serial, a QR code on the printed sheet, and prints to PDF from the browser.
- **Attendance certificate:** issued when a learner finishes a course that has a live exam,
  regardless of the exam result. Printable, not a verification document.
- **Public verification:** anyone with the serial sees the learner's name, the course and the
  serial, nothing else. The app's verification accepts either kind of serial.

### 3.7 Student area (account)
- **Profile:** cover and avatar upload (up to 5 MB), name, headline, location, bio; verification
  badge; stats; activity feed (lessons completed, certificates, payments); certificates. Email is
  read-only; phone is required whenever it is changed; a national ID number is optional.
- **My learning:** enrolments with progress, expiry and renewal; resume point. Free courses do not
  appear, because a free course creates no enrolment; the empty state says so.
- **Payments:** history with status.
- **Devices:** registered machines, changes left, reset date, request to admin (see 3.2).
- **Reviews:** an enrolled learner rates a course 1 to 5 with optional text, edits it by posting
  again, or withdraws it.
- **Delete account ("حذف الحساب"):** linked from the settings tab and reachable directly at
  baytara.app/account/delete, which is also the address given to the app stores. The page lists
  what is deleted and what is kept, asks for the password (not for a Google-only account) and a
  tick-box confirmation, then signs the learner out. A visitor is asked to sign in first and is
  given the support address if they cannot. Instructors and admins are told their accounts are
  closed by the platform team.

### 3.8 Vet verification
- Reached from the account, the pricing page, any vet-only lock ("توثيق الحساب الآن"), and the
  player.
- **Three routes:** syndicate card (front and back; each field checked live before submitting),
  national ID (the occupation must read "طبيب بيطري"), or another document (college ID,
  enrolment letter, or a card from another country).
- **Three outcomes:** verified now (as a vet or as a student); sent to a person for review
  (the screen says the answer arrives in notifications and not to submit again); or could not
  verify, with the reasons, nothing stored, free to retry or use another route.
- The flow checks first and shows a notice instead of the form when the account is already
  verified or has a request pending.
- After an immediate approval, the learner returns to the lesson or page that asked; after "sent
  for review", to the profile.
- Upload shows real progress, then an honest elapsed-seconds counter while the document is read
  (typically 10 to 40 seconds).

### 3.9 Notifications
- Bell with unread count in the header (website) and in the app; list, mark one read, mark all
  read. Refreshed about once a minute while the site or app is open.
- Sent for: payment confirmed (with what was activated), renewal, verification approved or
  rejected, un-enrolment with the admin's reason, and to admins as listed in section 2.

### 3.10 Admin portal
Sidebar in four groups with a quick search on Ctrl/Cmd+K; drawer on phones; Arabic and English.

- **Dashboard:** what is waiting (queues sorted by size, one sentence when all are clear), quick
  creates, revenue and payment statuses, counts for learners, content and accounts, storage.
- **Today's desk:** payments (read-only list by status with revenue; no approve or reject
  actions), discount codes, vet verification queue (view documents, verify, reject with reason,
  revoke), messages inbox.
- **Content:** courses (create, edit, publish, unpublish, delete; level, certificate flag,
  objectives; copy payment link), course content (units, ordering, videos per unit, upload into the
  course to the protected host or link an existing protected-host video by its ID, exam builder),
  video library (pinning panel "المثبّت في المقدمة", editor, per-video plays and viewers), upload
  to Baytara's own server (free videos only), bundles, paths, categories and hierarchy, library
  articles and books.
- **People:** enrolments (search, un-enrol with a reason shown to the learner, optionally record a
  refund as a percentage or exact amount; money is returned by hand), users (create, edit, set
  role, enable or disable, delete; device change requests approve or decline), instructors (enable, video
  permission switches), reviews (publish, hide, delete).
- **System:** video monitoring (every playback attempt and refusal with reason, device and
  address; suspicious events; export), site settings (all public copy, contact details, socials,
  testimonials, business page, and integrations: gateway keys and test or live mode, protected
  video host key, and the playback policy switches).

### 3.11 Instructor portal
- Sign in, then: dashboard (courses, published, students, revenue), courses (create, edit,
  publish, delete own; units; lessons; videos within the admin-set permissions), exam builder for
  own courses (pass mark, time limit, questions per attempt, marking view, explanations),
  students (active enrolments in own courses), revenue and payments for own courses.

### 3.12 Mobile app (Android and iOS)
- **First run:** a three-page tour (Arabic catalogue by practising vets; verification, not payment,
  opens specialist material; videos carry your name and phone). Skippable.
- **Tabs:** الرئيسية, الدورات, المحتوى, and حسابي (or "تسجيل الدخول" for a visitor).
- **Parity with the website:** sign-in (email, Google), phone gate, device screen with changes left
  and admin request, home with "تعرّف على المنصة" in pinned order, catalogue with full filters and
  counts, course and video pages with the same vet-only lock, paths, bundles, instructors, library
  with the book reader, player, exams, certificates and verification of both kinds, verification
  routes, notifications, profile, payments history, settings.
- **Purchase on Android:** the gateway opens in a secure browser tab; the return opens the app,
  which asks the server for the outcome. Discount codes work as on the website.
- **Purchase on iOS (reader model):** prices are shown and owned content plays, but there is no buy
  button, no discount box and no link out. In place of a buy button the app shows the plain,
  non-tappable sentence "لتفعيل الاشتراك أو شراء الدورة، يرجى زيارة موقعنا الإلكتروني baytara.app".
- **Sharing:** a book or article is shared as an ordinary website link that opens the app for
  someone who has it and the website for someone who does not.
- **Policy pages** (privacy, terms, refund, delivery, about, contact) open on the website.
- **Delete account:** in settings for a student, the same screen and rules as the website's.
- Sign-out frees the device slot. Reinstalling the app on the same phone uses a new slot (device
  identity is not restored from backups).

---

## 4. Rules the system enforces

### 4.1 Identity and devices
- Two machines per account by default; browsers on one machine count once.
- One self-service device change per window (default 180 days); further changes only through an
  admin-approved request. One pending request at a time.
- Every authenticated request from a device must match the device the session was issued to; a
  device removed elsewhere is signed out with an explanation.
- Phone required to register by email and before any playback; profile edits cannot change role,
  email or verification status.

- **Closing an account** (students only, from the website or the app) needs the password when the
  account has one and an explicit confirmation always. It removes the name, email, phone, national
  ID, verification documents and their files, profile photos, reviews (course ratings are
  recounted), certificates (their public pages stop verifying), devices and notifications. It
  keeps payments, enrolments, progress and exam attempts, attached to an anonymous account, as
  financial records. The email is freed: registering with it again, or signing in with the same
  Google account, starts a new, empty account. An admin cannot switch a closed account back on.

### 4.2 Access and audience
- The four tiers in section 2 are enforced by the server on every listing, purchase and play;
  the audience rule is checked before the price.
- A verified student and a verified vet have identical access.
- Access periods: a course or bundle may set a number of days; none means lifetime. Expired access
  is renewed, not re-bought.
- A free course grants access without an enrolment and earns no certificate.

### 4.3 Money
- **The server names the price.** The browser or app sends a code, never an amount. The charge is
  recomputed from the item and the code at checkout.
- A direct payment link starts checkout only after the server quote.
- Access is granted only when the gateway's server-to-server notification is verified (signature
  checked; an amount that differs from the quote grants nothing). Re-delivered notifications grant
  once. The browser's return from the gateway is never proof of payment, in either direction.
- Buying something already owned is refused.
- **Discount codes:** percentage (at most 100%) or fixed amount; optional start and expiry; optional
  total cap; per-buyer cap defaulting to one. A fixed discount never takes the price below zero.
  Only paid payments use up a code; an abandoned checkout does not. Codes are case-insensitive and
  cannot be renamed. A used code cannot be deleted, only deactivated.
- **Refunds** follow the published policy (within 7 days and under 20% watched) and are paid back by
  hand; the platform records the decision and removes access.
- Prices are in Egyptian pounds with no added fees.

### 4.4 Video protection
- No public video addresses. Each play gets a short-lived token, issued only after every check:
  signed in, account active, phone on file, device registered and matching, entitled, audience,
  browser policy.
- Tokens are tied to the viewer's network address and, on the web, to the site's own address.
- **One stream at a time** per account; a second device is refused while the first is active.
- **40 play tokens per account per hour.**
- **Three suspicious events in 15 minutes** block playback for the account and notify every admin.
- **Watermark** on every stream: viewer name, email, phone and account ID, moving across the
  picture. On the website an inaudible audio mark carries the account ID.
- **Capture rules:** paid videos are always capture-protected; free videos only when an admin ticks
  "حماية من تسجيل الشاشة". Paid videos must live on the protected video host; Baytara's own server
  (no DRM) accepts free videos only.
- **Browser policy for protected video:** in-app social browsers are refused. Apple rules follow the
  Apple DRM certificate switch (off today: Mac Safari is refused and pointed to Chrome; on: Mac
  browsers other than Safari are refused). A strict switch refuses browsers without hardware
  protection; the client chose this block, to be turned on once the Apple certificate is
  confirmed. A further switch can require the app on phones, to be turned on only after the apps
  are in the stores.
- **On the web page:** losing focus pauses and covers the picture; save, view-source and print
  shortcuts are blocked and logged; right-click, drag and copy are blocked.
- **Android app:** on the player and the book reader, screenshots are refused and screen recordings
  come out black and silent. Elsewhere in the app screenshots are allowed.
- **iOS app:** capture detection and cover only; real blocking depends on the Apple DRM
  certificate, which is not in place.
- Every allowed and refused play is recorded with its reason for the admin.

### 4.5 Learning, exams and certificates
- A lesson counts as watched at 90% of the video actually seen; skipped parts and rewatches do not
  add coverage. Course progress follows completed lessons.
- A streak day is a day a video was started; browsing does not count.
- **Exam:** available only to an active, unexpired enrolment at 100% completion. Pass mark 70% by
  default. Optional time limit of up to 600 minutes, **enforced by the server** (a late submission
  is refused regardless of the on-screen countdown). A sitting is marked against the questions it
  was given. Publishing is refused when the draw is larger than the bank. Unlimited attempts; a
  pass is never revoked by a later attempt.
- **Certificate issuance** is automatic and happens once per learner per course (see 3.6).
- Reviews require an active enrolment; one per learner per course; a course with no reviews shows
  no rating rather than zero.

### 4.6 Verification
- One syndicate card or national ID verifies one account only. A typed national ID is optional,
  checked as an Egyptian number when given, and cannot be changed once set.
- File limits: up to 8 MB per verification image.
- Automatic approvals are reported to admins, and every fifth one is flagged for a spot check.
  Admins can revoke any verification.

### 4.7 Content and catalogue
- **Pinned videos:** at most 12, in admin-set order. They lead the public video library and the
  app's list; the home strip "تعرّف على المنصة" shows only videos filed under no section, so a
  pinned video with a section leads the library but not the strip. A sort the visitor picks
  (oldest, longest, shortest) is honoured as chosen. A pinned video later unpublished is flagged
  to the admin.
- Draft courses inside a path are not counted on its card.
- Unrated items show "new", never a zero rating.

---

## 5. Out of scope, or not built yet

- **Password reset:** none. A user who forgets their password must contact support.
- **Push notifications:** none; notifications appear only while the site or app is open.
- **Apple in-app purchase:** not built; iOS uses the reader model.
- **Student assessment (تقويم الطالب):** not started; scope not agreed with the client.
- **InstaPay receipt payments:** the earlier receipt-upload and admin-approval flow is dormant. No
  student upload screen, no admin review actions; card gateway only.
- **Consultations:** the menu item opens free advisory content; no consultation booking. The
  profile's consultations tile is absent.
- **Not built:** personal lesson notes ("ملاحظاتي"), favourites, the redesigned courses and videos
  listings, subscriptions or wallets, invoices, admin reports and audit log screens, admin
  broadcast notification screen, languages beyond Arabic and English.
- **Instructor revenue from card payments:** the instructor dashboard and revenue page count only
  approved InstaPay payments, so card sales do not show there yet.
- **Freeing a device slot from the refusal screen:** not possible; a learner whose two machines are
  both gone must contact support.
- **Book reading position:** kept per device only, not synced to the account.
- **Real DRM for book summaries:** not possible; the reader is a deterrent.
- **Not yet done outside the code:** gateway credentials, support phone and office address,
  official payment-method artwork, the Apple DRM certificate, turning on the strict browser
  policy, release signing for Android, app-link verification files, Google Play billing review,
  any iOS build, and every hardware check on phones.

---

## 6. How "done" is verified

Each check is behavioural and must hold on the live site or on a real device, not only in tests.

**Accounts and devices**
- Registering without a valid phone is refused; a Google account with no phone cannot reach any
  video until it adds one, then lands back where it was going.
- A third machine is refused at sign-in with the list of machines. Removing one from a signed-in
  machine lets it in; a second removal in the same window shows the admin request, not an error.
- Signing out frees the slot.
- Closing an account with a wrong password is refused and keeps the session; with the right one,
  the old email and password no longer sign in, the certificate page answers "not found", the
  payment rows remain, and the same email can register a new, empty account.

**Catalogue and access**
- A visitor sees every published course and video with its lock reason.
- A non-vet on vet-only content sees "وثّق حسابك كطبيب بيطري للمشاهدة" and "توثيق الحساب الآن";
  after an immediate verification they return to the same video and it plays.
- A verified vet is never shown a price or buy button on a general item.
- Filter counts do not zero out sibling options when one is ticked.

**Purchase**
- A purchase is confirmed by the server's verified gateway notification, not by the browser
  redirect: a "success" redirect over an unpaid payment shows pending; a "fail" redirect over a
  paid one shows paid.
- A notification with a bad signature or a wrong amount grants nothing; a repeated one enrols once.
- A discount code changes the charged amount only as the server computes it; an expired or capped
  code fails the checkout; an abandoned checkout does not use up a one-use code.
- A payment link sent to a signed-out user reaches the gateway after sign-in, at the quoted price.
- The iOS build has no buy button, discount box or link out anywhere.

**Player and protection**
- With no entitlement, no play token is issued at all.
- A second device is refused while the first is playing; the 41st token in an hour is refused;
  three suspicious events in 15 minutes block playback and notify admins.
- The watermark shows name, email, phone and account ID and is legible in a recording.
- On Android, a screen recording of a lesson is black and silent.
- A paid video cannot be uploaded to Baytara's own server.
- Every refusal shows its reason and the right action in the middle of the player.

**Learning, exams, certificates**
- Watching 90% of a lesson marks it complete; skipping to the end does not.
- The exam's questions are withheld until 100% completion; a submission after the time limit is
  refused by the server.
- Passing (or finishing a course with no live exam) issues one certificate; its serial opens a
  public page showing name and course only, and the QR code leads there.

**Admin and instructor**
- Pinning a 13th video is refused; pinning past four keeps the earlier ones in order.
- An instructor opening another instructor's course gets "not found".
- An instructor without the edit or delete switch cannot change or remove a video.
- Every admin destination is reachable from the sidebar and the quick search, in both languages.
