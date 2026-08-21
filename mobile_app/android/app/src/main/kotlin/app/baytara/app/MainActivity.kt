package app.baytara.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.annotation.TargetApi
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executor

/**
 * Baytara Android host.
 *
 * Two of the protections here genuinely PREVENT a capture. The third only detects one.
 * The difference matters and is stated plainly in mobile_app/README.md, because it is easy
 * to leave people believing the app cannot be recorded at all.
 *
 *  - FLAG_SECURE: the system recorder captures a black frame, screenshots are refused, and
 *    the window is kept off non-secure external displays. Applied only around playback, so
 *    a user can still screenshot a course description to send to a colleague.
 *
 *  - ALLOW_CAPTURE_BY_NONE (Android 10+): excludes this app's audio from the system
 *    recorder, so a recording of a lesson comes out SILENT. DRM never does this; it
 *    protects the picture only. This is what the Capacitor shell already does, and dropping
 *    it would ship a weaker app than the webview it replaces.
 *
 *  - Screen-recording callback (Android 15+): detection only. It stops nothing; it lets the
 *    app pause and report. Older versions have no dependable equivalent and none is faked.
 */
// FlutterFragmentActivity, not FlutterActivity: vdocipher_flutter renders its player as an
// Android platform view that requires a FragmentActivity host, and refuses to attach without
// one ("MainActivity is not a subclass of FlutterFragmentActivity"). This also requires an
// AppCompat theme, which is set in res/values/styles.xml -- the error message does not
// mention that half, and the player still fails without it.
//
// Everything below is unchanged. This file holds the only two protections that genuinely
// prevent a capture on Android, so an edit here is the one that could silently remove them.
class MainActivity : FlutterFragmentActivity() {

    private var channel: MethodChannel? = null
    private var recordingCallbackRegistered = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // App-wide and never lifted: the app plays no audio that anyone should be able to
        // record, so there is no case for turning this off around a particular screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val audio = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            audio?.allowedCapturePolicy = AudioAttributes.ALLOW_CAPTURE_BY_NONE
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).also {
            it.setMethodCallHandler { call, result ->
                when (call.method) {
                    "enableCaptureProtection" -> {
                        setSecure(true)
                        registerRecordingCallback()
                        result.success(null)
                    }
                    "disableCaptureProtection" -> {
                        setSecure(false)
                        result.success(null)
                    }
                    // Widevine L1 means the decoded picture sits in hardware the recorder
                    // cannot read. On L3 it does not, and a determined capture can succeed.
                    // Reported so the product can decide; nothing here refuses playback.
                    "widevineSecurityLevel" -> result.success(widevineSecurityLevel())
                    "isScreenCaptured" -> result.success(false)
                    else -> result.notImplemented()
                }
            }
        }
    }

    private fun setSecure(on: Boolean) = runOnUiThread {
        if (on) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    @TargetApi(35)
    private fun addRecordingCallback() {
        val executor = Executor { it.run() }
        windowManager.addScreenRecordingCallback(executor) { state ->
            // VISIBLE means this window is being recorded.
            val recording = state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
            runOnUiThread {
                channel?.invokeMethod(
                    "captureStateChanged",
                    mapOf("captured" to recording, "reason" to "screen_recording"),
                )
            }
        }
        recordingCallbackRegistered = true
    }

    private fun registerRecordingCallback() {
        if (recordingCallbackRegistered) return
        if (Build.VERSION.SDK_INT < 35) return
        runCatching { addRecordingCallback() }
    }

    /** "L1", "L3", or null when the device does not answer. */
    private fun widevineSecurityLevel(): String? = runCatching {
        val widevine = java.util.UUID(-0x121074568629b532L, -0x5c37d8232ae2de13L)
        val drm = android.media.MediaDrm(widevine)
        val level = drm.getPropertyString("securityLevel")
        drm.close()
        level
    }.getOrNull()

    companion object {
        const val CHANNEL = "app.baytara/capture_guard"
    }
}
