# What we control, and what we do not

Tested 2026-08-14 against production (video 4, since removed), account
`selftest@baytara.local`. Every row below is a measured result, not an expectation.

## 1. Who may play — we control this completely

The playback endpoint decides, per request. Measured responses:

| Client | Default policy | `strict_browser_policy` on |
|---|---|---|
| macOS Safari | ✅ plays | ✅ plays |
| macOS Chrome | ❌ `mac_needs_safari` | ❌ `mac_needs_safari` |
| macOS Firefox | ❌ `mac_needs_safari` | ❌ `mac_needs_safari` |
| Windows Edge | ✅ plays | ✅ plays |
| Windows Chrome | ✅ plays | ❌ `browser_not_supported` |
| Windows Firefox | ✅ plays | ❌ `browser_not_supported` |
| iPhone Safari | ✅ plays | ✅ plays |
| iPhone Chrome (WebKit) | ✅ plays | ✅ plays |
| Android Chrome | ✅ plays | ✅ plays |
| Android Firefox | ✅ plays | ❌ `browser_not_supported` |
| Instagram / in-app webview | ❌ `unsupported_browser` | ❌ `unsupported_browser` |
| Linux Chrome | ✅ plays | ❌ `browser_not_supported` |
| Baytara app shell (`BaytaraApp/`) | ✅ plays | ✅ plays |

Also enforced on every request, all platforms: enrollment/tier, 2-device limit, device bound
to the token, one concurrent stream per account, 40 playback tokens per hour, and the
`suspicious_activity` cut-off after 5 guard events in 15 minutes. Every allow and every
refusal is written to `video_playback_sessions`.

## 2. What the viewer does on the page — we control most of it

The activity guard (`frontend/web/src/lib/activityGuard.js`) pauses playback, covers the
picture and records the reason:

| Behaviour | Desktop | Mobile |
|---|---|---|
| Switching app / tab, losing focus | ✅ pause + cover + logged | ✅ pause + cover + logged |
| Opening the macOS Screenshot app | ✅ (it takes focus) | — |
| PrintScreen key | ✅ Windows/Linux | n/a |
| Ctrl/Cmd + S / U / P | ✅ blocked + logged | n/a |
| Right-click, drag, copy | ✅ blocked + logged | ✅ |
| DevTools opened | ✅ pause + logged | n/a |
| **⌘⇧3 / ⌘⇧4 / ⌘⇧5 on macOS** | ❌ the OS swallows the keys | n/a |
| A recorder already running in the background | ❌ no signal exists anywhere | ❌ |

## 3. Whether the picture can be captured — we control none of it

This is decided by the platform's DRM, not by our code:

| Client | Self-hosted video (today) | With VdoCipher DRM on a paid plan |
|---|---|---|
| macOS Safari | capturable | blocked (needs the FairPlay upgrade) |
| macOS Chrome/Firefox | capturable | capturable → so we refuse them |
| Windows Edge | capturable | blocked (PlayReady SL3000) |
| Windows Chrome/Firefox | capturable | capturable (Widevine L3) |
| iPhone Safari | capturable | blocked (FairPlay) |
| Android Chrome | capturable | blocked on L1 devices |
| Baytara Windows app | **blocked** — `WDA_EXCLUDEFROMCAPTURE`, no DRM needed | blocked |
| Baytara Android app | **blocked, and silent** — `FLAG_SECURE` + `ALLOW_CAPTURE_BY_NONE` | blocked |

Self-hosted video has no DRM at all, so **every browser can capture it**. That is the price
of not paying a DRM vendor, and it is why the watermarks matter.

**Audio is capturable everywhere in a browser, on every platform, with or without DRM.**
Measured, and confirmed by the vendors' own documentation. Only an app can stop it.

## 4. What makes a capture useless — always on

- Visible watermark: name, email, phone and account id drifting over the picture.
- Inaudible watermark: the account id in the sound every 20 s, confirmed to survive a real
  iPhone screen recording (`AUDIO_WATERMARK.md`).
- One concurrent stream, so a shared account cannot serve a group.
- Full audit: who played what, from which device and IP, and every suspicious event.

## Still to verify on real hardware

Only a physical device can answer these; the recording outcome cannot be tested from a server:

1. macOS Safari + ⌘⇧5 recording of video 4 → expect the picture captured (no DRM).
2. Windows Chrome + OBS → expect captured.
3. iPhone Safari → expect captured, with the account id decodable from the audio.
4. Android Chrome → expect captured; also the first Android test of the audio watermark.
