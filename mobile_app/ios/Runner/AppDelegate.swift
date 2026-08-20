import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {

  /// Held for the life of the app so the method channel and its notification observers stay
  /// registered. See CaptureGuard.swift: none of it has been compiled or run yet.
  private var captureGuard: CaptureGuard?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    captureGuard = CaptureGuard(
      messenger: engineBridge.binaryMessenger,
      window: window
    )
  }
}
