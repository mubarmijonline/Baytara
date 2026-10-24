import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing with the Google Play *upload* key. Two sources, in this order:
//   1. android/key.properties (local builds). Never committed; see .gitignore.
//   2. Codemagic's keystore environment variables (CM_KEYSTORE_*), set when a workflow
//      references the keystore under `android_signing` in codemagic.yaml.
// With neither, release builds fall back to the debug key so `flutter run --release` still
// works on a developer machine. Google Play rejects a debug-signed upload, so that fallback
// can never reach the store by accident.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) FileInputStream(file).use { load(it) }
}
val uploadStoreFile: String? =
    keystoreProperties.getProperty("storeFile") ?: System.getenv("CM_KEYSTORE_PATH")
val uploadStorePassword: String? =
    keystoreProperties.getProperty("storePassword") ?: System.getenv("CM_KEYSTORE_PASSWORD")
val uploadKeyAlias: String? =
    keystoreProperties.getProperty("keyAlias") ?: System.getenv("CM_KEY_ALIAS")
val uploadKeyPassword: String? =
    keystoreProperties.getProperty("keyPassword") ?: System.getenv("CM_KEY_PASSWORD")
val hasUploadKey = listOf(uploadStoreFile, uploadStorePassword, uploadKeyAlias, uploadKeyPassword)
    .all { !it.isNullOrBlank() }

android {
    namespace = "app.baytara.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "app.baytara.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName(if (hasUploadKey) "upload" else "debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // Required by the AppCompat theme in res/values/styles.xml, which vdocipher_flutter's
    // player needs. Declared explicitly rather than relied on arriving transitively through
    // some other plugin, since that can vanish on a dependency bump.
    implementation("androidx.appcompat:appcompat:1.7.0")
}
