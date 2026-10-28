# Baytara — how to upload to Google Play and the App Store

Written 2026-10-18 for this project. The store-listing texts (descriptions, privacy
answers, review notes) are in [APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md) and are
reused for Google Play below.

---

## The short answer

**Easiest route: Codemagic** (codemagic.io). It is a build service made for Flutter.
You connect your code once, and every time you press "Start build" it builds the
Android and iOS apps on its own computers, signs them, and uploads them to Google Play and
App Store Connect for you. You do not need Xcode, Android Studio or Java on your Mac.

Codemagic only **builds and uploads**. Nobody can skip the store reviews, and you still
fill in the store pages yourself (once). That part is described in steps 3 and 4.

| Route | Effort | Good for |
|---|---|---|
| **A. Codemagic** (recommended) | ~2 hours to set up, then one click per release | Both stores, repeatable, no local tools |
| B. Manual from this Mac | ~1 hour per release | A one-off upload |
| C. Hire someone | Cost, plus you must share account access | Only if you have no time at all |

---

## Step 1 — Project fixes (done 2026-10-24)

- **Android upload key** created: `android/upload-keystore.jks`, with its password and alias
  in `android/key.properties`. Both are git-ignored and exist **only on the Mac that made
  them**. **Back them up now** to a password manager and a second safe place. Losing them
  means asking Google to reset the upload key.
  - Upload key SHA-256: `DE:44:88:25:D8:C1:A0:15:1E:F8:18:B6:0D:C7:D6:00:0F:A2:2F:55:75:2D:B3:63:6B:57:81:1F:FB:2A:20:62`
- Release builds are signed with that key (`android/app/build.gradle.kts`), locally or on
  Codemagic.
- Android 12+ theme fixed for the video player.
- iOS: Google sign-in hidden (no Sign in with Apple needed), export-compliance flag set,
  privacy manifest added, "leaving the app = screen recording" bug fixed.
- Version `1.0.0+1`. Codemagic raises the build number on every upload by itself.
- Privacy policy, how-it-works, business and certificate pages open without signing in.

Still open: the iPad layout is the phone layout stretched (consider iPhone-only), and
everything needs a real-device test (step 6).

---

## Step 2 — The code is on GitHub

The app lives in **`mobile_app/`** of the `mubarmijonline/Baytara` repository, next to the
backend and website. Codemagic's settings are in **`codemagic.yaml` at the repository
root**, pointed at `mobile_app/`.

The keystore, `key.properties` and any Apple `.p8` / Google `.json` keys are **never**
committed. They go into Codemagic's secure settings (step 5).

---

## Step 3 — Google Play Console (one time, in the browser)

Go to **play.google.com/console**.

### 3.1 Check your account type first
- **Organization account:** you can publish to production directly.
- **Personal account created after November 2023:** Google requires a **closed test with at
  least 12 testers who stay opted in for 14 days** before you can apply for production.
  Start this as early as possible: it is the longest wait in the whole process.

### 3.2 Create the app
**Create app** → name `Baytara - بيطرة`, default language Arabic, **App** (not game),
**Free**, accept the declarations.

### 3.3 Set up your app (the "Dashboard" checklist)
Fill every item Google lists. Answers for this app:

