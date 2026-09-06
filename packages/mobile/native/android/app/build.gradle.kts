plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "dev.onestack.runtime"
    compileSdk = 35
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    signingConfigs {
        if (System.getenv("ONESTACK_ANDROID_KEYSTORE") != null) create("release") {
            storeFile = file(System.getenv("ONESTACK_ANDROID_KEYSTORE"))
            storePassword = System.getenv("ONESTACK_ANDROID_STORE_PASSWORD")
            keyAlias = System.getenv("ONESTACK_ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ONESTACK_ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes { getByName("release") { signingConfig = signingConfigs.findByName("release") } }
    defaultConfig {
        applicationId = "dev.onestack.example"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.4.0"
    }
}
