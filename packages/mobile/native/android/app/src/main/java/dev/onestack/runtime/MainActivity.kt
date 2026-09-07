package dev.onestack.runtime

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.View
import android.widget.*
import android.text.Editable
import android.text.TextWatcher
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import org.json.JSONArray

/** Only bundled JS receives a bridge; explicit content WebViews never receive it. */
class MainActivity : Activity() {
    private lateinit var engine: WebView
    private lateinit var root: LinearLayout
    private lateinit var config: JSONObject
    private var notificationRequestId: String? = null
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        config = JSONObject(assets.open("manifest.json").bufferedReader().readText())
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        setContentView(root)
        engine = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            addJavascriptInterface(Bridge(), "OneStackAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?) = true
            }
        }
        val js = assets.open("app.js").bufferedReader().readText().replace("</script", "<\\/script")
        engine.loadDataWithBaseURL("https://onestack.invalid/", "<html><script>$js</script></html>", "text/html", "UTF-8", null)
    }
    private fun emit(id: String, value: Any? = null) {
        engine.evaluateJavascript("globalThis.__onestackEvent?.(...${JSONArray().put(id).put(value ?: JSONObject.NULL)})", null)
    }
    inner class Bridge {
        @JavascriptInterface fun postMessage(raw: String) { runOnUiThread {
            try {
                val message = JSONObject(raw)
                if (message.optString("type") == "render") {
                    val view = render(message.getJSONObject("node"))
                    root.removeAllViews(); root.addView(view)
                } else if (message.optString("type") == "invoke") invoke(message.getJSONObject("request"))
            } catch (error: Exception) { android.util.Log.e("OneStack", "Bridge failed", error) }
        } }
    }
    private fun invoke(request: JSONObject) {
        val response = JSONObject().put("id", request.getString("id"))
        try {
            val namespace = request.getString("namespace")
            check(config.optJSONObject("permissions")?.optBoolean(namespace) == true) { "Capability denied: $namespace" }
            val method = request.getString("method"); val args = request.optJSONArray("args") ?: JSONArray()
            if (namespace == "notifications" && method == "request" && android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                check(notificationRequestId == null) { "Notification permission request already pending" }
                notificationRequestId = request.getString("id")
                requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 42)
                return
            }
            val value: Any? = when ("$namespace.$method") {
                "notifications.request" -> true
                "notifications.show" -> {
                    if (android.os.Build.VERSION.SDK_INT >= 33) check(checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED) { "Notification permission not granted" }
                    val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
                    manager.createNotificationChannel(android.app.NotificationChannel("onestack", "OneStack", android.app.NotificationManager.IMPORTANCE_DEFAULT))
                    val notification = android.app.Notification.Builder(this, "onestack").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(args.getString(0)).setContentText(args.optString(1)).setAutoCancel(true).build()
                    manager.notify(System.currentTimeMillis().toInt(), notification); null
                }
                "filesystem.read" -> { val file = localFile(args.getString(0)); check(file.length() <= 1048576); file.readText() }
                "filesystem.write" -> { val file = localFile(args.getString(0)); val contents = args.getString(1); check(contents.length <= 1048576); file.parentFile?.mkdirs(); file.writeText(contents); null }
                "filesystem.remove" -> { localFile(args.getString(0)).delete(); null }
                "system.info" -> JSONObject().put("platform", "android").put("version", android.os.Build.VERSION.RELEASE)
                "clipboard.write" -> { (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("", args.getString(0))); null }
                "clipboard.read" -> (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()
                "externalUrls.open" -> { val uri = Uri.parse(args.getString(0)); check(uri.scheme in listOf("https", "http")); startActivity(Intent(Intent.ACTION_VIEW, uri)); null }
                "share.text" -> { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, args.getString(0)), "Share")); null }
                "haptics.impact" -> { root.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM); null }
                else -> error("Unsupported native operation: $namespace.$method")
            }
            response.put("ok", true).put("value", value ?: JSONObject.NULL)
        } catch (error: Exception) { response.put("ok", false).put("error", JSONObject().put("code", "NATIVE_OPERATION_FAILED").put("message", error.message)) }
        engine.evaluateJavascript("globalThis.__onestackResponse?.($response)", null)
    }
    private fun localFile(key: String): java.io.File {
        check(key.isNotEmpty() && !key.startsWith("/") && !key.contains("\\") && key.split('/').none { it == ".." || it == "." || it.isEmpty() }) { "Invalid file key" }
        val base = java.io.File(filesDir, "onestack").apply { mkdirs() }.canonicalFile
        val file = java.io.File(base, key).canonicalFile
        check(file.path.startsWith(base.path + java.io.File.separator)) { "File escapes sandbox" }
        return file
    }
    private fun text(node: JSONObject): String {
        val children = node.opt("children")
        return if (children is String) children else if (children is JSONArray) (0 until children.length()).joinToString("") { text(children.getJSONObject(it)) } else ""
    }
    private fun render(node: JSONObject): View {
        val props = node.optJSONObject("props") ?: JSONObject()
        val children = node.optJSONArray("children") ?: JSONArray()
        fun stack(): LinearLayout = LinearLayout(this).apply {
            orientation = if (props.optJSONObject("style")?.optString("flexDirection") == "row") LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            val gap = dp(props.optJSONObject("style")?.optDouble("gap", 0.0) ?: 0.0)
            for (i in 0 until children.length()) {
                val child = render(children.getJSONObject(i))
                val params = LinearLayout.LayoutParams(if (orientation == LinearLayout.VERTICAL) -1 else -2, -2)
                if (i > 0) { if (orientation == LinearLayout.VERTICAL) params.topMargin = gap else params.leftMargin = gap }
                addView(child, params)
            }
        }
        val view: View = when (val type = node.getString("type")) {
            "View", "SafeArea" -> stack()
            "ScrollView" -> ScrollView(this).apply { addView(stack()) }
            "Text" -> TextView(this).apply { text = text(node); textSize = 16f }
            "Pressable" -> Button(this).apply { text = text(node); setOnClickListener { emit(props.optString("onPress", props.optString("onClick"))) } }
            "TextInput" -> EditText(this).apply {
                if (props.optString("type") == "password") inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
                setText(props.optString("value")); hint = props.optString("placeholder")
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { emit(props.optString("onInput", props.optString("onChange")), s.toString()) }
                    override fun afterTextChanged(s: Editable?) {}
                })
            }
            "Switch" -> Switch(this).apply { isChecked = props.optBoolean("checked"); setOnCheckedChangeListener { _, checked -> emit(props.optString("onChange"), checked) } }
            "ActivityIndicator" -> ProgressBar(this)
            "Image" -> ImageView(this).apply {
                contentDescription = props.optString("alt")
                val source = props.optString("src")
                if (source.startsWith("https://")) Thread {
                    try { val connection = java.net.URL(source).openConnection().apply { connectTimeout = 10000; readTimeout = 10000 }; val bitmap = connection.getInputStream().use { android.graphics.BitmapFactory.decodeStream(it) }; runOnUiThread { setImageBitmap(bitmap) } } catch (e: Exception) { android.util.Log.e("OneStack", "Image failed", e) }
                }.start()
            }
            "WebView" -> {
                check(config.optBoolean("allowWebViewFallback")) { "WebView fallback disabled" }
                WebView(this).apply { settings.allowFileAccess = false; settings.allowContentAccess = false
                    val url = props.optString("src"); if (url.isNotEmpty()) { check(url.startsWith("https://")); loadUrl(url) } else loadData(props.optString("html"), "text/html", "UTF-8")
                }
            }
            else -> error("Unsupported native primitive: $type")
        }
        view.isEnabled = !props.optBoolean("disabled")
        applyStyle(view, props.optJSONObject("style") ?: JSONObject())
        return view
    }
    private fun dp(value: Double) = (value * resources.displayMetrics.density).toInt()
    private fun color(value: String): Int? = try { android.graphics.Color.parseColor(value) } catch (_: Exception) { null }
    private fun applyStyle(view: View, style: JSONObject) {
        val padding = dp(style.optDouble("padding", 0.0))
        if (style.has("padding")) view.setPadding(padding, padding, padding, padding)
        if (style.has("minHeight")) view.minimumHeight = dp(style.optDouble("minHeight"))
        view.alpha = style.optDouble("opacity", 1.0).toFloat()
        if (style.has("backgroundColor") || style.has("borderRadius") || style.has("borderWidth")) {
            view.background = android.graphics.drawable.GradientDrawable().apply {
                this@MainActivity.color(style.optString("backgroundColor"))?.let { setColor(it) }
                cornerRadius = dp(style.optDouble("borderRadius", 0.0)).toFloat()
                this@MainActivity.color(style.optString("borderColor"))?.let { setStroke(dp(style.optDouble("borderWidth", 0.0)), it) }
            }
        }
        if (view is TextView) {
            this@MainActivity.color(style.optString("color"))?.let { view.setTextColor(it) }
            if (style.has("fontSize")) view.textSize = style.optDouble("fontSize").toFloat()
            if (style.optInt("fontWeight", 400) >= 600) view.setTypeface(view.typeface, android.graphics.Typeface.BOLD)
        }
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == 42) {
            notificationRequestId?.let { id ->
                val response = JSONObject().put("id", id).put("ok", true).put("value", results.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED)
                engine.evaluateJavascript("globalThis.__onestackResponse?.($response)", null)
            }
            notificationRequestId = null
        }
    }
    private fun lifecycle(state: String, url: String? = null) {
        if (::engine.isInitialized) {
            val detail = JSONObject().put("state", state).put("url", url ?: JSONObject.NULL)
            engine.evaluateJavascript("globalThis.dispatchEvent(new CustomEvent('onestack:lifecycle', {detail:$detail}))", null)
        }
    }
    override fun onResume() { super.onResume(); lifecycle("active") }
    override fun onPause() { lifecycle("background"); super.onPause() }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); lifecycle("deepLink", intent.dataString) }
    override fun onDestroy() { engine.destroy(); super.onDestroy() }
}