| Item | Answer |
|---|---|
| Privacy policy | `https://baytara.app/privacy` |
| App access | **All or some functionality is restricted** → give the demo account (same as Apple's) and say playback needs a phone number on the account |
| Ads | No ads |
| Content rating | Fill the IARC questionnaire: category **Education / Reference**; no violence, no user interaction, no purchases. Mention medical/surgical educational content where asked |
| Target audience | **18+** (professional veterinary content). Not designed for children |
| News app | No |
| Data safety | Same data as APP_STORE_SUBMISSION.md section 7: name, email, phone, photos (verification), user ID, device ID, app interactions, diagnostics. All **collected**, **not shared**, **encrypted in transit**, users **can request deletion** (in-app Delete account + baytara.app) |
| Government app | No |
| Financial features | None |
| Health | Not a health app for humans (veterinary education) |

### 3.4 Store listing (Grow → Store presence → Main store listing)

Ready-made graphics are in `app_store_screenshots/google-play/`: `icon-512.png`,
`feature-graphic-1024x500.png`, and six 1080 × 1920 phone screenshots.

| Field | Value |
|---|---|
| App name (≤30) | `Baytara - بيطرة` |
| Short description (≤80) | `تعليم الطب البيطري بالعربية: دورات وفيديوهات من أطباء ممارسين` |
| Full description (≤4000) | the Arabic description from APP_STORE_SUBMISSION.md section 3 |
| App icon | `google-play/icon-512.png` |
| Feature graphic | `google-play/feature-graphic-1024x500.png` |
| Phone screenshots | the six `google-play/phone-*.png` (1080 × 1920) |
| Tablet screenshots | Optional; skip if not targeting tablets |
| Category | Education |
| Contact email | **[Baytara support email]** |

Add an **English** listing under "Manage translations" with the English texts.

On Google Play the app can say that enrolment happens on the website; Google has no rule
against it. Keep the same neutral wording on both stores anyway, to keep things simple.

### 3.5 Turn on Play App Signing
On the first upload Google offers **Play App Signing** — accept it. Google keeps the final
signing key; you keep the **upload key** from step 1.

After the first upload, go to **Setup → App signing** and copy the **SHA-256** and **SHA-1**
of the *app signing key*. They are needed for:
- `https://baytara.app/.well-known/assetlinks.json` (so baytara.app links open the app),
- the Google Cloud **Android OAuth client** (so Google sign-in works in the Play version).

### 3.6 First upload must be manual
Google's upload API only works after one build has been uploaded by hand:
**Testing → Internal testing → Create release → upload the `.aab` file**. After that,
Codemagic can upload every future build automatically.

---

## Step 4 — App Store Connect (one time, in the browser)

Everything is in **APP_STORE_SUBMISSION.md**. In order:

1. **Certificates, Identifiers & Profiles** (developer.apple.com): register the App ID
   `app.baytara.app` with **Associated Domains** (and **Sign in with Apple** if used).
2. **App Store Connect → Apps → +**: create the app (section 1 of that file).
3. Fill App Information, the 1.0 page, Pricing, Age rating, App Privacy (sections 2–8).
4. Prepare the review notes and demo account (section 9) and Baytara's authorization letter.
5. Create an **App Store Connect API key** for Codemagic:
   **Users and Access → Integrations → App Store Connect API → +**, role **App Manager**.
   Download the `.p8` file (only downloadable once) and note the **Key ID** and
   **Issuer ID**.

---

## Step 5 — Codemagic setup (one time, ~30 minutes)

1. Sign up at **codemagic.io** with the GitHub/GitLab account that owns the repository.
   There is a free monthly allowance of build minutes; check their pricing page for current
   limits.
2. **Add application** → pick the repository → project type **Flutter App**.
3. **Team settings → Integrations → Developer Portal**: add the App Store Connect API key
   (`.p8` file, Key ID, Issuer ID). Codemagic then creates the iOS certificates and
   provisioning profiles itself.
4. **Code signing identities → Android keystores**: upload `upload-keystore.jks` with its
   passwords and alias.
5. **Google Play access**: in Google Cloud create a **service account** and a JSON key; in
   Play Console → **Users and permissions → Invite new user** with the service account's
   email and give it **Release** permissions for this app. Upload the JSON key to
   Codemagic.
6. `codemagic.yaml` is already in the repository. Use these exact names in Codemagic:
   - Android keystore reference name: **`baytara_upload`**
   - App Store Connect integration name: **`Baytara ASC`**
   - Environment variable group **`google_play`** containing
     **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`** (paste the service account JSON, mark Secure)
   - In `codemagic.yaml`, replace `APP_STORE_APPLE_ID: 0000000000` with the app's numeric
     Apple ID (App Store Connect → App Information → Apple ID).
7. Run the workflows from the Codemagic dashboard (**Start new build** → pick one):
   - **Android - first build**: once. Download the `.aab` and upload it by hand to Play's
     internal testing (step 3.6).
   - **Android - Play internal testing**: every later Android release.
   - **iOS - TestFlight**: every iOS release.
   Each takes about 15–25 minutes.

---

## Step 6 — Test, then release

1. **Test on real phones** — the simulator/emulator cannot play the protected videos.
   - Android: join the internal test from the Play Console link and install from Play.
   - iPhone: install **TestFlight** from the App Store and accept the invite.
   - Check: sign in, a course you are enrolled in plays, the watermark shows, screenshots
     come out black, links from baytara.app open the app.
2. **Google Play:**
   - Organization account: **Production → Create release → promote the tested build →
     Send for review.**
   - Personal account: promote to **Closed testing**, get 12 testers opted in for 14 days,
     then **Apply for production**.
3. **App Store:** on the 1.0 page choose the TestFlight build → **Add for Review →
   Submit**.

**Typical review times:** Apple 1–2 days. Google: first review of a new app can take up to
7 days; later updates are usually hours to 2 days.

---

## Route B — manual upload from this Mac (no Codemagic)

**Android**
1. Install **Android Studio** (it includes the Java 17 that this Mac is missing).
2. `flutter build appbundle --release`
3. Upload `build/app/outputs/bundle/release/app-release.aab` in Play Console.

**iOS**
1. `flutter build ipa --release`
2. Open Apple's **Transporter** app (free, Mac App Store), sign in, drag in
   `build/ios/ipa/*.ipa`, press **Deliver**.

Use the Flutter at `~/development/flutter` (3.47.6), not FlutterFlow's.

---

## Route C — companies and services

| Service | What it does | Notes |
|---|---|---|
| **Codemagic** | Builds, signs and uploads Flutter apps to both stores | Made for Flutter; easiest; recommended |
| **Bitrise** | Same idea, general mobile CI | More setup than Codemagic |
| **GitHub Actions + fastlane** | Free/cheap automation you own | Needs developer time to set up |
| **Xcode Cloud** | Apple's own builder (iOS only) | Flutter needs extra scripts; no Android |
| Freelancers / agencies (e.g. on Upwork) | Do the whole upload for you | You give them access; still need your accounts |

**If you hire anyone, never share your Apple or Google passwords.** Invite them instead:
- App Store Connect → Users and Access → add them with role **App Manager**.
- Play Console → Users and permissions → invite them with access to this app only.
You can remove them afterwards.

---

## Checklist

- [x] Step 1 code fixes (Android signing key + iOS items)
- [ ] Keystore and `key.properties` backed up in two places
- [x] Code on GitHub (`mobile_app/` in the Baytara repository)
- [ ] Play Console: account type checked, app created, all Dashboard items done
- [x] Android screenshots + feature graphic made
- [ ] First `.aab` uploaded manually to internal testing
- [ ] App Store Connect: App ID, app record, listing, privacy, age rating done
- [ ] Baytara's authorization letter + demo account ready
- [ ] Codemagic connected (Apple API key, keystore, Play service account, `codemagic.yaml`)
- [ ] Tested on a real Android phone and a real iPhone
- [ ] Submitted to both stores
- [ ] Server: `assetlinks.json` and `apple-app-site-association` published
