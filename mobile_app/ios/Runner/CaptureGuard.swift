import Flutter
import UIKit

/// Screen-capture guard for iOS.
///
/// Be clear about what each half does, because they are not equivalent:
///
///  - **FairPlay is the protection.** VdoCipher renders DRM content black in a screen
///    recording and in AirPlay mirroring. That is the whole iOS story for the picture, and
///    it happens without this file.
///  - **Everything here only detects.** iOS gives an app no way to strip its audio from a
///    recording the way Android's ALLOW_CAPTURE_BY_NONE does, and no way to block a
///    screenshot at all. So the app refuses to play while a capture is running: playback
///    pauses, the surface is covered, and a `suspicious` event is reported. Nothing plays,
///    so nothing useful is captured.
///
/// NOT YET VERIFIED ON HARDWARE. This is written against the documented API but has never
/// been compiled or run: the project is developed on Linux and iOS bring-up is milestone 8.
/// Treat every line as unproven until it has been on a real device.
final class CaptureGuard: NSObject {

    private let channel: FlutterMethodChannel
    private weak var window: UIWindow?
    private var cover: UIView?

    init(messenger: FlutterBinaryMessenger, window: UIWindow?) {
        self.channel = FlutterMethodChannel(
            name: "app.baytara/capture_guard",
            binaryMessenger: messenger
        )
        self.window = window
        super.init()

        channel.setMethodCallHandler { [weak self] call, result in
            guard let self else { return }
            switch call.method {
            case "enableCaptureProtection":
                self.start()
                result(nil)
            case "disableCaptureProtection":
                self.stop()
                result(nil)
            case "isScreenCaptured":
                result(UIScreen.main.isCaptured)
            case "widevineSecurityLevel":
                // Android-only concept. iOS protection is FairPlay, not Widevine.
                result(nil)
            default:
                result(FlutterMethodNotImplemented)
            }
        }
    }

    private func start() {
        let centre = NotificationCenter.default
        centre.addObserver(
            self, selector: #selector(captureChanged),
            name: UIScreen.capturedDidChangeNotification, object: nil
        )
        // iOS cannot prevent a screenshot. Reporting it is all that is available.
        centre.addObserver(
            self, selector: #selector(screenshotTaken),
            name: UIApplication.userDidTakeScreenshotNotification, object: nil
        )
        // The app-switcher snapshot is a capture the user did not ask for.
        centre.addObserver(
            self, selector: #selector(willResign),
            name: UIApplication.willResignActiveNotification, object: nil
        )
        centre.addObserver(
            self, selector: #selector(didBecomeActive),
            name: UIApplication.didBecomeActiveNotification, object: nil
        )
        // A recording may already be running when the player opens.
        apply(captured: UIScreen.main.isCaptured, reason: "screen_recording")
    }

    private func stop() {
        NotificationCenter.default.removeObserver(self)
        hideCover()
    }

    @objc private func captureChanged() {
        // Mirroring to an external display reports the same flag on iOS, so the reason is
        // chosen by whether another screen is attached.
        let reason = UIScreen.screens.count > 1 ? "mirroring" : "screen_recording"
        apply(captured: UIScreen.main.isCaptured, reason: reason)
    }

    @objc private func screenshotTaken() {
        // Already taken; nothing to prevent. Report it so there is evidence.
        channel.invokeMethod("suspicious", arguments: ["reason": "screenshot"])
    }

    @objc private func willResign() {
        showCover()
        channel.invokeMethod("captureStateChanged",
                             arguments: ["captured": true, "reason": "background"])
    }

    @objc private func didBecomeActive() {
        if !UIScreen.main.isCaptured { hideCover() }
    }

    private func apply(captured: Bool, reason: String) {
        channel.invokeMethod("captureStateChanged",
                             arguments: ["captured": captured, "reason": reason])
        captured ? showCover() : hideCover()
    }

    private func showCover() {
        guard let window, cover == nil else { return }
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = UIColor(red: 0.078, green: 0.118, blue: 0.259, alpha: 1)

        let label = UILabel()
        label.text = "أوقف تسجيل الشاشة لمتابعة المشاهدة"
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])

        window.addSubview(view)
        cover = view
    }

    private func hideCover() {
        cover?.removeFromSuperview()
        cover = nil
    }
}
