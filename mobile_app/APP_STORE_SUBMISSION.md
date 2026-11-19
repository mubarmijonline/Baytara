# Baytara — App Store submission pack

Everything App Store Connect asks for, ready to paste. Prepared 2026-10-04.
Fields marked **[confirm]** need a value only Baytara or your team can give.

---

## 0. Read first: publishing under your company's Apple account

The app is being submitted from **your company's** Apple Developer account, not Baytara's.

- The App Store will show **your company as the seller**, under the name "Baytara".
- Guideline **5.2.1** expects an app to be submitted by whoever owns the brand and content.
  Agency submissions for a client brand are often rejected without proof of permission.
- **Get a signed authorization letter from Baytara** (on their letterhead) stating that your
  company may publish the Baytara app on their behalf. Attach it under App Review →
  Attachment, and mention it in the review notes (section 9).
- Later, the app can be moved to Baytara's own account with Apple's **App Transfer**, without
  losing reviews or users. This is the long-term clean setup.

### Purchasing risk (read before submitting)

The app sells nothing and has no buy, enroll or renew buttons (done 2026-10-04). Users
watch courses they are already enrolled in. Apple usually accepts this for video/reader-style
apps (Guideline **3.1.3(a)**). However, Apple sometimes asks paid-course apps to offer
In-App Purchase too. If review asks for that, the options are adding StoreKit purchases or
appealing under 3.1.3(a). Do not add any text pointing users to the website for buying,
anywhere in the app or in this metadata.

---

## 1. New app record (App Store Connect → Apps → +)

| Field | Value |
|---|---|
| Platform | iOS |
| Name (≤30) | `Baytara - بيطرة` |
| Primary language | Arabic |
| Bundle ID | `app.baytara.app` |
| SKU | `baytara-ios` |
| User access | Full access |

## 2. App Information

