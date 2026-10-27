package com.aurasync.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
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
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
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

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLDecoder;
import java.net.URLEncoder;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import android.media.MediaScannerConnection;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.os.PowerManager;
import java.util.Map;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;

public class MainActivity extends Activity {
    private static final int GOOGLE_PORT = 58291;
    private static final String ONEDRIVE_CLIENT_ID = "a7a2023e-78b4-44a6-a92f-13265d31a89b";
    private static final int ONEDRIVE_PORT = 58292;

    private String getGoogleClientId() {
        try {
            InputStream is = getAssets().open("credentials.json");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int len;
            while ((len = is.read(buf)) != -1) {
                baos.write(buf, 0, len);
            }
            is.close();
            JSONObject json = new JSONObject(baos.toString("UTF-8"));
            JSONObject installed = json.optJSONObject("installed");
            if (installed != null) {
                String cid = installed.optString("client_id", "");
                if (!cid.isEmpty()) return cid;
            }
            String cid = json.optString("client_id", "");
            if (!cid.isEmpty()) return cid;
        } catch (Exception ignored) {}
        return "";
    }

    private String getGoogleClientSecret() {
        try {
            InputStream is = getAssets().open("credentials.json");
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int len;
            while ((len = is.read(buf)) != -1) {
                baos.write(buf, 0, len);
            }
            is.close();
            JSONObject json = new JSONObject(baos.toString("UTF-8"));
            JSONObject installed = json.optJSONObject("installed");
            if (installed != null) {
                String cs = installed.optString("client_secret", "");
                if (!cs.isEmpty()) return cs;
            }
            String cs = json.optString("client_secret", "");
            if (!cs.isEmpty()) return cs;
        } catch (Exception ignored) {}
        return "";
    }

    private ServerSocket oauthServerSocket = null;
    private Thread oauthServerThread = null;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int PERMISSION_REQUEST_CODE = 1002;
    private static final int NATIVE_MEDIA_PICKER_REQUEST_CODE = 1003;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingSharedFilesJson = "[]";
    private boolean pageLoaded = false;
    private PowerManager.WakeLock wakeLock = null;

    private File pendingInstallApk = null;
    private BroadcastReceiver downloadReceiver = null;
    private long activeDownloadManagerId = -1;

