# Baytara for Windows

The website in a WebView2 window, plus the protection a browser cannot give: the window is
excluded from every screen-capture path in Windows.

| | In a browser | In this app |
|---|---|---|
| OBS / Snipping Tool / Game Bar / Teams share / PrintScreen | records the lesson | **black** |
| DRM picture | depends on browser (Chrome on Windows = software L3 → capturable) | Edge engine → PlayReady/Widevine |
| System audio | recordable | still recordable (Windows has no per-app audio exclusion) |

How it works: `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` in `MainForm.cs`.
WebView2 is the Edge engine, so DRM behaves exactly as in Edge. The shell appends
`BaytaraApp/1` to its User-Agent, so the backend serves protected lessons to it even when
`strict_browser_policy` is on.

## Build it (on any Windows PC, free tools, no accounts)

1. Install the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) — the SDK, not
   just the runtime.
2. Copy this `desktop/windows` folder to the PC.
3. Open a terminal in the folder and run:

```powershell
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true
```

4. The app is at `bin\Release\net8.0-windows\win-x64\publish\Baytara.exe`. Double-click it.

No Visual Studio, no developer account, no store, no signing fee. WebView2 Runtime already
ships with Windows 10 and 11; on an older machine install the free
[Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

## Test that the protection works

1. Open a protected lesson in the app and start playback.
2. Record the screen with OBS, Xbox Game Bar (`Win+G`) or the Snipping Tool.
3. Play the recording back: the Baytara window is black, everything else on the desktop is
   normal. Press PrintScreen and paste — also black.

If the window is *not* black, the machine is older than Windows 10 build 19041 and fell back
to `WDA_MONITOR`; captures are still blanked, but verify on that machine.

## Distribution

Host `Baytara.exe` as a download on the site. It is unsigned, so SmartScreen shows
"Windows protected your PC" on first run until enough people install it — click *More info →
Run anyway*. A code-signing certificate (about $100–300/year from a CA) removes that warning;
worth buying once the app is the main way students watch.

## What this does not solve

- **Audio.** Windows offers no per-application capture exclusion for sound, so a loopback
  recorder captures the lesson audio. The inaudible account watermark the web app emits still
  identifies who did it (`docs/AUDIO_WATERMARK.md`).
- **A camera pointed at the screen.** Nothing anywhere solves that; the visible watermark is
  the answer.
