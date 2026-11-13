package com.polka.reader;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
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
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * «Полка» — оболочка читалки.
 * Интерфейс и движок чтения живут в assets/web (HTML/JS), а здесь —
 * всё, что требует Android: поиск книг в памяти телефона, выбор файлов,
 * отдача файлов в WebView, кнопки громкости, полноэкранный режим.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/web/index.html";
    private static final int REQ_PICK_BOOKS = 101;
    private static final int REQ_PICK_FONT = 102;
    private static final int REQ_PERMISSION = 103;

    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    private String pendingPickCallback = null;
    private String pendingOpenJson = null;
    private volatile boolean volumeKeys = false;
    private boolean fullscreen = false;
    private boolean lightBars = false;

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#2A1B12"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new Bridge(), "PolkaNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return intercept(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        setContentView(web);
        applySystemUi();
        handleIntent(getIntent());
        web.loadUrl(START_URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        emit("resume", "");
    }

    @Override
    protected void onPause() {
        emit("pause", "");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemUi();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSION) emit("storage", hasStorageAccess() ? "granted" : "denied");
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            finish();
            return;
        }
        web.evaluateJavascript("(window.__polkaBack ? window.__polkaBack() : false)", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (volumeKeys && (code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_UP)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                emit("key", code == KeyEvent.KEYCODE_VOLUME_DOWN ? "next" : "prev");
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    // ------------------------------------------------------------------ files for WebView

    private WebResourceResponse intercept(Uri u) {
        if (u == null || !HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        if (path == null) return error(404, "Not Found");
        try {
            if (path.startsWith("/web/")) {
                String asset = path.substring(1);
                InputStream in = getAssets().open(asset);
                return ok(mimeFor(asset), in);
            }
            if (path.equals("/file")) {
                String p = u.getQueryParameter("p");
                if (p == null) return error(400, "Bad Request");
                File f = new File(p);
                if (!f.isFile()) return error(404, "Not Found");
                if (!allowedFile(f)) return error(403, "Forbidden");
                return ok(mimeFor(f.getName()), new FileInputStream(f));
            }
        } catch (IOException e) {
            return error(404, "Not Found");
        }
        return error(404, "Not Found");
    }

    private WebResourceResponse ok(String mime, InputStream in) {
        String enc = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null;
        WebResourceResponse r = new WebResourceResponse(mime, enc, in);
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        h.put("Access-Control-Allow-Origin", "*");
        r.setResponseHeaders(h);
        return r;
    }

    private WebResourceResponse error(int code, String reason) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", code, reason, h,
                new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeFor(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".ttf")) return "font/ttf";
        if (n.endsWith(".otf")) return "font/otf";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".epub")) return "application/epub+zip";
        if (n.endsWith(".fb2")) return "application/x-fictionbook+xml";
        if (n.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    private boolean isInside(File f, File dir) {
        try {
            String fp = f.getCanonicalPath();
            String dp = dir.getCanonicalPath();
            return fp.startsWith(dp + File.separator);
        } catch (IOException e) {
            return false;
        }
    }

    private static boolean isBookName(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        return n.endsWith(".epub") || n.endsWith(".fb2") || n.endsWith(".fb2.zip");
    }

    private boolean allowedFile(File f) {
        if (isInside(f, getFilesDir())) return true;
        String n = f.getName().toLowerCase(Locale.ROOT);
        boolean ok = isBookName(n) || n.endsWith(".zip") || n.endsWith(".ttf") || n.endsWith(".otf");
        return ok && hasStorageAccess();
    }

    // ------------------------------------------------------------------ storage access & scan

    private boolean hasStorageAccess() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestStorageAccess() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } catch (Exception e) {
                try {
                    startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                } catch (Exception ignored) {
                }
            }
        } else {
            requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, REQ_PERMISSION);
        }
    }

    private void scanStorage(final String cb) {
        new Thread(() -> {
            JSONArray out = new JSONArray();
            Set<String> seen = new HashSet<>();
            List<File> roots = new ArrayList<>();
            roots.add(Environment.getExternalStorageDirectory());
            File[] dirs = getExternalFilesDirs(null);
            if (dirs != null) {
                for (File d : dirs) {
                    if (d == null) continue;
                    String p = d.getAbsolutePath();
                    int i = p.indexOf("/Android/data/");
                    if (i > 0) {
                        File root = new File(p.substring(0, i));
                        if (!roots.contains(root)) roots.add(root);
                    }
                }
            }
            for (File r : roots) walk(r, 0, out, seen);
            callback(cb, out.toString());
        }).start();
    }

    private void walk(File dir, int depth, JSONArray out, Set<String> seen) {
        if (dir == null || depth > 14) return;
        File[] list = dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            String name = f.getName();
            if (name.startsWith(".")) continue;
            if (f.isDirectory()) {
                if (depth == 0 && name.equals("Android")) {
                    walk(new File(f, "media"), depth + 2, out, seen);
                    continue;
                }
                walk(f, depth + 1, out, seen);
            } else if (isBookName(name)) {
                try {
                    String cp = f.getCanonicalPath();
                    if (!seen.add(cp)) continue;
                    out.put(fileInfo(f));
                } catch (Exception ignored) {
                }
            }
        }
    }

    private static JSONObject fileInfo(File f) {
        try {
            JSONObject o = new JSONObject();
            o.put("path", f.getAbsolutePath());
            o.put("name", f.getName());
            o.put("size", f.length());
            o.put("mtime", f.lastModified());
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ picking files

    private void pick(final String cb, final int request) {
        main.post(() -> {
            if (pendingPickCallback != null) callback(pendingPickCallback, "[]");
            pendingPickCallback = cb;
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, request == REQ_PICK_BOOKS);
            try {
                startActivityForResult(i, request);
            } catch (Exception e) {
                pendingPickCallback = null;
                callback(cb, "[]");
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PICK_BOOKS && requestCode != REQ_PICK_FONT) return;
        final String cb = pendingPickCallback;
        pendingPickCallback = null;
        if (cb == null) return;
        final List<Uri> uris = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int k = 0; k < clip.getItemCount(); k++) {
                    Uri u = clip.getItemAt(k).getUri();
                    if (u != null) uris.add(u);
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }
        final String sub = requestCode == REQ_PICK_FONT ? "fonts" : "books";
        new Thread(() -> {
            JSONArray arr = new JSONArray();
            for (Uri u : uris) {
                JSONObject o = copyIn(u, sub);
                if (o != null) arr.put(o);
            }
            callback(cb, arr.toString());
        }).start();
    }

    private String displayName(Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) name = c.getString(idx);
                }
            } catch (Exception ignored) {
            }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name != null) {
            int slash = name.lastIndexOf('/');
            if (slash >= 0) name = name.substring(slash + 1);
        }
        return name;
    }

    /** Копирует файл из проводника/Telegram в личную папку приложения. */
    private JSONObject copyIn(Uri uri, String sub) {
        String name = displayName(uri);
        if (name == null || name.trim().isEmpty()) name = "book-" + System.currentTimeMillis();
        name = name.replaceAll("[\\\\/:*?\"<>|\\n\\r]", "_");
        File dir = new File(getFilesDir(), sub);
        if (!dir.exists() && !dir.mkdirs()) return null;
        File tmp = new File(dir, ".incoming-" + System.nanoTime());
        long size = 0;
        try (InputStream in = getContentResolver().openInputStream(uri);
             OutputStream os = new FileOutputStream(tmp)) {
            if (in == null) return null;
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                size += n;
            }
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return null;
        }
        File out = new File(dir, name);
        if (out.exists() && out.length() == size) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return fileInfo(out);
        }
        int k = 2;
        String base = name, ext = "";
        int dot = name.indexOf('.');
        if (dot > 0) {
            base = name.substring(0, dot);
            ext = name.substring(dot);
        }
        while (out.exists()) out = new File(dir, base + " (" + (k++) + ")" + ext);
        if (!tmp.renameTo(out)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return null;
        }
        return fileInfo(out);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null) return;
        intent.setAction(Intent.ACTION_MAIN); // чтобы не открыть повторно при пересоздании
        final Uri u = uri;
        new Thread(() -> {
            JSONObject o = copyIn(u, "books");
            if (o == null) {
                main.post(() -> Toast.makeText(this, "Не удалось открыть файл", Toast.LENGTH_LONG).show());
                return;
            }
            synchronized (MainActivity.this) {
                pendingOpenJson = o.toString();
            }
            emit("open", "");
        }).start();
    }

    // ------------------------------------------------------------------ system bars

    private void applySystemUi() {
        int flags = 0;
        if (lightBars) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        if (fullscreen) {
            flags |= View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        }
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    // ------------------------------------------------------------------ JS plumbing

    private void runJs(final String js) {
        main.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    private void emit(String name, String data) {
        runJs("window.__polkaEvent && window.__polkaEvent(" + JSONObject.quote(name) + "," +
                JSONObject.quote(data == null ? "" : data) + ")");
    }

    private void callback(String id, String json) {
        runJs("window.__polkaCb && window.__polkaCb(" + JSONObject.quote(id) + "," +
                JSONObject.quote(json == null ? "" : json) + ")");
    }

    /** Методы, доступные из JS как window.PolkaNative.* */
    private class Bridge {
        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public int sdk() {
            return Build.VERSION.SDK_INT;
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean hasStorageAccess() {
            return MainActivity.this.hasStorageAccess();
        }

        @JavascriptInterface
        public void requestStorageAccess() {
            main.post(MainActivity.this::requestStorageAccess);
        }

        @JavascriptInterface
        public void scan(String cb) {
            scanStorage(cb);
        }

        @JavascriptInterface
        public void pickBooks(String cb) {
            pick(cb, REQ_PICK_BOOKS);
        }

        @JavascriptInterface
        public void pickFont(String cb) {
            pick(cb, REQ_PICK_FONT);
        }

        @JavascriptInterface
        public String takePendingOpen() {
            synchronized (MainActivity.this) {
                String s = pendingOpenJson;
                pendingOpenJson = null;
                return s == null ? "" : s;
            }
        }

        @JavascriptInterface
        public boolean fileExists(String path) {
            File f = new File(path);
            return f.isFile() && allowedFile(f);
        }

        @JavascriptInterface
        public boolean deleteOwnFile(String path) {
            File f = new File(path);
            if (!isInside(f, getFilesDir())) return false;
            return f.delete();
        }

        @JavascriptInterface
        public void setVolumeKeys(boolean on) {
            volumeKeys = on;
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean on) {
            main.post(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void setBrightness(final float value) {
            main.post(() -> {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = value < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                        : Math.max(0.01f, Math.min(1f, value));
                getWindow().setAttributes(lp);
            });
        }

        @JavascriptInterface
        public void setSystemBars(final String color, final boolean light, final boolean full) {
            main.post(() -> {
                try {
                    int c = Color.parseColor(color);
                    Window w = getWindow();
                    w.setStatusBarColor(c);
                    w.setNavigationBarColor(c);
                } catch (Exception ignored) {
                }
                lightBars = light;
                fullscreen = full;
                applySystemUi();
            });
        }

        @JavascriptInterface
        public void toast(final String text) {
            main.post(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show());
        }
    }
}
