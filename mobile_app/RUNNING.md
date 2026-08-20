# Running the app on your laptop

For running the Baytara Flutter app on an Android emulator or a physical phone, from a
laptop with Android Studio already installed.

The code lives on the dev server at `/development/projects/baytara/mobile_app`. It is **not
pushed to GitHub**, so step 1 copies it to you.

Nothing here needs the backend: the app talks to the live API at `https://baytara.app/api/v1`.

---

## Step 1 — Copy the project to your laptop

Run this **on your laptop**, not on the server.

The excludes matter: with them the project is about **3 MB**; without them you would pull
**3.5 GB** of build output you do not need and which has to be rebuilt locally anyway.

**Windows (PowerShell)** — Windows 10/11 has `scp` built in, but not `rsync`. Easiest is to
have the server make a clean archive first:

```powershell
ssh omar_ashraf@34.63.221.109 "tar czf /tmp/mobile_app.tgz --exclude=build --exclude=.dart_tool --exclude=android/.gradle mobile_app"
scp omar_ashraf@34.63.221.109:/tmp/mobile_app.tgz $env:USERPROFILE\Downloads\
```

Then extract `mobile_app.tgz` (7-Zip, or `tar -xzf` in PowerShell) to somewhere like
`C:\dev\`, giving you `C:\dev\mobile_app`.

**macOS or Linux:**

```bash
rsync -av --exclude build --exclude .dart_tool --exclude android/.gradle \
  omar_ashraf@34.63.221.109:/development/projects/baytara/mobile_app/ ~/dev/mobile_app/
```

**Avoid a path with spaces or non-ASCII characters.** The Android NDK and Gradle still trip
over those. `C:\dev\mobile_app` is safe; `C:\Users\<name>\My Documents\...` is asking for it.

---

## Step 2 — Install the Flutter SDK

**Android Studio's Flutter plugin is not the Flutter SDK.** You need both.

The project requires Dart `^3.13.0`, which means **Flutter 3.47.0 or newer**. Older versions
will fail at `flutter pub get` with a version-solving error.

**Windows:**

1. Download
   <https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.47.1-stable.zip>
2. Extract to `C:\src\flutter` (again: no spaces in the path, and not inside `Program Files`,
   which needs elevated permissions Flutter does not have at runtime).
3. Add `C:\src\flutter\bin` to your PATH:
   Start → "Edit the system environment variables" → Environment Variables → under **User
   variables** select `Path` → Edit → New → `C:\src\flutter\bin` → OK.
4. **Open a new terminal** (PATH changes do not reach terminals that were already open) and
   check: `flutter --version`

**macOS (Apple Silicon):**

```bash
cd ~/src && curl -O https://storage.googleapis.com/flutter_infra_release/releases/stable/macos/flutter_macos_arm64_3.47.1-stable.zip
unzip flutter_macos_arm64_3.47.1-stable.zip
echo 'export PATH="$HOME/src/flutter/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
flutter --version
```

---

## Step 3 — Wire up Android Studio

1. **Plugins**: Settings → Plugins → Marketplace → install **Flutter** (it installs **Dart**
   as a dependency). Restart when prompted.
2. **Android SDK**: Settings → Languages & Frameworks → Android SDK → SDK Platforms tab →
   tick **Android 15 (API 35)** or **API 36**. SDK Tools tab → make sure **Android SDK
   Command-line Tools** is ticked. Apply.
3. **Accept the licences** — the build fails without this:

   ```bash
   flutter doctor --android-licenses
   ```

   Press `y` at each prompt.
4. **Check everything**:

   ```bash
   flutter doctor
   ```

   The **Android toolchain** line must be green. Ignore red lines for Xcode (macOS only),
   Chrome, or Linux desktop — none of those is a target.

---

## Step 4 — Create the emulator

Android Studio → **Device Manager** (right sidebar, or Tools → Device Manager) → **Create
Device**.

- **Device**: Pixel 7 or Pixel 8 is a good default.
- **System image**: **API 35** or **36**. It must be **API 24 or higher** — Flutter 3.47
  dropped support below that, and this app's `minSdk` is 24.
  Prefer an image whose name includes **Google Play** or **Google APIs**: the plain AOSP
  images lack Google Play Services, which Google Sign-In needs.
- Finish, then press ▶ to boot it.

Wait until the home screen is fully up before the next step.

---

## Step 5 — Run

```bash
cd C:\dev\mobile_app      # or ~/dev/mobile_app
flutter pub get
flutter devices           # your emulator should be listed
flutter run
```

The **first** run compiles from scratch and downloads Gradle dependencies: expect **5 to 15
minutes**. Later runs take seconds.

Once it is up, in that terminal:

- `r` — hot reload (keeps app state)
- `R` — hot restart
- `q` — quit

Or use Android Studio: open the `mobile_app` folder, pick the emulator in the device
dropdown, press ▶.

---

## What will and will not work

**Works on the emulator:** sign in and registration, the whole catalogue, course pages,
verification uploads, payment screens, notifications, settings, and both languages including
the full right-to-left flip.

**Video will most likely NOT play on an emulator.** VdoCipher needs Widevine DRM, and
emulators have Widevine L3 at best, often nothing usable. **This is not a bug in the app** —
it is what emulators are. Video needs a physical device.

**You need a real Baytara account.** There is no mock data; every screen is fed by the live
API. And the server refuses to issue a video OTP for any account with no phone number, so the
app will route you to the phone screen before it lets you near a player.

---

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| `flutter: command not found` | PATH not set, or the terminal predates the change. Open a new terminal. |
| `version solving failed` | Flutter older than 3.47. `flutter --version`, then upgrade. |
| `No devices found` | The emulator is not booted, or is still booting. Start it and wait for the home screen. |
| `Android licence status unknown` | `flutter doctor --android-licenses` |
| Gradle fails on a path | Move the project somewhere with no spaces or non-ASCII characters. |
| Build hangs on first run | Normal for the first build; Gradle is downloading. Give it 15 minutes. |
| Sign-in with Google fails | The emulator image has no Google Play Services, or the SHA-1 for `app.baytara.app` is not registered in the Google console. Email and password sign-in still work. |

---

## Running against a different API

The app points at the live API by default. To aim it somewhere else:

```bash
flutter run --dart-define=BAYTARA_API=http://10.0.2.2:8090/api/v1
```

`10.0.2.2` is how an Android emulator reaches its host machine's `localhost`. Note the local
backend's `CORS_ORIGINS` does not matter here: CORS is a browser rule and this is a native
build.
