import UIKit
import WebKit
import Capacitor

/// Screen-recording guard for iOS.
///
/// iOS gives an app no way to strip its audio from a screen recording the way Android's
/// ALLOW_CAPTURE_BY_NONE does. What it does give is `UIScreen.isCaptured`, which turns true
/// the moment a recording (or a mirroring session) starts. So the app refuses to play while
/// that is true: playback pauses, the audio is muted, and an opaque cover hides the page.
/// Nothing plays, so nothing is captured — picture or sound.
///
/// The cover also protects against mirroring to an external display, which reports the same
/// flag on iOS.
final class ScreenCaptureGuard {

    static let shared = ScreenCaptureGuard()

    private weak var window: UIWindow?
    private var cover: UIView?

    private init() {}

    func start(window: UIWindow?) {
        self.window = window
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(captureStateChanged),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
        // A recording may already be running when the app launches.
        apply(captured: UIScreen.main.isCaptured)
    }

    @objc private func captureStateChanged() {
        apply(captured: UIScreen.main.isCaptured)
    }

    private func apply(captured: Bool) {
        notifyWeb(captured: captured)
        captured ? showCover() : hideCover()
    }

    /// Tell the web app so it can pause the VdoCipher player and mute it. The page defines
    /// `window.__baytaraCaptureChanged`; if an older build is loaded the call is a no-op and
    /// the cover below still hides the picture.
    private func notifyWeb(captured: Bool) {
        guard let controller = window?.rootViewController as? CAPBridgeViewController,
              let webView: WKWebView = controller.webView else { return }
        let js = "window.__baytaraCaptureChanged && window.__baytaraCaptureChanged(\(captured));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func showCover() {
        guard let window = window, cover == nil else { return }
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = UIColor(red: 0.08, green: 0.12, blue: 0.26, alpha: 1) // Baytara navy

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
