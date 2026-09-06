plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "dev.onestack.runtime"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.onestack.example"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.4.0"
    }
}
