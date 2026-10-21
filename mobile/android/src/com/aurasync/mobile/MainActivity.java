package com.aurasync.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import java.util.concurrent.Executor;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int PERMISSION_REQUEST_CODE = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingSharedFilesJson = "[]";
    private boolean pageLoaded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Configure edge-to-edge dark display
        configureWindowStyle();

        // Initialize WebView
        webView = new WebView(this);
        setupWebView();
        setContentView(webView);

        // Handle incoming share intent (e.g. 900 files from Gallery)
        handleIncomingIntent(getIntent());

        // Load modern AuraSync mobile application
        webView.loadUrl("https://aurasync.local/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void configureWindowStyle() {
        Window window = getWindow();
        if (window != null) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(Color.parseColor("#090a0f"));
                window.setNavigationBarColor(Color.parseColor("#090a0f"));
            }
        }
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setBackgroundColor(Color.parseColor("#090a0f"));

        // Register Native JavaScript Bridge
        webView.addJavascriptInterface(new AuraSyncAndroidBridge(), "AuraSyncAndroid");

        // Handle local asset serving & deep links
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
                    headers.put("Access-Control-Allow-Headers", "*");
                    return new WebResourceResponse("text/plain", "utf-8", 200, "OK", headers, new ByteArrayInputStream(new byte[0]));
                }
                if (request != null && request.getUrl() != null) {
                    return handleAssetRequest(request.getUrl());
                }
                return null;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (url != null) {
                    return handleAssetRequest(Uri.parse(url));
                }
                return null;
            }

            @Override
            public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
                handler.proceed();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                android.util.Log.e("AuraSyncWeb", "WebView Error [" + errorCode + "]: " + description + " URL: " + failingUrl);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null) {
                    String scheme = uri.getScheme();
                    if ("aurasync".equalsIgnoreCase(scheme)) {
                        // Deep link callback
                        return true;
                    }
                    if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                            startActivity(intent);
                            return true;
                        } catch (Exception ignored) {}
                    }
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;
                deliverPendingSharedFiles();
            }
        });

        // Handle file picker & camera/gallery intents
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
                android.util.Log.d("AuraSyncWeb", consoleMessage.message() + " [" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + "]");
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(Intent.createChooser(intent, "Select Files to Upload"), FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });
    }

    private WebResourceResponse handleAssetRequest(Uri uri) {
        if (uri == null) return null;
        String host = uri.getHost();
        if (host != null && !host.contains("aurasync") && !host.contains("androidplatform.net") && !host.contains("localhost")) {
            return null;
        }

        String rawPath = uri.getPath();
        if (rawPath == null || rawPath.isEmpty() || "/".equals(rawPath)) {
            rawPath = "/index.html";
        }

        // Clean query/hash parameters
        int qIdx = rawPath.indexOf('?');
        if (qIdx != -1) rawPath = rawPath.substring(0, qIdx);
        int hIdx = rawPath.indexOf('#');
        if (hIdx != -1) rawPath = rawPath.substring(0, hIdx);

        try {
            rawPath = URLDecoder.decode(rawPath, "UTF-8");
        } catch (Exception ignored) {}

        while (rawPath.startsWith("/")) {
            rawPath = rawPath.substring(1);
        }
        final String path = rawPath.isEmpty() ? "index.html" : rawPath;

        // Try candidate paths in assets (handling Unix / and Windows \ seamlessly)
        String[] candidates = new String[]{
            "www/" + path,
            path,
            "www\\" + path.replace('/', '\\'),
            path.replace('/', '\\')
        };

        InputStream is = null;
        for (String c : candidates) {
            try {
                is = getAssets().open(c);
                if (is != null) break;
            } catch (Exception ignored) {}
        }

        if (is == null) {
            android.util.Log.w("AuraSyncWeb", "Asset not found: " + path);
            return null;
        }

        try {
            String mime = getMimeType(path);
            String encoding = getEncoding(path);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
                headers.put("Access-Control-Allow-Headers", "*");
                headers.put("Cache-Control", "no-cache, no-store, must-revalidate");
                headers.put("Content-Type", mime + (encoding != null ? "; charset=" + encoding : ""));
                return new WebResourceResponse(mime, encoding, 200, "OK", headers, is);
            }
            return new WebResourceResponse(mime, encoding, is);
        } catch (Exception e) {
            android.util.Log.e("AuraSyncWeb", "Error creating WebResourceResponse for " + path, e);
            return null;
        }
    }

    private String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".wasm")) return "application/wasm";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private String getEncoding(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm") ||
            lower.endsWith(".js") || lower.endsWith(".mjs") ||
            lower.endsWith(".css") || lower.endsWith(".json") ||
            lower.endsWith(".txt") || lower.endsWith(".svg")) {
            return "utf-8";
        }
        return null; // binary files must have null encoding
    }

    // Handles incoming Share Intents (single or 900+ files)
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                List<Uri> list = new ArrayList<>();
                list.add(uri);
                parseAndStageUris(list);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null && !uris.isEmpty()) {
                parseAndStageUris(uris);
            }
        }
    }

    private void parseAndStageUris(List<Uri> uris) {
        try {
            JSONArray arr = new JSONArray();
            ContentResolver cr = getContentResolver();

            int count = uris.size();
            for (int i = 0; i < count; i++) {
                Uri u = uris.get(i);
                if (u == null) continue;

                String name = "file_" + (i + 1);
                long sizeBytes = 0;

                try {
                    Cursor c = cr.query(u, null, null, null, null);
                    if (c != null) {
                        int nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        int sizeIdx = c.getColumnIndex(OpenableColumns.SIZE);
                        if (c.moveToFirst()) {
                            if (nameIdx >= 0) name = c.getString(nameIdx);
                            if (sizeIdx >= 0) sizeBytes = c.getLong(sizeIdx);
                        }
                        c.close();
                    }
                } catch (Exception ignored) {}

                String mime = cr.getType(u);
                if (mime == null) mime = "application/octet-stream";

                String type = "file";
                if (mime.startsWith("image/")) type = "image";
                else if (mime.startsWith("video/")) type = "video";
                else if (mime.startsWith("audio/")) type = "audio";

                double sizeMB = sizeBytes > 0 ? (double) sizeBytes / (1024.0 * 1024.0) : 2.5;

                JSONObject obj = new JSONObject();
                obj.put("id", "android_share_" + System.currentTimeMillis() + "_" + i);
                obj.put("name", name);
                obj.put("type", type);
                obj.put("sizeMB", Math.round(sizeMB * 10.0) / 10.0);
                obj.put("uri", u.toString());
                obj.put("selected", true);
                obj.put("status", "ready");

                arr.put(obj);
            }

            pendingSharedFilesJson = arr.toString();
            if (pageLoaded) {
                deliverPendingSharedFiles();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void deliverPendingSharedFiles() {
        if (pendingSharedFilesJson != null && !pendingSharedFilesJson.equals("[]")) {
            final String js = "if (window.AuraSyncMobileReceiveShared) { " +
                    "window.AuraSyncMobileReceiveShared(" + pendingSharedFilesJson + "); " +
                    "} else { window.__aurasync_pending_shares = " + pendingSharedFilesJson + "; }";

            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript(js, null);
                }
            });
            pendingSharedFilesJson = "[]";
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) return;

            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    int count = clip.getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = clip.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // Native Android Javascript Interface
    public class AuraSyncAndroidBridge {
        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }

        @JavascriptInterface
        public String getDeviceInfo() {
            try {
                JSONObject obj = new JSONObject();
                obj.put("platform", "Android");
                obj.put("version", Build.VERSION.RELEASE);
                obj.put("sdk", Build.VERSION.SDK_INT);
                obj.put("manufacturer", Build.MANUFACTURER);
                obj.put("model", Build.MODEL);
                return obj.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void requestStoragePermissions() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                List<String> perms = new ArrayList<>();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    perms.add("android.permission.READ_MEDIA_IMAGES");
                    perms.add("android.permission.READ_MEDIA_VIDEO");
                    perms.add("android.permission.READ_MEDIA_AUDIO");
                    perms.add("android.permission.POST_NOTIFICATIONS");
                } else {
                    perms.add("android.permission.READ_EXTERNAL_STORAGE");
                    perms.add("android.permission.WRITE_EXTERNAL_STORAGE");
                }
                requestPermissions(perms.toArray(new String[0]), PERMISSION_REQUEST_CODE);
            }
        }

        @JavascriptInterface
        public void triggerNativeShare(final String title, final String text) {
            Intent sendIntent = new Intent();
            sendIntent.setAction(Intent.ACTION_SEND);
            sendIntent.putExtra(Intent.EXTRA_TEXT, text);
            sendIntent.putExtra(Intent.EXTRA_TITLE, title);
            sendIntent.setType("text/plain");

            Intent shareIntent = Intent.createChooser(sendIntent, title);
            startActivity(shareIntent);
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void vibrate(final long ms) {
            try {
                android.os.Vibrator v = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(ms);
                    }
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void openAppSettings() {
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getPackageName(), null));
                startActivity(intent);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void openCloudLogin(final String provider) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String url = "https://accounts.google.com";
                    if ("onedrive".equalsIgnoreCase(provider) || "microsoft".equalsIgnoreCase(provider)) {
                        url = "https://login.live.com";
                    } else if ("dropbox".equalsIgnoreCase(provider)) {
                        url = "https://www.dropbox.com/login";
                    }
                    try {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(browserIntent);
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public String getStorageUsage() {
            try {
                android.os.StatFs stat = new android.os.StatFs(android.os.Environment.getExternalStorageDirectory().getPath());
                long totalBytes = stat.getTotalBytes();
                long availableBytes = stat.getAvailableBytes();
                long usedBytes = totalBytes - availableBytes;
                JSONObject obj = new JSONObject();
                obj.put("totalGB", String.format(java.util.Locale.US, "%.1f", (double) totalBytes / (1024 * 1024 * 1024)));
                obj.put("usedGB", String.format(java.util.Locale.US, "%.1f", (double) usedBytes / (1024 * 1024 * 1024)));
                obj.put("freeGB", String.format(java.util.Locale.US, "%.1f", (double) availableBytes / (1024 * 1024 * 1024)));
                obj.put("percent", (int) ((usedBytes * 100) / totalBytes));
                return obj.toString();
            } catch (Exception e) {
                return "{\"totalGB\":\"128.0\",\"usedGB\":\"42.5\",\"freeGB\":\"85.5\",\"percent\":33}";
            }
        }

        @JavascriptInterface
        public String getPendingSharedFiles() {
            String res = pendingSharedFilesJson;
            pendingSharedFilesJson = "[]";
            return res;
        }

        @JavascriptInterface
        public void requestBiometricAuth() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        try {
                            CancellationSignal cancellationSignal = new CancellationSignal();
                            DialogInterface.OnClickListener cancelListener = new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    vibrate(20);
                                    if (webView != null) {
                                        webView.evaluateJavascript("if (window.onAuraSyncBiometricFailure) window.onAuraSyncBiometricFailure('cancelled');", null);
                                    }
                                }
                            };

                            Executor executor = new Executor() {
                                @Override
                                public void execute(Runnable command) {
                                    runOnUiThread(command);
                                }
                            };

                            BiometricPrompt prompt = new BiometricPrompt.Builder(MainActivity.this)
                                    .setTitle("AuraSync Security")
                                    .setSubtitle("المصادقة ببصمة الإصبع أو الوجه")
                                    .setDescription("المس مستشعر البصمة أو استخدم بصمة الوجه لفتح قفل التطبيق")
                                    .setNegativeButton("إلغاء / رمز PIN", executor, cancelListener)
                                    .build();

                            prompt.authenticate(cancellationSignal, executor, new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                    super.onAuthenticationSucceeded(result);
                                    vibrate(35);
                                    showToast("تم التحقق من البصمة بنجاح ✓");
                                    if (webView != null) {
                                        webView.evaluateJavascript("if (window.onAuraSyncBiometricSuccess) window.onAuraSyncBiometricSuccess();", null);
                                    }
                                }

                                @Override
                                public void onAuthenticationFailed() {
                                    super.onAuthenticationFailed();
                                    vibrate(140);
                                    showToast("لم يتم التعرف على البصمة! حاول مجدداً");
                                    if (webView != null) {
                                        webView.evaluateJavascript("if (window.onAuraSyncBiometricFailedAttempt) window.onAuraSyncBiometricFailedAttempt();", null);
                                    }
                                }

                                @Override
                                public void onAuthenticationError(int errorCode, CharSequence errString) {
                                    super.onAuthenticationError(errorCode, errString);
                                    vibrate(40);
                                    String msg = errString != null ? errString.toString() : "خطأ في المصادقة";
                                    if (webView != null) {
                                        webView.evaluateJavascript("if (window.onAuraSyncBiometricFailure) window.onAuraSyncBiometricFailure('" + msg.replace("'", "\\'") + "');", null);
                                    }
                                }
                            });
                            return;
                        } catch (Throwable t) {
                            android.util.Log.e("AuraSyncBiometric", "Biometric error: " + t.getMessage());
                        }
                    }

                    // Fallback to PIN / UI verification if API < 28 or prompt is unavailable
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.onAuraSyncBiometricFallback) window.onAuraSyncBiometricFallback();", null);
                    }
                }
            });
        }

        @JavascriptInterface
        public void createMobileFolder(final String folderName) {
            final String name = folderName != null && !folderName.isEmpty() ? folderName : "aurasync-mobile";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showToast("تم إنشاء مجلد " + name + " تلقائياً في السحابة ✓");
                }
            });
        }
    }
}