| Field | Value |
|---|---|
| Subtitle — Arabic (≤30) | `تعليم الطب البيطري بالعربية` |
| Subtitle — English (≤30) | `Veterinary learning in Arabic` |
| Primary category | Education |
| Secondary category | Medical |
| Content rights | **Yes**, the app shows third-party content (Baytara's courses), and you have the rights to it through Baytara's authorization letter |
| Age rating | see section 6 |

Add **English** as a second localization if you want an English listing (texts below).

## 3. Version 1.0 page

| Field | Value |
|---|---|
| Version | 1.0.0 (set `version: 1.0.0+1` in `pubspec.yaml` first) |
| Copyright | `© 2026 Baytara` |
| Support URL | `https://baytara.app/contact` **[confirm it loads]** |
| Marketing URL | `https://baytara.app` |
| Privacy Policy URL | `https://baytara.app/privacy` **[confirm it loads without signing in]** |

### Promotional text (≤170, can be changed any time without review)

**Arabic**
```
دورات بيطرية متخصصة من أطباء ممارسين، بمحتوى عملي تستخدمه في العيادة والمزرعة. تابع دوراتك، وتقدّمك، وشهاداتك من مكان واحد.
```

**English**
```
Specialised veterinary courses from practising vets, with practical content you can use in the clinic and on the farm. Your courses, progress and certificates in one place.
```

### Description (≤4000)

**Arabic**
```
بيطرة منصة تعليم بيطري باللغة العربية، تقدّم دورات وفيديوهات من أطباء بيطريين ممارسين بمحتوى عملي تستخدمه مباشرة في عملك.

ماذا تجد في التطبيق:
• دورات متخصصة في طب وجراحة المجترات، والخيول، والحيوانات الأليفة، والطيور، والأسماك، والإبل.
• فيديوهات تعريفية مجانية ومحتوى مفتوح لكل الحسابات.
• مكتبة بيطرة: مقالات وملخصات كتب متاحة للجميع.
• متابعة تقدّمك في كل دورة، واستكمال المشاهدة من حيث توقفت.
• اختبارات نهاية الدورة وشهادات إتمام قابلة للتحقق.
• توثيق الأطباء البيطريين لفتح المحتوى المتخصص.

محتوى محمي:
يظهر اسم المشاهد ورقم هاتفه كعلامة مائية داخل الفيديو لحماية حقوق المحاضرين.

التطبيق مخصص للأطباء البيطريين وطلاب الطب البيطري والمهتمين بالمجال. يمكنك تسجيل الدخول بحسابك في بيطرة لمتابعة الدورات المسجّل بها.
```

**English**
```
Baytara is an Arabic-language veterinary learning platform with courses and videos from practising veterinarians, focused on practical knowledge you can use straight away.

In the app:
• Specialised courses in ruminant medicine and surgery, equine, small animals, poultry, aquatic animals and camels.
• Free introductory videos and open content for every account.
• The Baytara Library: articles and book summaries, free for everyone.
• Track your progress in every course and resume where you left off.
• End-of-course exams and verifiable completion certificates.
• Veterinarian verification to unlock specialised content.

Protected content:
The viewer's name and phone number appear as a watermark inside each video to protect the instructors' work.

Made for veterinarians, veterinary students and anyone working in the field. Sign in with your Baytara account to continue the courses you are enrolled in.
```

### Keywords (≤100 characters, comma-separated, no spaces after commas)

**Arabic** (88 characters)
```
طب بيطري,بيطرة,دورات,تعليم,سونار,جراحة,أبقار,خيول,حيوانات أليفة,دواجن,أطباء,شهادات,مواشي
```

**English** (92 characters)
```
veterinary,vet,courses,ultrasound,surgery,cattle,equine,small animals,poultry,CPD,vet school
```

### What's New (for later versions)
Not needed for 1.0.

---

## 4. Screenshots

Already made, at the exact sizes Apple requires, in `app_store_screenshots/`.

| Slot in App Store Connect | Folder | Upload in this order |
|---|---|---|
| iPhone 6.9" Display | `iphone-6.9/` | 04-home, 05-courses, 08-library, 06-course-detail, 07-content, 01, 02, 03 |
| iPad 13" Display | `ipad-13/` | 04-home, 05-courses, 07-library, 06-content, 01, 02, 03 |

If you make the app **iPhone-only** (recommended, since the iPad layout is a stretched phone
layout), skip the iPad slot.

No App Preview video is required.

---

## 5. Pricing and availability

| Field | Value |
|---|---|
| Price | Free |
| In-App Purchases | None |
| Availability | Egypt and the other Arab countries Baytara serves **[confirm list]**, or all countries |
| Pre-order | No |

---

## 6. Age rating questionnaire

Suggested answers. Apple calculates the final rating from them.

| Question | Answer |
|---|---|
| Parental controls / age assurance | No |
| Unrestricted web access | No |
| User-generated content | No |
| Messaging / chat between users | No |
| Advertising | No |
| Gambling / contests / loot boxes | None |
| Violence (cartoon / realistic) | None |
| Sexual content / nudity | None |
| Profanity / crude humour | None |
| Alcohol, tobacco, drugs | None |
| Horror / fear themes | None |
| **Medical or treatment-focused content** | **Frequent** (veterinary procedures, surgery and diagnostics) |
| Mature / suggestive themes | None |

If any course video shows graphic surgery, answer that honestly under the graphic or
medical content question as well.

---

## 7. App Privacy (the "nutrition label")

**Does the app collect data?** Yes. **Used for tracking?** No, for every type.
**Linked to the user?** Yes, for every type below (all of it belongs to the Baytara account).

| Apple data type | What it is in Baytara | Purpose |
|---|---|---|
| Contact Info → Name | account name | App Functionality |
| Contact Info → Email Address | sign-in email | App Functionality |
| Contact Info → Phone Number | required before playback; shown in the watermark | App Functionality |
| User Content → Photos or Videos | photo of the veterinary card or ID for verification | App Functionality |
| User Content → Customer Support | messages sent from the Contact form | App Functionality |
| Identifiers → User ID | Baytara account ID | App Functionality |
| Identifiers → Device ID | app-generated device ID (two-device limit) | App Functionality |
| Usage Data → Product Interaction | lesson watch progress and position | App Functionality |
| Diagnostics → Other Diagnostic Data | player errors; screen-recording and screenshot events | App Functionality |

Not collected by the app: location, contacts, browsing history, payment info, health data,
advertising data. Purchases happen outside the app, so **Purchases** is not collected here.

Google Sign-In (if kept) is a third-party SDK. Its data use is covered by the rows above
(name, email, user ID).

---

## 8. Export compliance

The app only uses standard HTTPS and Apple/OS encryption.

- Answer: **uses encryption → yes, exempt (standard encryption only)**.
- Add `ITSAppUsesNonExemptEncryption = NO` to `ios/Runner/Info.plist` so Apple stops asking
  on every build.

---

## 9. App Review Information

| Field | Value |
|---|---|
| Sign-in required | Yes |
| Demo username | **[confirm]**, a dedicated review account |
| Demo password | **[confirm]** |
| Contact name / phone / email | **[your team's contact]** |
| Attachment | Baytara's authorization letter (PDF) |

**The demo account must have:**
- a phone number saved (playback refuses without one)
- verified veterinarian status, so specialised content opens
- an active enrollment in at least one course with a playable lesson
- a **raised device limit** (reviewers use several devices; the normal limit is 2)

### Review notes (paste as-is)

```
Baytara is a veterinary education app. Users sign in with their Baytara account to watch the courses they are enrolled in, read the Baytara Library, take course exams and view their certificates.

- No purchases: the app does not sell anything and has no purchase, subscription or payment screens. Free content is available to every signed-in account.
- Demo account: the provided account is enrolled in "<COURSE NAME>" and is verified as a veterinarian. Open Courses > the course > Watch now.
- Content protection: video screens use OS screen-capture protection. Screenshots or screen recordings of the player appear black on purpose; the viewer's name and phone number are shown as a watermark.
- Phone number: playback requires a phone number on the account because it is part of the watermark. The demo account already has one.
- Device limit: accounts can be active on 2 devices; the demo account's limit has been raised for review.
- Account deletion: Account tab > Settings > Delete account.
- Publisher: this app is published by <YOUR COMPANY> on behalf of Baytara, the content owner. Baytara's authorization letter is attached.
```

---

## 10. Must be done before uploading the build

Done in the project (2026-10-24): export-compliance flag, privacy manifest
(`ios/Runner/PrivacyInfo.xcprivacy`), Google sign-in hidden on iOS (so Sign in with Apple is
not required), the "leaving the app = screen recording" bug, the privacy page opening
without an account, and version `1.0.0+1`.

Still to do:

1. **Signing team:** nothing to set if you build with Codemagic (it signs with your App Store
   Connect API key). For a build from this Mac, set the Team in Xcode → Runner → Signing &
   Capabilities.
2. Consider making the app **iPhone-only** (`TARGETED_DEVICE_FAMILY = 1`): the iPad layout
   is the phone layout stretched.
3. Make sure `https://baytara.app/privacy` also opens without signing in **on the website**.
4. **Server:** publish `https://baytara.app/.well-known/apple-app-site-association` with
   `<YOUR TEAM ID>.app.baytara.app`, covering `/library*`, `/blog*`, `/articles/*` only.
   Do **not** include `/payment/*`: website checkout must stay in the browser.
5. Test on a real iPhone through **TestFlight**: video (VdoCipher FairPlay must be enabled on
   Baytara's VdoCipher account), sign-in, and shared links.

---

## 11. What to ask Baytara for

- Signed **authorization letter** to publish under your company's account.
- The **review demo account** described in section 9.
- **Support email and phone** for the listing, and confirmation of the support URL.
- Which **countries** to publish in.
- Confirmation that the **privacy policy** at baytara.app/privacy covers the app (data in
  section 7).
- VdoCipher **FairPlay** enabled for iOS playback.
