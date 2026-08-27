package com.amritsaroe.huush;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.ActionMode;
import android.view.Gravity;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.TextView;

import androidx.appcompat.view.menu.MenuBuilder;
import androidx.core.graphics.drawable.DrawableCompat;

/**
 * A small app-owned replacement for Android's framework FloatingToolbar.
 *
 * AppCompat MenuBuilder is the only menu implementation available to this
 * Java/View module that can receive the WebView callback's dynamic menu. It is
 * used only as a local adapter; no Android framework-private class is used.
 * The WebView still owns selection and supplies the ActionMode callback/menu;
 * this class only owns the visual container and forwards menu actions.
 */
@SuppressLint("RestrictedApi")
final class HuushFloatingActionMode extends ActionMode {
    private static final int MAX_SCREEN_WIDTH_FRACTION = 92;
    private static final int POPUP_GAP_DP = 8;
    private static final int TOOLBAR_PADDING_DP = 4;
    private static final int ITEM_HORIZONTAL_PADDING_DP = 12;
    private static final int ITEM_MIN_HEIGHT_DP = 48;
    private static final int ITEM_TEXT_SIZE_SP = 14;

    private final Context context;
    private final View anchor;
    private final ActionMode.Callback callback;
    private final ActionMode.Callback2 callback2;
    private final MenuBuilder menu;
    private final PopupWindow popupWindow;
    private final LinearLayout toolbar;
    private final HorizontalScrollView scrollContainer;
    private final int surfaceColor;
    private final int contentColor;
    private final int cornerRadiusPx;
    private boolean finished;
    private boolean suppressPopupDismiss;
    private View customView;
    private CharSequence title;
    private CharSequence subtitle;
    private Rect contentRect = new Rect();
    private final android.view.ViewTreeObserver.OnScrollChangedListener scrollListener = this::onAnchorScrolled;

    HuushFloatingActionMode(
            Context context,
            View anchor,
            ActionMode.Callback callback,
            int surfaceColor,
            int contentColor) {
        this.context = context;
        this.anchor = anchor;
        this.callback = callback;
        this.callback2 = callback instanceof ActionMode.Callback2
                ? (ActionMode.Callback2) callback
                : null;
        this.surfaceColor = surfaceColor;
        this.contentColor = contentColor;
        this.cornerRadiusPx = dp(26);
        this.menu = new MenuBuilder(context);

        toolbar = new LinearLayout(context);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(TOOLBAR_PADDING_DP), 0, dp(TOOLBAR_PADDING_DP), 0);
        toolbar.setBackground(createToolbarBackground());
        toolbar.setElevation(dp(3));

        scrollContainer = new HorizontalScrollView(context);
        scrollContainer.setHorizontalScrollBarEnabled(false);
        scrollContainer.setFillViewport(false);
        scrollContainer.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scrollContainer.addView(toolbar, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        popupWindow = new PopupWindow(
                scrollContainer,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                false);
        popupWindow.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        popupWindow.setOutsideTouchable(true);
        popupWindow.setFocusable(false);
        popupWindow.setTouchable(true);
        popupWindow.setClippingEnabled(true);
        popupWindow.setInputMethodMode(PopupWindow.INPUT_METHOD_NOT_NEEDED);
        popupWindow.setElevation(dp(3));
        popupWindow.setOnDismissListener(() -> {
            if (!finished && !suppressPopupDismiss) finish();
        });
    }

    @Override
    public void finish() {
        if (finished) return;
        finished = true;
        anchor.getViewTreeObserver().removeOnScrollChangedListener(scrollListener);
        dismissPopupSilently();
        callback.onDestroyActionMode(this);
    }

    @Override
    public View getCustomView() {
        return customView;
    }

    @Override
    public Menu getMenu() {
        return menu;
    }

    @Override
    public MenuInflater getMenuInflater() {
        return new MenuInflater(context);
    }

    @Override
    public CharSequence getSubtitle() {
        return subtitle;
    }

    @Override
    public CharSequence getTitle() {
        return title;
    }

    @Override
    public int getType() {
        return TYPE_FLOATING;
    }

    @Override
    public void invalidate() {
        if (finished) return;
        callback.onPrepareActionMode(this, menu);
        rebuildToolbar();
        invalidateContentRect();
    }

    @Override
    public void invalidateContentRect() {
        if (finished) return;
        contentRect = getContentRect();
        if (popupWindow.isShowing()) positionPopup();
    }

    @Override
    public boolean isTitleOptional() {
        return true;
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        if (!hasWindowFocus) dismissPopupSilently();
        else if (!finished) showPopup();
    }

    @Override
    public void setCustomView(View view) {
        customView = view;
        rebuildToolbar();
        if (popupWindow.isShowing()) positionPopup();
    }

    @Override
    public void setSubtitle(int resId) {
        setSubtitle(context.getText(resId));
    }

    @Override
    public void setSubtitle(CharSequence subtitle) {
        this.subtitle = subtitle;
    }

    @Override
    public void setTitle(int resId) {
        setTitle(context.getText(resId));
    }

    @Override
    public void setTitle(CharSequence title) {
        this.title = title;
    }

    @Override
    public void setTitleOptionalHint(boolean titleOptional) {
        // Floating selection actions do not display an action-mode title.
    }