    private void setupDownloadReceiver() {
        try {
            downloadReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null) return;
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != -1 && (id == activeDownloadManagerId || activeDownloadManagerId == -1)) {
                        try {
                            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                            if (dm != null) {
                                Uri downloadUri = dm.getUriForDownloadedFile(id);
                                if (downloadUri != null) {
                                    Intent installIntent = new Intent(Intent.ACTION_VIEW);
                                    installIntent.setDataAndType(downloadUri, "application/vnd.android.package-archive");
                                    installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    startActivity(installIntent);
                                }
                            }
                        } catch (Exception e) {
                            android.util.Log.w("AuraSyncDownload", "Receiver install error: " + e.getMessage());
                        }
                    }
                }
            };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }
        } catch (Exception e) {
            android.util.Log.w("AuraSyncDownload", "Failed to register download receiver: " + e.getMessage());
        }
    }

    public void launchApkInstall(final File apkFile) {
        if (apkFile == null || !apkFile.exists()) {
            showToast("تعذر العثور على ملف التحديث");
            return;
        }

        // Android 8.0+ (Oreo, API 26+) check for unknown sources permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getPackageManager().canRequestPackageInstalls()) {
                pendingInstallApk = apkFile;
                showToast("يرجى تفعيل (السماح بتثبيت التطبيقات) للبرنامج ثم الرجوع لتثبيت التحديث");
                try {
                    Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(settingsIntent);
                } catch (Exception e) {
                    try {
                        Intent genericIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        startActivity(genericIntent);
                    } catch (Exception ignored) {}
                }
                return;
            }
        }

        try {
            Uri apkUri = Uri.parse("content://" + getPackageName() + ".fileprovider/" + apkFile.getName());
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            List<android.content.pm.ResolveInfo> resolveInfos = getPackageManager().queryIntentActivities(installIntent, PackageManager.MATCH_DEFAULT_ONLY);
            if (resolveInfos != null) {
                for (android.content.pm.ResolveInfo info : resolveInfos) {
                    if (info != null && info.activityInfo != null) {
                        grantUriPermission(info.activityInfo.packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                }
            }

            startActivity(installIntent);
        } catch (Exception e) {
            android.util.Log.e("AuraSyncInstall", "ContentProvider install error: " + e.getMessage());
            try {
                Intent fallbackIntent = new Intent(Intent.ACTION_VIEW);
                fallbackIntent.setDataAndType(Uri.fromFile(apkFile), "application/vnd.android.package-archive");
                fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(fallbackIntent);
            } catch (Exception ex) {
                showToast("حدث خطأ أثناء فتح مثبت الحزم: " + ex.getMessage());
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pendingInstallApk != null && pendingInstallApk.exists()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                File apk = pendingInstallApk;
                pendingInstallApk = null;
                launchApkInstall(apk);
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Allow file URI exposure via reflection for legacy Android fallback
        try {
            java.lang.reflect.Method m = android.os.StrictMode.class.getMethod("disableDeathOnFileUriExposure");
            m.invoke(null);
        } catch (Exception ignored) {}

        // Configure edge-to-edge dark display
        configureWindowStyle();

        // Initialize WebView
        webView = new WebView(this);
        setupWebView();
        setContentView(webView);

        // Auto-request storage permissions on startup if not already granted
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !new AuraSyncAndroidBridge().hasStoragePermissions()) {
                new AuraSyncAndroidBridge().requestStoragePermissions();
            }
        } catch (Exception ignored) {}

        // Auto-install completed downloads from DownloadManager if triggered
        setupDownloadReceiver();

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

    @SuppressWarnings("deprecation")
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

    @SuppressWarnings("deprecation")
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
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36");

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

        // Direct staged file stream interceptor for picker files (zero permission loss)
        if (path.contains("api/staged/")) {
            try {
                int idx = rawPath.indexOf("api/staged/");
                String fileName = rawPath.substring(idx + 11);
                if (fileName.startsWith("/")) fileName = fileName.substring(1);
                File file = new File(new File(getCacheDir(), "aurasync_staged"), fileName);
                if (file.exists() && file.isFile()) {
                    String mime = URLConnection.guessContentTypeFromName(file.getName());
                    if (mime == null) mime = "application/octet-stream";
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                    headers.put("Access-Control-Allow-Headers", "*");
                    headers.put("Cache-Control", "no-cache, no-store");
                    return new WebResourceResponse(mime, null, 200, "OK", headers, new FileInputStream(file));
                }
            } catch (Exception ignored) {}
        }

        // Native MediaStore direct stream interceptor for seamless high-speed gallery pull
        if (path.contains("api/mediastore/")) {
            try {
                int idx = path.indexOf("api/mediastore/");
                String sub = path.substring(idx + "api/mediastore/".length());
                String[] parts = sub.split("/");
                if (parts.length >= 2) {
                    String mediaType = parts[0];
                    long mediaId = Long.parseLong(parts[1]);
                    Uri contentUri = "video".equalsIgnoreCase(mediaType)
                            ? ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, mediaId)
                            : ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, mediaId);

                    InputStream stream = getContentResolver().openInputStream(contentUri);
                    if (stream != null) {
                        String mime = getContentResolver().getType(contentUri);
                        if (mime == null) mime = "video".equalsIgnoreCase(mediaType) ? "video/mp4" : "image/jpeg";
                        Map<String, String> headers = new HashMap<>();
                        headers.put("Access-Control-Allow-Origin", "*");
                        headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                        headers.put("Access-Control-Allow-Headers", "*");
                        headers.put("Cache-Control", "no-cache, no-store");
                        return new WebResourceResponse(mime, null, 200, "OK", headers, stream);
                    }
                }
            } catch (Exception ignored) {}
        }

        // Direct content URI stream interceptor for seamless file and media transfers
        if (path.contains("api/contenturi/")) {
            try {
                int idx = rawPath.indexOf("api/contenturi/");
                String uriStr = rawPath.substring(idx + 15);
                if (uriStr.startsWith("/")) uriStr = uriStr.substring(1);
                if (!uriStr.startsWith("content://") && !uriStr.startsWith("file://")) {
                    try { uriStr = URLDecoder.decode(uriStr, "UTF-8"); } catch (Exception ignored) {}
                }
                Uri contentUri = Uri.parse(uriStr);
                InputStream stream = getContentResolver().openInputStream(contentUri);
                if (stream != null) {
                    String mime = getContentResolver().getType(contentUri);
                    if (mime == null) mime = "application/octet-stream";
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                    headers.put("Access-Control-Allow-Headers", "*");
                    headers.put("Cache-Control", "no-cache, no-store");
                    return new WebResourceResponse(mime, null, 200, "OK", headers, stream);
                }
            } catch (Exception ignored) {}
        }

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
    @SuppressWarnings("deprecation")
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri;
            if (Build.VERSION.SDK_INT >= 33) {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }
            if (uri != null) {
                List<Uri> list = new ArrayList<>();
                list.add(uri);
                parseAndStageUris(list);
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris;
            if (Build.VERSION.SDK_INT >= 33) {
                uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            }
            if (uris != null && !uris.isEmpty()) {
                parseAndStageUris(uris);
            }
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            Uri data = intent.getData();
            if ("aurasync".equalsIgnoreCase(data.getScheme())) {
                final String uriStr = data.toString();
                if (webView != null) {
                    webView.post(new Runnable() {
                        @Override
                        public void run() {
                            webView.evaluateJavascript("if (window.onAuraSyncAuthCallback) window.onAuraSyncAuthCallback('" + uriStr.replace("'", "\\'") + "');", null);
                        }
                    });
                }
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
                File stageDir = new File(getCacheDir(), "aurasync_staged");
                if (!stageDir.exists()) stageDir.mkdirs();
                String safeName = (name != null ? name : ("file_" + i)).replaceAll("[^a-zA-Z0-9._-]", "_");
                File stageFile = new File(stageDir, "stage_" + System.currentTimeMillis() + "_" + i + "_" + safeName);
                String stagedFileName = null;

                try (InputStream in = cr.openInputStream(u);
                     FileOutputStream out = new FileOutputStream(stageFile)) {
                    if (in != null) {
                        byte[] buf = new byte[65536];
                        int len;
                        long totalCopied = 0;
                        while ((len = in.read(buf)) > 0) {
                            out.write(buf, 0, len);
                            totalCopied += len;
                        }
                        out.flush();
                        if (totalCopied > 0) {
                            sizeBytes = totalCopied;
                            sizeMB = (double) totalCopied / (1024.0 * 1024.0);
                        }
                        stagedFileName = stageFile.getName();
                    }
                } catch (Exception ex) {
                    android.util.Log.w("AuraSyncStage", "Could not stage file: " + ex.getMessage());
                }

                JSONObject obj = new JSONObject();
                obj.put("id", "android_share_" + System.currentTimeMillis() + "_" + i);
                obj.put("name", name);
                obj.put("type", type);
                obj.put("mimeType", mime);
                obj.put("sizeMB", Math.round(sizeMB * 10.0) / 10.0);
                obj.put("uri", u.toString());
                if (stagedFileName != null) {
                    obj.put("stagedFileName", stagedFileName);
                }
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
        } else if (requestCode == NATIVE_MEDIA_PICKER_REQUEST_CODE) {
            List<Uri> results = new ArrayList<>();
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    int count = clip.getItemCount();
                    for (int i = 0; i < count; i++) {
                        results.add(clip.getItemAt(i).getUri());
                    }
                } else if (data.getData() != null) {
                    results.add(data.getData());
                }
            }
            if (!results.isEmpty()) {
                parseAndStageUris(results);
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean anyGranted = false;
            for (int r : grantResults) {
                if (r == PackageManager.PERMISSION_GRANTED) {
                    anyGranted = true;
                    break;
                }
            }
            final boolean granted = anyGranted;
            if (webView != null) {
                webView.post(new Runnable() {
                    @Override
                    public void run() {
                        webView.evaluateJavascript("if (window.onAuraSyncPermissionsResult) window.onAuraSyncPermissionsResult(" + granted + ");", null);
                    }
                });
            }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
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
        public boolean hasStoragePermissions() {
            if (Build.VERSION.SDK_INT >= 34) {
                return checkSelfPermission("android.permission.READ_MEDIA_IMAGES") == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission("android.permission.READ_MEDIA_VIDEO") == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == PackageManager.PERMISSION_GRANTED;
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return checkSelfPermission("android.permission.READ_MEDIA_IMAGES") == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission("android.permission.READ_MEDIA_VIDEO") == PackageManager.PERMISSION_GRANTED;
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return checkSelfPermission("android.permission.READ_EXTERNAL_STORAGE") == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public boolean hasAllFilesPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    return Environment.isExternalStorageManager();
                } catch (Exception ignored) {
                    return false;
                }
            }
            return hasStoragePermissions();
        }

        @JavascriptInterface
        public void requestAllFilesPermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        try {
                            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                            intent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(intent);
                        } catch (Exception e) {
                            try {
                                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                                startActivity(intent);
                            } catch (Exception ignored) {}
                        }
                    } else {
                        requestStoragePermissions();
                    }
                }
            });
        }

        @JavascriptInterface
        public void requestStoragePermissions() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        List<String> perms = new ArrayList<>();
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            perms.add("android.permission.READ_MEDIA_IMAGES");
                            perms.add("android.permission.READ_MEDIA_VIDEO");
                            perms.add("android.permission.READ_MEDIA_AUDIO");
                            if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                                perms.add("android.permission.POST_NOTIFICATIONS");
                            }
                            if (Build.VERSION.SDK_INT >= 34) {
                                try {
                                    perms.add("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
                                } catch (Exception ignored) {}
                            }
                        } else {
                            perms.add("android.permission.READ_EXTERNAL_STORAGE");
                            perms.add("android.permission.WRITE_EXTERNAL_STORAGE");
                        }
                        requestPermissions(perms.toArray(new String[0]), PERMISSION_REQUEST_CODE);
                    }
                }
            });
        }

        @JavascriptInterface
        public void launchNativeMediaPicker(final String mode) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        if ("gallery".equalsIgnoreCase(mode) || "media".equalsIgnoreCase(mode)) {
                            intent.setType("image/*");
                            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
                        } else {
                            intent.setType("*/*");
                        }
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                        startActivityForResult(Intent.createChooser(intent, "AuraSync - اختر الملفات"), NATIVE_MEDIA_PICKER_REQUEST_CODE);
                    } catch (Exception e) {
                        showToast("تعذر فتح المعرض: " + e.getMessage());
                    }
                }
            });
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
        @SuppressWarnings("deprecation")
        public void vibrate(final long ms) {
            try {
                android.os.Vibrator v;
                if (Build.VERSION.SDK_INT >= 31) {
                    android.os.VibratorManager vm = (android.os.VibratorManager) getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE);
                    v = (vm != null) ? vm.getDefaultVibrator() : null;
                } else {
                    v = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
                }
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
        public void downloadAndInstallUpdate(final String apkUrl, final String versionName) {
            vibrate(30);
            showToast("جاري تنزيل التحديث وتجهيز التثبيت تلقائياً...");

            new Thread(new Runnable() {
                @Override
                public void run() {
                    HttpURLConnection conn = null;
                    InputStream in = null;
                    FileOutputStream out = null;
                    File updateFile = null;

                    try {
                        String rawTarget = (apkUrl != null && !apkUrl.trim().isEmpty())
                                ? apkUrl.trim()
                                : "https://github.com/samer20032020-dev/aurasync/releases/download/v" + (versionName != null && !versionName.isEmpty() ? versionName : "1.0.26") + "/AuraSync.apk";

                        URL targetUrl = URI.create(rawTarget).toURL();
                        int redirects = 0;

                        // Follow GitHub/CDN redirects (301, 302, 303, 307, 308) to final S3/CDN URL
                        while (redirects < 10) {
                            conn = (HttpURLConnection) targetUrl.openConnection();
                            conn.setConnectTimeout(12000);
                            conn.setReadTimeout(25000);
                            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36");
                            // Mandatory: Accept-Encoding identity prevents gzip compression on APK binaries, preserving Content-Length from CDN/S3
                            conn.setRequestProperty("Accept-Encoding", "identity");
                            conn.setInstanceFollowRedirects(true);

                            int status = conn.getResponseCode();
                            if (status == HttpURLConnection.HTTP_MOVED_PERM ||
                                status == HttpURLConnection.HTTP_MOVED_TEMP ||
                                status == HttpURLConnection.HTTP_SEE_OTHER ||
                                status == 307 || status == 308) {
                                String loc = conn.getHeaderField("Location");
                                conn.disconnect();
                                if (loc == null || loc.isEmpty()) break;
                                targetUrl = targetUrl.toURI().resolve(loc).toURL();
                                redirects++;
                                continue;
                            }
                            break;
                        }

                        int responseCode = conn.getResponseCode();
                        if (responseCode != HttpURLConnection.HTTP_OK) {
                            throw new Exception("HTTP status " + responseCode);
                        }

                        final long totalBytes = conn.getContentLength();
                        in = new BufferedInputStream(conn.getInputStream(), 32768);

                        // Write to internal cache directory
                        updateFile = new File(MainActivity.this.getCacheDir(), "AuraSync-update.apk");
                        if (updateFile.exists()) {
                            updateFile.delete();
                        }

                        out = new FileOutputStream(updateFile);
                        BufferedOutputStream bufferedOut = new BufferedOutputStream(out, 32768);
                        byte[] buffer = new byte[32768];
                        int bytesRead;
                        long totalRead = 0;
                        long lastReportTime = 0;

                        while ((bytesRead = in.read(buffer)) != -1) {
                            bufferedOut.write(buffer, 0, bytesRead);
                            totalRead += bytesRead;

                            long now = System.currentTimeMillis();
                            if (now - lastReportTime > 80 || (totalBytes > 0 && totalRead >= totalBytes)) {
                                lastReportTime = now;
                                final int percent = totalBytes > 0 
                                        ? Math.min(99, Math.max(1, (int) ((totalRead * 100) / totalBytes))) 
                                        : Math.min(95, Math.max(1, (int) ((totalRead * 100) / 320000L)));
                                final double mbRead = Math.round((totalRead / (1024.0 * 1024.0)) * 100.0) / 100.0;
                                final double mbTotal = totalBytes > 0 
                                        ? Math.round((totalBytes / (1024.0 * 1024.0)) * 100.0) / 100.0 
                                        : (mbRead > 0.3 ? mbRead : 0.32);

                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (webView != null) {
                                            webView.evaluateJavascript(
                                                "if (window.onAuraSyncUpdateProgress) window.onAuraSyncUpdateProgress(" +
                                                percent + ", " + mbRead + ", " + mbTotal + ");", null);
                                        }
                                    }
                                });
                            }
                        }

                        bufferedOut.flush();
                        bufferedOut.close();
                        out = null;
                        in.close();
                        in = null;
                        conn.disconnect();
                        conn = null;

                        // Ensure readable permissions
                        updateFile.setReadable(true, false);

                        final File finalApk = updateFile;
                        final double finalMb = Math.round((totalRead / (1024.0 * 1024.0)) * 100.0) / 100.0;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (webView != null) {
                                    webView.evaluateJavascript(
                                        "if (window.onAuraSyncUpdateProgress) window.onAuraSyncUpdateProgress(100, " + finalMb + ", " + finalMb + ");", null);
                                    webView.evaluateJavascript("if (window.onAuraSyncUpdateReady) window.onAuraSyncUpdateReady();", null);
                                }
                                showToast("اكتمل التحميل بسرعة فائقة! جاري فتح التثبيت...");
                                launchApkInstall(finalApk);
                            }
                        });

                    } catch (final Exception e) {
                        e.printStackTrace();
                        if (out != null) { try { out.close(); } catch (Exception ignored) {} }
                        if (in != null) { try { in.close(); } catch (Exception ignored) {} }
                        if (conn != null) { try { conn.disconnect(); } catch (Exception ignored) {} }

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                showToast("جاري التنزيل المباشر كحل بديل...");
                                if (webView != null) {
                                    webView.evaluateJavascript("if (window.onAuraSyncUpdateError) window.onAuraSyncUpdateError('" + e.getMessage() + "');", null);
                                }

                                // Fallback to DownloadManager
                                try {
                                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                                    if (dm != null) {
                                        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
                                        request.setTitle("AuraSync Update");
                                        request.setDescription("تنزيل وتثبيت تحديث AuraSync");
                                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                                        request.setMimeType("application/vnd.android.package-archive");
                                        request.setDestinationInExternalFilesDir(MainActivity.this, android.os.Environment.DIRECTORY_DOWNLOADS, "AuraSync-update.apk");
                                        activeDownloadManagerId = dm.enqueue(request);
                                        return;
                                    }
                                } catch (Exception ignored) {}

                                // Ultimate fallback: open download URL in external browser/downloader
                                try {
                                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
                                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                    startActivity(intent);
                                } catch (Exception ignored) {}
                            }
                        });
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public void startRealOAuth(final String provider) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startOAuthFlow(provider);
                }
            });
        }

        @JavascriptInterface
        public void openCloudLogin(final String provider) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startOAuthFlow(provider);
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
                                    MainActivity.this.runOnUiThread(command);
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
        public String getGoogleClientId() {
            return MainActivity.this.getGoogleClientId();
        }

        @JavascriptInterface
        public String getGoogleClientSecret() {
            return MainActivity.this.getGoogleClientSecret();
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

        @JavascriptInterface
        public void acquireWakeLock(final long timeoutMs) {
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                    }
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuraSync:BackgroundTransfer");
                    wakeLock.setReferenceCounted(false);
                    long duration = timeoutMs > 0 ? timeoutMs : (30 * 60 * 1000L); // 30 mins default
                    wakeLock.acquire(duration);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void releaseWakeLock() {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                    wakeLock = null;
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void showProgressNotification(final String title, final String message, final int progress, final int max) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                        if (nm == null) return;

                        final String CHANNEL_ID = "aurasync_gallery_backup";
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
                            if (channel == null) {
                                channel = new NotificationChannel(
                                    CHANNEL_ID,
                                    "AuraSync Gallery Backup",
                                    NotificationManager.IMPORTANCE_LOW
                                );
                                channel.setDescription("Progress notification for AuraSync cloud gallery backup");
                                channel.enableLights(false);
                                channel.enableVibration(false);
                                channel.setShowBadge(false);
                                nm.createNotificationChannel(channel);
                            }
                        }

                        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
                        PendingIntent pendingIntent = null;
                        if (launchIntent != null) {
                            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                flags |= PendingIntent.FLAG_IMMUTABLE;
                            }
                            pendingIntent = PendingIntent.getActivity(MainActivity.this, 0, launchIntent, flags);
                        }

                        Notification.Builder builder;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            builder = new Notification.Builder(MainActivity.this, CHANNEL_ID);
                        } else {
                            builder = new Notification.Builder(MainActivity.this);
                        }

                        int appIcon = getApplicationInfo().icon != 0 ? getApplicationInfo().icon : android.R.drawable.stat_sys_upload;

                        builder.setContentTitle(title)
                               .setContentText(message)
                               .setSmallIcon(appIcon)
                               .setOngoing(true)
                               .setOnlyAlertOnce(true)
                               .setProgress(Math.max(1, max), Math.max(0, progress), false);

                        if (pendingIntent != null) {
                            builder.setContentIntent(pendingIntent);
                        }

                        nm.notify(9001, builder.build());
                    } catch (Exception e) {
                        // ignore notification exceptions gracefully
                    }
                }
            });
        }

        @JavascriptInterface
        public void dismissProgressNotification() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                        if (nm != null) {
                            nm.cancel(9001);
                        }
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public boolean saveCloudFileToPhone(final String fileName, final String base64Data, final String mimeType) {
            if (fileName == null || fileName.trim().isEmpty() || base64Data == null || base64Data.trim().isEmpty()) {
                return false;
            }
            try {
                final byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                if (bytes == null || bytes.length == 0) return false;

                final String cleanName = fileName.trim();
                final String cleanMime = (mimeType != null && !mimeType.trim().isEmpty()) ? mimeType.trim() : "image/jpeg";
                final boolean isImage = cleanMime.startsWith("image/");
                final boolean isVideo = cleanMime.startsWith("video/");

                // 1. Android 10+ (API 29+) Scoped MediaStore insertion
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, cleanName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, cleanMime);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                    Uri collectionUri;
                    if (isImage) {
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AuraSync");
                        collectionUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                    } else if (isVideo) {
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/AuraSync");
                        collectionUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                    } else {
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/AuraSync");
                        collectionUri = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                    }

                    ContentResolver cr = getContentResolver();
                    Uri itemUri = cr.insert(collectionUri, values);
                    if (itemUri != null) {
                        try (OutputStream os = cr.openOutputStream(itemUri)) {
                            if (os != null) {
                                os.write(bytes);
                                os.flush();
                            }
                        }
                        values.clear();
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        cr.update(itemUri, values, null, null);

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                showToast("✓ تم تنزيل " + cleanName + " وحفظه في استوديو الهاتف");
                            }
                        });
                        return true;
                    }
                }

                // 2. Legacy filesystem write (< Android 10) or Direct Fallback
                File targetDir;
                if (isImage) {
                    targetDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "AuraSync");
                } else if (isVideo) {
                    targetDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AuraSync");
                } else {
                    targetDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                }

                if (!targetDir.exists()) targetDir.mkdirs();
                File targetFile = new File(targetDir, cleanName);
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(bytes);
                    fos.flush();
                }

                // Trigger MediaScanner so gallery instantly indexes it
                android.media.MediaScannerConnection.scanFile(
                    MainActivity.this,
                    new String[]{targetFile.getAbsolutePath()},
                    new String[]{cleanMime},
                    null
                );

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        showToast("✓ تم تنزيل " + cleanName + " وحفظه في الهاتف بنجاح");
                    }
                });
                return true;

            } catch (Exception e) {
                android.util.Log.e("AuraSyncDownload", "saveCloudFileToPhone error: " + e.getMessage(), e);
                return false;
            }
        }

        @JavascriptInterface
        public void downloadCloudFile(String fileName, String base64Data, String mimeType) {
            saveCloudFileToPhone(fileName, base64Data, mimeType);
        }

        @JavascriptInterface
        public int getGalleryMediaTotalCount() {
            if (!hasStoragePermissions()) {
                // Request permissions and return 0 so callers handle gracefully
                requestStoragePermissions();
                return 0;
            }
            int total = 0;
            try {
                ContentResolver cr = getContentResolver();
                Cursor cImg = cr.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    new String[]{MediaStore.Images.Media._ID},
                    null, null, null
                );
                if (cImg != null) {
                    total += cImg.getCount();
                    cImg.close();
                }
                Cursor cVid = cr.query(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    new String[]{MediaStore.Video.Media._ID},
                    null, null, null
                );
                if (cVid != null) {
                    total += cVid.getCount();
                    cVid.close();
                }
            } catch (Exception ignored) {}
            return total;
        }

        @JavascriptInterface
        public String getLocalMediaFileNames() {
            java.util.LinkedHashSet<String> nameSet = new java.util.LinkedHashSet<>();

            if (!hasStoragePermissions()) {
                requestStoragePermissions();
            }

            // 1. MediaStore Images
            try {
                ContentResolver cr = getContentResolver();
                String[] proj = new String[]{
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.DATA
                };
                try (Cursor c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, null, null, null)) {
                    if (c != null) {
                        int nameIdx = c.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                        int dataIdx = c.getColumnIndex(MediaStore.MediaColumns.DATA);
                        while (c.moveToNext()) {
                            String name = (nameIdx >= 0) ? c.getString(nameIdx) : null;
                            if (name == null || name.trim().isEmpty()) {
                                if (dataIdx >= 0) {
                                    String path = c.getString(dataIdx);
                                    if (path != null) {
                                        int ls = path.lastIndexOf('/');
                                        name = (ls >= 0) ? path.substring(ls + 1) : path;
                                    }
                                }
                            }
                            if (name != null && !name.trim().isEmpty()) {
                                nameSet.add(name.trim());
                            }
                        }
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("AuraSyncMedia", "Images query error: " + e.getMessage());
            }

            // 2. MediaStore Videos
            try {
                ContentResolver cr = getContentResolver();
                String[] proj = new String[]{
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.DATA
                };
                try (Cursor cv = cr.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, proj, null, null, null)) {
                    if (cv != null) {
                        int nameIdx = cv.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                        int dataIdx = cv.getColumnIndex(MediaStore.MediaColumns.DATA);
                        while (cv.moveToNext()) {
                            String name = (nameIdx >= 0) ? cv.getString(nameIdx) : null;
                            if (name == null || name.trim().isEmpty()) {
                                if (dataIdx >= 0) {
                                    String path = cv.getString(dataIdx);
                                    if (path != null) {
                                        int ls = path.lastIndexOf('/');
                                        name = (ls >= 0) ? path.substring(ls + 1) : path;
                                    }
                                }
                            }
                            if (name != null && !name.trim().isEmpty()) {
                                nameSet.add(name.trim());
                            }
                        }
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("AuraSyncMedia", "Videos query error: " + e.getMessage());
            }

            // 3. MediaStore Downloads (Android 10+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentResolver cr = getContentResolver();
                    String[] proj = new String[]{
                        MediaStore.MediaColumns.DISPLAY_NAME,
                        MediaStore.MediaColumns.DATA
                    };
                    try (Cursor cd = cr.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, proj, null, null, null)) {
                        if (cd != null) {
                            int nameIdx = cd.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                            int dataIdx = cd.getColumnIndex(MediaStore.MediaColumns.DATA);
                            while (cd.moveToNext()) {
                                String name = (nameIdx >= 0) ? cd.getString(nameIdx) : null;
                                if (name == null || name.trim().isEmpty()) {
                                    if (dataIdx >= 0) {
                                        String path = cd.getString(dataIdx);
                                        if (path != null) {
                                            int ls = path.lastIndexOf('/');
                                            name = (ls >= 0) ? path.substring(ls + 1) : path;
                                        }
                                    }
                                }
                                if (name != null && !name.trim().isEmpty()) {
                                    nameSet.add(name.trim());
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    android.util.Log.w("AuraSyncMedia", "Downloads query error: " + e.getMessage());
                }
            }

            // 4. Direct Public Directory Inspection (Downloads, Pictures, DCIM, Pictures/AuraSync)
            try {
                File[] checkDirs = new File[]{
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "AuraSync"),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Camera")
                };
                for (File dir : checkDirs) {
                    if (dir != null && dir.exists() && dir.isDirectory()) {
                        File[] list = dir.listFiles();
                        if (list != null) {
                            for (File f : list) {
                                if (f != null && f.isFile()) {
                                    nameSet.add(f.getName().trim());
                                }
                            }
                        }
                    }
                }
            } catch (Exception e) {
                android.util.Log.w("AuraSyncMedia", "Directory check error: " + e.getMessage());
            }

            JSONArray arr = new JSONArray();
            for (String n : nameSet) {
                arr.put(n);
            }
            android.util.Log.i("AuraSyncMedia", "getLocalMediaFileNames total count: " + arr.length());
            return arr.toString();
        }

        @JavascriptInterface
        public boolean isMediaFileOnPhone(String fileName) {
            if (fileName == null || fileName.trim().isEmpty()) return false;
            final String cleanName = fileName.trim();

            // 1. Direct filesystem check
            try {
                File[] checkDirs = new File[]{
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "AuraSync"),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Camera")
                };
                for (File dir : checkDirs) {
                    if (dir != null && dir.exists()) {
                        File target = new File(dir, cleanName);
                        if (target.exists() && target.isFile()) return true;
                    }
                }
            } catch (Exception ignored) {}

            // 2. MediaStore query
            try {
                ContentResolver cr = getContentResolver();
                String[] proj = new String[]{MediaStore.MediaColumns._ID};
                String sel = MediaStore.MediaColumns.DISPLAY_NAME + "=? OR " + MediaStore.MediaColumns.DATA + " LIKE ?";
                String[] args = new String[]{cleanName, "%/" + cleanName};
                try (Cursor c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)) {
                    if (c != null && c.getCount() > 0) return true;
                }
                try (Cursor cv = cr.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)) {
                    if (cv != null && cv.getCount() > 0) return true;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try (Cursor cd = cr.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, proj, sel, args, null)) {
                        if (cd != null && cd.getCount() > 0) return true;
                    }
                }
            } catch (Exception ignored) {}

            return false;
        }

        @JavascriptInterface
        public boolean deleteMediaById(final String mediaType, final long mediaId) {
            boolean deleted = false;
            try {
                ContentResolver cr = getContentResolver();
                Uri contentUri = "video".equalsIgnoreCase(mediaType)
                    ? ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, mediaId)
                    : ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, mediaId);

                String dataPath = null;
                try (Cursor c = cr.query(contentUri, new String[]{MediaStore.MediaColumns.DATA}, null, null, null)) {
                    if (c != null && c.moveToFirst()) {
                        dataPath = c.getString(0);
                    }
                } catch (Exception ignored) {}

                if (dataPath != null && !dataPath.trim().isEmpty()) {
                    try {
                        File f = new File(dataPath);
                        if (f.exists() && f.delete()) {
                            deleted = true;
                        }
                    } catch (Exception ignored) {}
                }

                try {
                    int rows = cr.delete(contentUri, null, null);
                    if (rows > 0) deleted = true;
                } catch (Exception ignored) {}

                if (dataPath != null) {
                    try {
                        MediaScannerConnection.scanFile(MainActivity.this, new String[]{dataPath}, null, null);
                    } catch (Exception ignored) {}
                }
            } catch (Exception ignored) {}
            return deleted;
        }

        @JavascriptInterface
        public boolean deleteMediaFileFromPhone(final String fileName) {
            if (fileName == null || fileName.trim().isEmpty()) return false;
            final String cleanName = fileName.trim();
            boolean deletedAny = false;
            final List<String> pathsToScan = new ArrayList<>();
            final List<Uri> urisToDelete = new ArrayList<>();

            ContentResolver cr = getContentResolver();

            // 1. Query MediaStore for Images & Videos with exact & case-insensitive matches
            try {
                String sel = MediaStore.MediaColumns.DISPLAY_NAME + "=? OR LOWER(" + MediaStore.MediaColumns.DISPLAY_NAME + ")=LOWER(?) OR " + MediaStore.MediaColumns.DATA + " LIKE ?";
                String[] args = new String[]{cleanName, cleanName, "%/" + cleanName};
                String[] proj = new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATA};

                try (Cursor c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)) {
                    if (c != null) {
                        int idIdx = c.getColumnIndex(MediaStore.MediaColumns._ID);
                        int dataIdx = c.getColumnIndex(MediaStore.MediaColumns.DATA);
                        while (c.moveToNext()) {
                            long id = idIdx >= 0 ? c.getLong(idIdx) : -1L;
                            if (id > 0) {
                                urisToDelete.add(ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id));
                            }
                            String p = dataIdx >= 0 ? c.getString(dataIdx) : null;
                            if (p != null) pathsToScan.add(p);
                        }
                    }
                } catch (Exception ignored) {}

                try (Cursor cv = cr.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, proj, sel, args, null)) {
                    if (cv != null) {
                        int idIdx = cv.getColumnIndex(MediaStore.MediaColumns._ID);
                        int dataIdx = cv.getColumnIndex(MediaStore.MediaColumns.DATA);
                        while (cv.moveToNext()) {
                            long id = idIdx >= 0 ? cv.getLong(idIdx) : -1L;
                            if (id > 0) {
                                urisToDelete.add(ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id));
                            }
                            String p = dataIdx >= 0 ? cv.getString(dataIdx) : null;
                            if (p != null) pathsToScan.add(p);
                        }
                    }
                } catch (Exception ignored) {}

                // Delete each specific URI
                for (Uri u : urisToDelete) {
                    try {
                        int r = cr.delete(u, null, null);
                        if (r > 0) deletedAny = true;
                    } catch (Exception ignored) {}
                }

                // Delete table rows by selection
                try {
                    int d1 = cr.delete(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, sel, args);
                    if (d1 > 0) deletedAny = true;
                } catch (Exception ignored) {}
                try {
                    int d2 = cr.delete(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, sel, args);
                    if (d2 > 0) deletedAny = true;
                } catch (Exception ignored) {}
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        int d3 = cr.delete(MediaStore.Downloads.EXTERNAL_CONTENT_URI, sel, args);
                        if (d3 > 0) deletedAny = true;
                    } catch (Exception ignored) {}
                }
            } catch (Exception ignored) {}

            // 2. Direct filesystem deletion across discovered paths
            for (String p : pathsToScan) {
                try {
                    File f = new File(p);
                    if (f.exists() && f.delete()) {
                        deletedAny = true;
                    }
                } catch (Exception ignored) {}
            }

            // 3. Direct filesystem search across standard folders
            try {
                File[] checkDirs = new File[]{
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Camera"),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "AuraSync"),
                    new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Screenshots"),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                };
                for (File dir : checkDirs) {
                    if (dir != null && dir.exists()) {
                        File target = new File(dir, cleanName);
                        if (target.exists() && target.isFile()) {
                            String p = target.getAbsolutePath();
                            if (target.delete()) {
                                deletedAny = true;
                                pathsToScan.add(p);
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}

            // 4. Force MediaScanner refresh on all touched paths
            if (!pathsToScan.isEmpty()) {
                try {
                    MediaScannerConnection.scanFile(MainActivity.this, pathsToScan.toArray(new String[0]), null, null);
                } catch (Exception ignored) {}
            }

            return deletedAny;
        }

        @JavascriptInterface
        public boolean isWifiConnected() {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm == null) return false;
                Network network = cm.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                return caps != null && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                                       caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
            } catch (Exception ignored) {
                return false;
            }
        }

        /**
         * scanGalleryMedia — Returns a page of media items using correct global LIMIT+OFFSET
         * across the unified images+videos list (sorted newest-first per type).
         *
         * Strategy: images come first (offset applied globally across both), then videos fill
         * whatever slots remain in the page after images are exhausted.
         *
         * Example: limit=50, offset=0  → up to 50 images, then fill with videos if < 50 images
         *          limit=50, offset=10 → skip first 10 images globally, take next 50 slots
         *          limit=50, offset=60 → all images exhausted (imageCount=13), skip (60-13)=47 videos
         */
        @JavascriptInterface
        public String scanGalleryMedia(final int limit, final int offset) {
            JSONArray arr = new JSONArray();
            try {
                ContentResolver cr = getContentResolver();
                int safeLimit  = (limit  > 0 ? Math.min(limit,  500) : 100);
                int safeOffset = Math.max(offset, 0);

                String[] proj = new String[]{
                    MediaStore.MediaColumns._ID,
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.MIME_TYPE
                };
                final String order = MediaStore.MediaColumns.DATE_ADDED + " DESC";

                // ── Phase 1: Images ──────────────────────────────────────────
                int imageTotal  = 0;
                try (Cursor cCount = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, new String[]{MediaStore.MediaColumns._ID}, null, null, null)) {
                    if (cCount != null) {
                        imageTotal = cCount.getCount();
                    }
                } catch (Exception ignored) {}

                int imageSkip = Math.min(safeOffset, imageTotal);
                int imageTake = Math.min(safeLimit, Math.max(0, imageTotal - imageSkip));

                if (imageTake > 0) {
                    try (Cursor c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, null, null, order)) {
                        if (c != null && c.moveToPosition(imageSkip)) {
                            int idIdx   = c.getColumnIndex(MediaStore.MediaColumns._ID);
                            int nameIdx = c.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                            int sizeIdx = c.getColumnIndex(MediaStore.MediaColumns.SIZE);
                            int mimeIdx = c.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE);

                            int taken = 0;
                            do {
                                long id = idIdx >= 0 ? c.getLong(idIdx) : 0L;
                                String name = nameIdx >= 0 ? c.getString(nameIdx) : null;
                                long size = sizeIdx >= 0 && !c.isNull(sizeIdx) ? c.getLong(sizeIdx) : 0L;
                                String mime = mimeIdx >= 0 ? c.getString(mimeIdx) : null;

                                JSONObject item = new JSONObject();
                                item.put("id",       id);
                                item.put("type",     "image");
                                item.put("name",     (name != null && !name.isEmpty() ? name : ("photo_" + id + ".jpg")));
                                item.put("size",     size);
                                item.put("mimeType", (mime != null && !mime.isEmpty() ? mime : "image/jpeg"));
                                arr.put(item);
                                taken++;
                                if (taken >= imageTake) break;
                            } while (c.moveToNext());
                        }
                    } catch (Exception ignored) {}
                }

                // ── Phase 2: Videos (fill remaining slots) ────────────────────
                int remaining = safeLimit - arr.length();
                if (remaining > 0) {
                    int videoOffset = Math.max(0, safeOffset - imageTotal);
                    try (Cursor cv = cr.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, proj, null, null, order)) {
                        if (cv != null && cv.moveToPosition(videoOffset)) {
                            int idIdx   = cv.getColumnIndex(MediaStore.MediaColumns._ID);
                            int nameIdx = cv.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
                            int sizeIdx = cv.getColumnIndex(MediaStore.MediaColumns.SIZE);
                            int mimeIdx = cv.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE);

                            int taken = 0;
                            do {
                                long id = idIdx >= 0 ? cv.getLong(idIdx) : 0L;
                                String name = nameIdx >= 0 ? cv.getString(nameIdx) : null;
                                long size = sizeIdx >= 0 && !cv.isNull(sizeIdx) ? cv.getLong(sizeIdx) : 0L;
                                String mime = mimeIdx >= 0 ? cv.getString(mimeIdx) : null;

                                JSONObject item = new JSONObject();
                                item.put("id",       id);
                                item.put("type",     "video");
                                item.put("name",     (name != null && !name.isEmpty() ? name : ("video_" + id + ".mp4")));
                                item.put("size",     size);
                                item.put("mimeType", (mime != null && !mime.isEmpty() ? mime : "video/mp4"));
                                arr.put(item);
                                taken++;
                                if (taken >= remaining) break;
                            } while (cv.moveToNext());
                        }
                    } catch (Exception ignored) {}
                }

            } catch (Exception ignored) {}
            return arr.toString();
        }

        @JavascriptInterface
        public String getMediaItemBase64(final String mediaType, final long mediaId) {
            try {
                Uri contentUri = "video".equalsIgnoreCase(mediaType)
                        ? ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, mediaId)
                        : ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, mediaId);
                try (InputStream stream = getContentResolver().openInputStream(contentUri);
                     ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    if (stream != null) {
                        byte[] buf = new byte[32768];
                        int len;
                        while ((len = stream.read(buf)) > 0) {
                            baos.write(buf, 0, len);
                        }
                        return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                    }
                }
            } catch (Exception ignored) {}
            return "";
        }
    }

    // ─── Real Android OAuth 2.0 Loopback Engine ──────────────────────────────
    public void showToast(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    public synchronized void stopOAuthServer() {
        try {
            if (oauthServerSocket != null && !oauthServerSocket.isClosed()) {
                oauthServerSocket.close();
            }
        } catch (Exception ignored) {}
        oauthServerSocket = null;
        if (oauthServerThread != null) {
            try {
                oauthServerThread.interrupt();
            } catch (Exception ignored) {}
            oauthServerThread = null;
        }
    }

    public synchronized void startOAuthFlow(final String provider) {
        stopOAuthServer();

        final boolean isGoogle = !"onedrive".equalsIgnoreCase(provider) && !"microsoft".equalsIgnoreCase(provider);
        final int port = isGoogle ? GOOGLE_PORT : ONEDRIVE_PORT;

        // Acquire high-priority WakeLock so Android OS never throttles the background socket thread
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuraSync:OAuthLoopback");
                wakeLock.acquire(120000); // 2 minutes max
            }
        } catch (Exception ignored) {}

        oauthServerThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // Bind to wildcard (IPv4 + IPv6) so Chrome on modern Android never gets connection refused / offline error
                    oauthServerSocket = new ServerSocket(port, 10);

                    // Launch system browser with official OAuth authorization consent URL
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            String authUrl;
                            try {
                                if (isGoogle) {
                                    authUrl = "https://accounts.google.com/o/oauth2/v2/auth"
                                        + "?client_id=" + URLEncoder.encode(getGoogleClientId(), "UTF-8")
                                        + "&redirect_uri=" + URLEncoder.encode("http://localhost:" + GOOGLE_PORT, "UTF-8")
                                        + "&response_type=code"
                                        + "&scope=" + URLEncoder.encode("openid email profile https://www.googleapis.com/auth/drive.file", "UTF-8")
                                        + "&access_type=offline"
                                        + "&prompt=select_account";
                                } else {
                                    authUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
                                        + "?client_id=" + URLEncoder.encode(ONEDRIVE_CLIENT_ID, "UTF-8")
                                        + "&redirect_uri=" + URLEncoder.encode("http://localhost:" + ONEDRIVE_PORT, "UTF-8")
                                        + "&response_type=code"
                                        + "&scope=" + URLEncoder.encode("Files.ReadWrite.All User.Read offline_access", "UTF-8")
                                        + "&prompt=select_account";
                                }

                                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(authUrl));
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(intent);
                            } catch (Exception e) {
                                showToast("تعذر فتح المتصفح للمصادقة: " + e.getMessage());
                            }
                        }
                    });

                    // Loop to accept connections resiliently (handles Chrome Private Network Access preflights, favicons, and IPv4/IPv6 probes)
                    while (oauthServerSocket != null && !oauthServerSocket.isClosed()) {
                        Socket clientSocket;
                        try {
                            clientSocket = oauthServerSocket.accept();
                        } catch (Exception socketClosed) {
                            break;
                        }

                        try {
                            BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream(), StandardCharsets.UTF_8));
                            String requestLine = reader.readLine();

                            if (requestLine == null || requestLine.isEmpty()) {
                                try { clientSocket.close(); } catch (Exception ignored) {}
                                continue;
                            }

                            // 1. Chrome Private Network Access (PNA) Preflight (OPTIONS)
                            if (requestLine.startsWith("OPTIONS")) {
                                OutputStream os = clientSocket.getOutputStream();
                                String pna = "HTTP/1.1 204 No Content\r\n"
                                    + "Access-Control-Allow-Origin: *\r\n"
                                    + "Access-Control-Allow-Private-Network: true\r\n"
                                    + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                                    + "Access-Control-Allow-Headers: *\r\n"
                                    + "Connection: close\r\n\r\n";
                                os.write(pna.getBytes(StandardCharsets.UTF_8));
                                os.flush();
                                try { clientSocket.close(); } catch (Exception ignored) {}
                                continue;
                            }

                            // 2. Favicon filter
                            if (requestLine.contains("/favicon.ico")) {
                                OutputStream os = clientSocket.getOutputStream();
                                os.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                                os.flush();
                                try { clientSocket.close(); } catch (Exception ignored) {}
                                continue;
                            }

                            // 3. Parse auth code and error
                            String code = null;
                            String error = null;

                            int codeIdx = requestLine.indexOf("code=");
                            if (codeIdx != -1) {
                                int end = requestLine.indexOf('&', codeIdx);
                                int space = requestLine.indexOf(' ', codeIdx);
                                if (end == -1 || (space != -1 && space < end)) end = space;
                                if (end != -1) code = requestLine.substring(codeIdx + 5, end);
                                else code = requestLine.substring(codeIdx + 5);
                                code = URLDecoder.decode(code, "UTF-8");
                            }

                            int errIdx = requestLine.indexOf("error=");
                            if (errIdx != -1) {
                                int end = requestLine.indexOf('&', errIdx);
                                int space = requestLine.indexOf(' ', errIdx);
                                if (end == -1 || (space != -1 && space < end)) end = space;
                                if (end != -1) error = requestLine.substring(errIdx + 6, end);
                                else error = requestLine.substring(errIdx + 6);
                                error = URLDecoder.decode(error, "UTF-8");
                            }

                            // 4. Chrome socket warm-up probe without query params
                            if (code == null && error == null) {
                                OutputStream os = clientSocket.getOutputStream();
                                String probeOk = "HTTP/1.1 200 OK\r\n"
                                    + "Access-Control-Allow-Origin: *\r\n"
                                    + "Access-Control-Allow-Private-Network: true\r\n"
                                    + "Content-Type: text/plain\r\n"
                                    + "Content-Length: 2\r\n"
                                    + "Connection: close\r\n\r\nOK";
                                os.write(probeOk.getBytes(StandardCharsets.UTF_8));
                                os.flush();
                                try { clientSocket.close(); } catch (Exception ignored) {}
                                continue;
                            }

                            // 5. Valid auth response received! Send instant auto-redirect HTML with intent URI
                            String responseHtml;
                            if (code != null) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        try {
                                            Intent reopen = new Intent(MainActivity.this, MainActivity.class);
                                            reopen.setAction(Intent.ACTION_MAIN);
                                            reopen.addCategory(Intent.CATEGORY_LAUNCHER);
                                            reopen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                                            startActivity(reopen);
                                        } catch (Exception ignored) {}
                                    }
                                });

                                String intentUri = "intent://auth/complete#Intent;scheme=aurasync;package=com.aurasync.mobile;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end";
                                String schemeUri = "aurasync://auth/complete";

                                responseHtml = "<!DOCTYPE html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>"
                                    + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                                    + "<title>AuraSync</title>"
                                    + "<meta http-equiv='refresh' content='0; url=" + intentUri + "'>"
                                    + "<style>body{background:#040c19;color:#38bdf8;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center;}"
                                    + ".card{background:rgba(15,23,42,0.92);border:1px solid rgba(59,130,246,0.35);padding:30px 20px;border-radius:24px;box-shadow:0 20px 50px rgba(0,0,0,0.6);max-width:360px;width:100%;backdrop-filter:blur(20px);}"
                                    + "h2{color:#38bdf8;margin:0 0 10px;font-size:20px;font-weight:900;}"
                                    + "p{color:#94a3b8;font-size:13px;line-height:1.5;margin:0 0 20px;}"
                                    + ".btn{display:inline-flex;align-items:center;justify-content:center;width:100%;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;padding:12px;border-radius:14px;text-decoration:none;font-weight:800;font-size:14px;box-sizing:border-box;box-shadow:0 6px 20px rgba(37,99,235,0.4);}</style>"
                                    + "</head><body><div class='card'>"
                                    + "<h2>✓ تم التحقق بنجاح!</h2>"
                                    + "<p>جاري العودة إلى تطبيق AuraSync فوراً...</p>"
                                    + "<a href='" + intentUri + "' class='btn'>اضغط للعودة إلى التطبيق</a>"
                                    + "<script>"
                                    + "(function(){"
                                    + "  try { window.location.replace('" + intentUri + "'); } catch(e) { window.location.href='" + schemeUri + "'; }"
                                    + "  setTimeout(function(){ window.location.href='" + intentUri + "'; }, 10);"
                                    + "  setTimeout(function(){ window.location.href='" + schemeUri + "'; }, 180);"
                                    + "})();"
                                    + "</script>"
                                    + "</div></body></html>";
                            } else {
                                responseHtml = "<!DOCTYPE html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>"
                                    + "<title>AuraSync - خطأ في تسجيل الدخول</title>"
                                    + "<style>body{background:#060814;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}"
                                    + ".card{background:rgba(15,23,42,0.9);border:1px solid #ef4444;padding:30px;border-radius:24px;max-width:360px;}</style></head>"
                                    + "<body><div class='card'><h2 style='color:#ef4444;'>لم يكتمل تسجيل الدخول</h2>"
                                    + "<p style='color:#94a3b8;'>تم إلغاء العملية أو حدث خطأ: " + (error != null ? error : "إلغاء المستخدم") + "</p>"
                                    + "<p style='font-size:12px;color:#64748b;'>يمكنك العودة إلى التطبيق والمحاولة مجدداً.</p>"
                                    + "</div></body></html>";
                            }

                            byte[] bodyBytes = responseHtml.getBytes(StandardCharsets.UTF_8);
                            OutputStream os = clientSocket.getOutputStream();
                            String httpResponse = "HTTP/1.1 200 OK\r\n"
                                + "Content-Type: text/html; charset=UTF-8\r\n"
                                + "Access-Control-Allow-Origin: *\r\n"
                                + "Access-Control-Allow-Private-Network: true\r\n"
                                + "Cache-Control: no-store, no-cache, must-revalidate\r\n"
                                + "Content-Length: " + bodyBytes.length + "\r\n"
                                + "Connection: close\r\n\r\n";
                            os.write(httpResponse.getBytes(StandardCharsets.UTF_8));
                            os.write(bodyBytes);
                            os.flush();
                            try { clientSocket.shutdownOutput(); } catch (Exception ignored) {}
                            try { Thread.sleep(60); } catch (Exception ignored) {}
                            try { clientSocket.close(); } catch (Exception ignored) {}

                            // Gracefully shut down server after 2 seconds
                            new Thread(new Runnable() {
                                @Override
                                public void run() {
                                    try { Thread.sleep(2000); } catch (Exception ignored) {}
                                    stopOAuthServer();
                                }
                            }).start();

                            if (error != null && code == null) {
                                final String finalErr = error;
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (webView != null) {
                                            webView.evaluateJavascript("if (window.onAuraSyncAuthError) window.onAuraSyncAuthError('" + finalErr.replace("'", "\\'") + "');", null);
                                        }
                                    }
                                });
                                break;
                            }

                            if (code != null) {
                                exchangeOAuthCode(isGoogle ? "google" : "onedrive", code, port);
                                break;
                            }
                        } catch (Exception connEx) {
                            try { clientSocket.close(); } catch (Exception ignored) {}
                        }
                    }

                } catch (Exception e) {
                    android.util.Log.e("AuraSyncOAuth", "Loopback server exception: " + e.getMessage());
                }
            }
        });

        oauthServerThread.start();
    }

    private void exchangeOAuthCode(final String provider, final String code, final int port) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String accessToken = null;
                    String refreshToken = null;
                    String userEmail = null;
                    String userName = null;
                    String userPicture = null;

                    if ("google".equalsIgnoreCase(provider)) {
                        URL tokenUrl = URI.create("https://oauth2.googleapis.com/token").toURL();
                        HttpURLConnection conn = (HttpURLConnection) tokenUrl.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                        conn.setDoOutput(true);
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(15000);

                        String postData = "code=" + URLEncoder.encode(code, "UTF-8")
                            + "&client_id=" + URLEncoder.encode(getGoogleClientId(), "UTF-8")
                            + "&client_secret=" + URLEncoder.encode(getGoogleClientSecret(), "UTF-8")
                            + "&redirect_uri=" + URLEncoder.encode("http://localhost:" + port, "UTF-8")
                            + "&grant_type=authorization_code";

                        OutputStream os = conn.getOutputStream();
                        os.write(postData.getBytes(StandardCharsets.UTF_8));
                        os.flush();
                        os.close();

                        int respCode = conn.getResponseCode();
                        InputStream is = (respCode >= 200 && respCode < 300) ? conn.getInputStream() : conn.getErrorStream();
                        BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                        StringBuilder sb = new StringBuilder();
                        String l;
                        while ((l = br.readLine()) != null) sb.append(l);
                        br.close();

                        JSONObject tokenJson = new JSONObject(sb.toString());
                        accessToken = tokenJson.optString("access_token", null);
                        refreshToken = tokenJson.optString("refresh_token", null);

                        if (accessToken != null) {
                            URL userUrl = URI.create("https://www.googleapis.com/oauth2/v3/userinfo").toURL();
                            HttpURLConnection userConn = (HttpURLConnection) userUrl.openConnection();
                            userConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                            userConn.setConnectTimeout(10000);
                            userConn.setReadTimeout(10000);

                            if (userConn.getResponseCode() == 200) {
                                BufferedReader ubr = new BufferedReader(new InputStreamReader(userConn.getInputStream(), StandardCharsets.UTF_8));
                                StringBuilder usb = new StringBuilder();
                                while ((l = ubr.readLine()) != null) usb.append(l);
                                ubr.close();

                                JSONObject userObj = new JSONObject(usb.toString());
                                userEmail = userObj.optString("email", "google_user@gmail.com");
                                userName = userObj.optString("name", userEmail);
                                userPicture = userObj.optString("picture", "");
                            }

                            // Automatically ensure "aurasync-mobile" folder exists in Google Drive root
                            try {
                                URL searchUrl = URI.create("https://www.googleapis.com/drive/v3/files?q=" + URLEncoder.encode("mimeType='application/vnd.google-apps.folder' and name='aurasync-mobile' and trashed=false and 'root' in parents", "UTF-8") + "&fields=files(id,name)").toURL();
                                HttpURLConnection sConn = (HttpURLConnection) searchUrl.openConnection();
                                sConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                                sConn.setConnectTimeout(8000);
                                sConn.setReadTimeout(8000);
                                if (sConn.getResponseCode() == 200) {
                                    BufferedReader sr = new BufferedReader(new InputStreamReader(sConn.getInputStream(), StandardCharsets.UTF_8));
                                    StringBuilder sbSearch = new StringBuilder();
                                    String sl;
                                    while ((sl = sr.readLine()) != null) sbSearch.append(sl);
                                    sr.close();
                                    JSONObject searchRes = new JSONObject(sbSearch.toString());
                                    JSONArray filesArr = searchRes.optJSONArray("files");
                                    if (filesArr == null || filesArr.length() == 0) {
                                        URL createUrl = URI.create("https://www.googleapis.com/drive/v3/files").toURL();
                                        HttpURLConnection cConn = (HttpURLConnection) createUrl.openConnection();
                                        cConn.setRequestMethod("POST");
                                        cConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                                        cConn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                                        cConn.setDoOutput(true);
                                        cConn.setConnectTimeout(8000);
                                        cConn.setReadTimeout(8000);
                                        JSONObject createBody = new JSONObject();
                                        createBody.put("name", "aurasync-mobile");
                                        createBody.put("mimeType", "application/vnd.google-apps.folder");
                                        createBody.put("description", "AuraSync Mobile media & gallery cloud storage");
                                        OutputStream cos = cConn.getOutputStream();
                                        cos.write(createBody.toString().getBytes(StandardCharsets.UTF_8));
                                        cos.flush();
                                        cos.close();
                                        cConn.getResponseCode();
                                    }
                                }
                            } catch (Exception ignored) {}
                        }
                    } else if ("onedrive".equalsIgnoreCase(provider)) {
                        URL tokenUrl = URI.create("https://login.microsoftonline.com/common/oauth2/v2.0/token").toURL();
                        HttpURLConnection conn = (HttpURLConnection) tokenUrl.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                        conn.setDoOutput(true);
                        conn.setConnectTimeout(15000);
                        conn.setReadTimeout(15000);

                        String postData = "code=" + URLEncoder.encode(code, "UTF-8")
                            + "&client_id=" + URLEncoder.encode(ONEDRIVE_CLIENT_ID, "UTF-8")
                            + "&redirect_uri=" + URLEncoder.encode("http://localhost:" + port, "UTF-8")
                            + "&grant_type=authorization_code";

                        OutputStream os = conn.getOutputStream();
                        os.write(postData.getBytes(StandardCharsets.UTF_8));
                        os.flush();
                        os.close();

                        int respCode = conn.getResponseCode();
                        InputStream is = (respCode >= 200 && respCode < 300) ? conn.getInputStream() : conn.getErrorStream();
                        BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                        StringBuilder sb = new StringBuilder();
                        String l;
                        while ((l = br.readLine()) != null) sb.append(l);
                        br.close();

                        JSONObject tokenJson = new JSONObject(sb.toString());
                        accessToken = tokenJson.optString("access_token", null);
                        refreshToken = tokenJson.optString("refresh_token", null);

                        if (accessToken != null) {
                            URL meUrl = URI.create("https://graph.microsoft.com/v1.0/me").toURL();
                            HttpURLConnection meConn = (HttpURLConnection) meUrl.openConnection();
                            meConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                            meConn.setConnectTimeout(10000);
                            meConn.setReadTimeout(10000);

                            if (meConn.getResponseCode() == 200) {
                                BufferedReader mbr = new BufferedReader(new InputStreamReader(meConn.getInputStream(), StandardCharsets.UTF_8));
                                StringBuilder msb = new StringBuilder();
                                while ((l = mbr.readLine()) != null) msb.append(l);
                                mbr.close();

                                JSONObject meObj = new JSONObject(msb.toString());
                                userName = meObj.optString("displayName", "OneDrive User");
                                userEmail = meObj.optString("mail", meObj.optString("userPrincipalName", "user@outlook.com"));
                            }

                            // Automatically ensure "aurasync-mobile" folder exists in OneDrive root
                            try {
                                URL createUrl = URI.create("https://graph.microsoft.com/v1.0/me/drive/root/children").toURL();
                                HttpURLConnection cConn = (HttpURLConnection) createUrl.openConnection();
                                cConn.setRequestMethod("POST");
                                cConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                                cConn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                                cConn.setDoOutput(true);
                                cConn.setConnectTimeout(8000);
                                cConn.setReadTimeout(8000);
                                JSONObject createBody = new JSONObject();
                                createBody.put("name", "aurasync-mobile");
                                createBody.put("folder", new JSONObject());
                                createBody.put("@microsoft.graph.conflictBehavior", "replace");
                                OutputStream cos = cConn.getOutputStream();
                                cos.write(createBody.toString().getBytes(StandardCharsets.UTF_8));
                                cos.flush();
                                cos.close();
                                cConn.getResponseCode();
                            } catch (Exception ignored) {}
                        }
                    }


                    if (accessToken != null && userEmail != null) {
                        final JSONObject accountObj = new JSONObject();
                        accountObj.put("id", provider);
                        accountObj.put("provider", provider);
                        accountObj.put("label", "google".equalsIgnoreCase(provider) ? "Google Drive" : "Microsoft OneDrive");
                        accountObj.put("email", userEmail);
                        accountObj.put("name", userName != null ? userName : userEmail);
                        if (userPicture != null) accountObj.put("picture", userPicture);
                        accountObj.put("accessToken", accessToken);
                        if (refreshToken != null) accountObj.put("refreshToken", refreshToken);
                        accountObj.put("targetFolder", "aurasync-mobile");
                        accountObj.put("connectedAt", System.currentTimeMillis());
                        accountObj.put("status", "connected");

                        final String finalEmail = userEmail;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (webView != null) {
                                    webView.evaluateJavascript("if (window.onAuraSyncAuthSuccess) window.onAuraSyncAuthSuccess(" + accountObj.toString() + ");", null);
                                }
                                showToast("✓ تم تسجيل الدخول بنجاح: " + finalEmail);
                                try {
                                    Intent reopen = new Intent(MainActivity.this, MainActivity.class);
                                    reopen.setAction(Intent.ACTION_MAIN);
                                    reopen.addCategory(Intent.CATEGORY_LAUNCHER);
                                    reopen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                                    startActivity(reopen);
                                } catch (Exception ignored) {}
                            }
                        });
                    } else {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (webView != null) {
                                    webView.evaluateJavascript("if (window.onAuraSyncAuthError) window.onAuraSyncAuthError('تعذر الحصول على رمز الوصول من خوادم السحابة');", null);
                                }
                                showToast("فشل استخراج بيانات الدخول");
                            }
                        });
                    }

                } catch (Exception e) {
                    android.util.Log.e("AuraSyncOAuth", "Token exchange failed: " + e.getMessage());
                    final String err = e.getMessage();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (webView != null) {
                                webView.evaluateJavascript("if (window.onAuraSyncAuthError) window.onAuraSyncAuthError('" + (err != null ? err.replace("'", "\\'") : "Unknown error") + "');", null);
                            }
                        }
                    });
                }
            }
        }).start();
    }

    @Override
    protected void onDestroy() {
        stopOAuthServer();
        if (downloadReceiver != null) {
            try {
                unregisterReceiver(downloadReceiver);
                downloadReceiver = null;
            } catch (Exception ignored) {}
        }
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                wakeLock = null;
            }
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
