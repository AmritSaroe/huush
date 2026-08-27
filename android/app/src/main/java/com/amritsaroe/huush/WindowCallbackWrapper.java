package com.amritsaroe.huush;

import android.os.Build;
import android.view.ActionMode;
import android.view.KeyEvent;
import android.view.KeyboardShortcutGroup;
import android.view.Menu;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;

import java.util.List;
import java.util.Objects;

/**
 * Forwards every Window.Callback method to a wrapped delegate unchanged.
 * Subclasses can override only the callback they need to intercept.
 */
class WindowCallbackWrapper implements Window.Callback {
    private final Window.Callback delegate;

    WindowCallbackWrapper(Window.Callback delegate) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        return delegate.dispatchGenericMotionEvent(event);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        return delegate.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchKeyShortcutEvent(KeyEvent event) {
        return delegate.dispatchKeyShortcutEvent(event);
    }

    @Override
    public boolean dispatchPopulateAccessibilityEvent(AccessibilityEvent event) {
        return delegate.dispatchPopulateAccessibilityEvent(event);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        return delegate.dispatchTouchEvent(event);
    }

    @Override
    public boolean dispatchTrackballEvent(MotionEvent event) {
        return delegate.dispatchTrackballEvent(event);
    }

    @Override
    public void onActionModeFinished(ActionMode mode) {
        delegate.onActionModeFinished(mode);
    }

    @Override
    public void onActionModeStarted(ActionMode mode) {
        delegate.onActionModeStarted(mode);
    }

    @Override
    public void onAttachedToWindow() {
        delegate.onAttachedToWindow();
    }

    @Override
    public void onContentChanged() {
        delegate.onContentChanged();
    }

    @Override
    public boolean onCreatePanelMenu(int featureId, Menu menu) {
        return delegate.onCreatePanelMenu(featureId, menu);
    }

    @Override
    public View onCreatePanelView(int featureId) {
        return delegate.onCreatePanelView(featureId);
    }

    @Override
    public void onDetachedFromWindow() {
        delegate.onDetachedFromWindow();
    }

    @Override
    public boolean onMenuItemSelected(int featureId, MenuItem item) {
        return delegate.onMenuItemSelected(featureId, item);
    }

    @Override
    public boolean onMenuOpened(int featureId, Menu menu) {
        return delegate.onMenuOpened(featureId, menu);
    }

    @Override
    public void onPanelClosed(int featureId, Menu menu) {
        delegate.onPanelClosed(featureId, menu);
    }

    @Override
    public void onPointerCaptureChanged(boolean hasCapture) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            delegate.onPointerCaptureChanged(hasCapture);
        }
    }

    @Override
    public boolean onPreparePanel(int featureId, View view, Menu menu) {
        return delegate.onPreparePanel(featureId, view, menu);
    }

    @Override
    public void onProvideKeyboardShortcuts(List<KeyboardShortcutGroup> data, Menu menu, int deviceId) {
        delegate.onProvideKeyboardShortcuts(data, menu, deviceId);
    }

    @Override
    public boolean onSearchRequested() {
        return delegate.onSearchRequested();
    }

    @Override
    public boolean onSearchRequested(android.view.SearchEvent searchEvent) {
        return delegate.onSearchRequested(searchEvent);
    }

    @Override
    public void onWindowAttributesChanged(WindowManager.LayoutParams attrs) {
        delegate.onWindowAttributesChanged(attrs);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        delegate.onWindowFocusChanged(hasFocus);
    }

    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback) {
        return delegate.onWindowStartingActionMode(callback);
    }

    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback, int type) {
        return delegate.onWindowStartingActionMode(callback, type);
    }
}