    @Override
    public void setType(int type) {
        // This replacement is created only for TYPE_FLOATING action modes.
    }

    boolean start() {
        if (finished || !callback.onCreateActionMode(this, menu)) return false;
        callback.onPrepareActionMode(this, menu);
        rebuildToolbar();
        contentRect = getContentRect();
        showPopup();
        anchor.getViewTreeObserver().addOnScrollChangedListener(scrollListener);
        return !finished;
    }

    private void onAnchorScrolled() {
        if (!finished) invalidateContentRect();
    }

    private void rebuildToolbar() {
        toolbar.removeAllViews();
        if (customView != null) {
            toolbar.addView(customView, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            return;
        }

        for (int index = 0; index < menu.size(); index++) {
            MenuItem item = menu.getItem(index);
            if (!item.isVisible()) continue;
            TextView action = createActionView(item);
            toolbar.addView(action, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    dp(ITEM_MIN_HEIGHT_DP)));
        }
    }

    private TextView createActionView(MenuItem item) {
        TextView action = new TextView(context);
        action.setGravity(Gravity.CENTER);
        action.setMinHeight(dp(ITEM_MIN_HEIGHT_DP));
        action.setMinWidth(dp(48));
        action.setPadding(dp(ITEM_HORIZONTAL_PADDING_DP), 0, dp(ITEM_HORIZONTAL_PADDING_DP), 0);
        action.setText(item.getTitle());
        action.setTextColor(contentColor);
        action.setTextSize(TypedValue.COMPLEX_UNIT_SP, ITEM_TEXT_SIZE_SP);
        action.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        action.setSingleLine(true);
        action.setEnabled(item.isEnabled());
        action.setContentDescription(item.getTitle());
        Drawable icon = item.getIcon();
        if (icon != null) {
            Drawable tintedIcon = DrawableCompat.wrap(icon.mutate());
            DrawableCompat.setTint(tintedIcon, contentColor);
            int iconSize = dp(18);
            tintedIcon.setBounds(0, 0, iconSize, iconSize);
            action.setCompoundDrawables(tintedIcon, null, null, null);
            action.setCompoundDrawablePadding(dp(6));
        }
        action.setOnClickListener(view -> {
            if (!finished && item.isEnabled() && callback.onActionItemClicked(this, item)) finish();
        });
        return action;
    }

    private void showPopup() {
        if (finished || popupWindow.isShowing()) return;
        toolbar.measure(
                View.MeasureSpec.makeMeasureSpec(dp(1000), View.MeasureSpec.AT_MOST),
                View.MeasureSpec.makeMeasureSpec(dp(ITEM_MIN_HEIGHT_DP), View.MeasureSpec.AT_MOST));
        int width = Math.min(toolbar.getMeasuredWidth(), maxPopupWidth());
        int height = Math.max(toolbar.getMeasuredHeight(), dp(ITEM_MIN_HEIGHT_DP));
        popupWindow.setWidth(width);
        popupWindow.setHeight(height);
        popupWindow.showAtLocation(anchor, Gravity.TOP | Gravity.START, 0, 0);
        positionPopup();
    }

    private void positionPopup() {
        if (finished || !popupWindow.isShowing()) return;
        int[] anchorLocation = new int[2];
        anchor.getLocationOnScreen(anchorLocation);
        Rect screenRect = new Rect(contentRect);
        screenRect.offset(anchorLocation[0], anchorLocation[1]);

        int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
        int screenHeight = context.getResources().getDisplayMetrics().heightPixels;
        int popupWidth = popupWindow.getWidth();
        int popupHeight = popupWindow.getHeight();
        int centerX = screenRect.centerX();
        int x = Math.max(dp(8), Math.min(centerX - popupWidth / 2, screenWidth - popupWidth - dp(8)));
        int yBelow = screenRect.bottom + dp(POPUP_GAP_DP);
        int yAbove = screenRect.top - popupHeight - dp(POPUP_GAP_DP);
        int y = yBelow + popupHeight <= screenHeight - dp(8) ? yBelow : Math.max(dp(8), yAbove);
        popupWindow.update(x, y, popupWidth, popupHeight);
    }

    private Rect getContentRect() {
        Rect result = new Rect();
        if (callback2 != null) {
            callback2.onGetContentRect(this, anchor, result);
        } else {
            result.set(0, 0, anchor.getWidth(), anchor.getHeight());
        }
        if (result.isEmpty()) result.set(0, 0, anchor.getWidth(), anchor.getHeight());
        return result;
    }

    private GradientDrawable createToolbarBackground() {
        GradientDrawable background = new GradientDrawable();
        background.setColor(surfaceColor);
        background.setCornerRadius(cornerRadiusPx);
        background.setStroke(dp(1), withAlpha(contentColor, 0x32));
        return background;
    }

    private void dismissPopupSilently() {
        if (!popupWindow.isShowing()) return;
        suppressPopupDismiss = true;
        popupWindow.dismiss();
        suppressPopupDismiss = false;
    }

    private int maxPopupWidth() {
        int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
        return Math.max(dp(160), screenWidth * MAX_SCREEN_WIDTH_FRACTION / 100);
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                context.getResources().getDisplayMetrics()));
    }

    private int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }
}
