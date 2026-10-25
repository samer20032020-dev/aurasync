package com.aurasync.mobile;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/**
 * AuraSyncFileProvider
 * Pure native Android ContentProvider for secure, instant in-app APK installation.
 * Provides read-only streaming access to downloaded update packages without third-party dependencies.
 */
public class AuraSyncFileProvider extends ContentProvider {
    public static final String AUTHORITY = "com.aurasync.mobile.fileprovider";

    @Override
    public boolean onCreate() {
        return true;
    }

    private File getFileForUri(Uri uri) {
        if (uri == null || getContext() == null) return null;
        String fileName = uri.getLastPathSegment();
        if (fileName == null || fileName.isEmpty()) return null;

        // 1. Internal Cache Directory (primary)
        File file = new File(getContext().getCacheDir(), fileName);
        if (file.exists()) return file;

        // 2. External Files Directory
        File extFiles = getContext().getExternalFilesDir(null);
        if (extFiles != null) {
            file = new File(extFiles, fileName);
            if (file.exists()) return file;
        }

        // 3. External Cache Directory
        File extCache = getContext().getExternalCacheDir();
        if (extCache != null) {
            file = new File(extCache, fileName);
            if (file.exists()) return file;
        }

        // 4. Internal Files Directory
        file = new File(getContext().getFilesDir(), fileName);
        if (file.exists()) return file;

        return null;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = getFileForUri(uri);
        if (file != null && file.exists()) {
            return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
        }
        throw new FileNotFoundException("AuraSync update APK not found for URI: " + uri);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        if (projection == null) {
            projection = new String[]{ OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        }
        File file = getFileForUri(uri);
        MatrixCursor cursor = new MatrixCursor(projection, 1);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String col : projection) {
            if (OpenableColumns.DISPLAY_NAME.equals(col)) {
                row.add(file != null ? file.getName() : "AuraSync-update.apk");
            } else if (OpenableColumns.SIZE.equals(col)) {
                row.add(file != null ? file.length() : 0L);
            } else {
                row.add(null);
            }
        }
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
