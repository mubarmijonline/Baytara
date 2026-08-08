package app.baytara.mobile;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * Baytara app shell.
 *
 * The two protections a browser cannot provide, and the whole reason this app exists:
 *
 *  - FLAG_SECURE keeps the window out of screenshots and screen recordings, and off
 *    non-secure external displays.
 *  - ALLOW_CAPTURE_BY_NONE excludes this app's audio from the system screen recorder
 *    (Android 10 / API 29 and later). A recording of a lesson comes out silent, which
 *    DRM alone never achieves — DRM protects the picture only.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                             WindowManager.LayoutParams.FLAG_SECURE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                audio.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_NONE);
            }
        }
    }
}
