package com.frogworkouttracker.app

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.max

class RestOverlayManager(
  private val context: Context,
  private val onDismissed: () -> Unit,
  private val onPressed: (String?) -> Unit,
) {
  companion object {
    private const val TAG = "RestOverlayManager"
    private const val SURFACE_COLOR = "#101826"
    private const val BORDER_COLOR = "#1B2A3D"
    private const val LABEL_COLOR = "#B4C0D4"
    private const val TEXT_COLOR = "#F5F8FF"
    private const val PRIMARY_COLOR = "#2F7DFF"
    private const val MAGENTA_COLOR = "#D14FFF"
  }

  private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val mainHandler = Handler(Looper.getMainLooper())

  private var overlayView: LinearLayout? = null
  private var valueView: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var workoutId: String? = null
  private var endsAtMs: Long = 0L
  private var currentX = dp(20)
  private var currentY = dp(180)
  private var updateRunnable: Runnable? = null
  private var overlayAttached = false

  fun canDrawOverlays(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return true
    }

    return Settings.canDrawOverlays(context)
  }

  fun show(workoutId: String, endsAtMs: Long) {
    this.workoutId = workoutId
    this.endsAtMs = endsAtMs
    runOnMainThread {
      if (!canDrawOverlays()) {
        return@runOnMainThread
      }

      showInternal()
    }
  }

  fun update(workoutId: String, endsAtMs: Long) {
    this.workoutId = workoutId
    this.endsAtMs = endsAtMs
    runOnMainThread {
      if (!canDrawOverlays()) {
        return@runOnMainThread
      }

      if (!isOverlayAttached()) {
        showInternal()
        return@runOnMainThread
      }

      updateCountdownText()
      startTicker()
    }
  }

  fun hide() {
    runOnMainThread {
      hideInternal()
    }
  }

  fun destroy() {
    runOnMainThread {
      hideInternal()
      resetOverlayViewState()
    }
  }

  private fun ensureOverlayView(): LinearLayout {
    overlayView?.let { return it }

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(10), dp(12), dp(10))
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(20).toFloat()
        setColor(Color.parseColor(SURFACE_COLOR))
        setStroke(dp(1), Color.parseColor(BORDER_COLOR))
      }
      elevation = dp(10).toFloat()
    }

    val dragArea = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_VERTICAL
      setOnTouchListener(createTouchListener())
    }

    val label = TextView(context).apply {
      text = "Descanso"
      setTextColor(Color.parseColor(LABEL_COLOR))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
      setTypeface(Typeface.DEFAULT)
    }

    val valueTextView = TextView(context).apply {
      setTextColor(Color.parseColor(TEXT_COLOR))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      setTypeface(Typeface.DEFAULT_BOLD)
    }
    valueView = valueTextView

    dragArea.addView(label)
    dragArea.addView(valueTextView)

    val actionsRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val openButton = buildActionButton("↑", Color.parseColor(PRIMARY_COLOR), 19f).apply {
      setOnClickListener {
        onPressed(workoutId)
      }
    }
    val closeButton = buildActionButton("X", Color.parseColor(MAGENTA_COLOR), 15f).apply {
      setOnClickListener {
        hide()
        onDismissed()
      }
    }

    actionsRow.addView(openButton)
    actionsRow.addView(
      closeButton,
      LinearLayout.LayoutParams(dp(38), dp(38)).apply {
        leftMargin = dp(8)
      },
    )

    container.addView(dragArea)
    container.addView(
      actionsRow,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        leftMargin = dp(8)
      },
    )

    overlayView = container
    return container
  }

  private fun ensureLayoutParams(): WindowManager.LayoutParams {
    layoutParams?.let {
      it.x = currentX
      it.y = currentY
      return it
    }

    val created = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      },
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = currentX
      y = currentY
    }

    layoutParams = created
    return created
  }

  private fun createTouchListener(): View.OnTouchListener {
    return object : View.OnTouchListener {
      private var initialTouchX = 0f
      private var initialTouchY = 0f
      private var initialWindowX = 0
      private var initialWindowY = 0

      override fun onTouch(view: View, event: MotionEvent): Boolean {
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            initialTouchX = event.rawX
            initialTouchY = event.rawY
            initialWindowX = currentX
            initialWindowY = currentY
            return true
          }

          MotionEvent.ACTION_MOVE -> {
            val overlay = overlayView
            if (overlay == null || !isOverlayAttached()) {
              return true
            }

            val deltaX = event.rawX - initialTouchX
            val deltaY = event.rawY - initialTouchY
            if (abs(deltaX) < dp(4) && abs(deltaY) < dp(4)) {
              return true
            }

            currentX = max(0, initialWindowX + deltaX.toInt())
            currentY = max(0, initialWindowY + deltaY.toInt())
            val params = ensureLayoutParams().apply {
              x = currentX
              y = currentY
            }
            safelyUpdateViewLayout(overlay, params)
            return true
          }

          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
            return true
          }
        }

        return false
      }
    }
  }

  private fun startTicker() {
    stopTicker()
    val runnable = object : Runnable {
      override fun run() {
        if (!isOverlayAttached()) {
          stopTicker()
          return
        }

        updateCountdownText()
        if (remainingSeconds() <= 0) {
          hideInternal()
          return
        }

        if (isOverlayAttached()) {
          mainHandler.postDelayed(this, 1000L)
        }
      }
    }

    updateRunnable = runnable
    mainHandler.post(runnable)
  }

  private fun stopTicker() {
    updateRunnable?.let(mainHandler::removeCallbacks)
    updateRunnable = null
  }

  private fun updateCountdownText() {
    valueView?.text = "${remainingSeconds()}s"
  }

  private fun showInternal() {
    val view = ensureOverlayView()
    val params = ensureLayoutParams()

    updateCountdownText()
    startTicker()

    if (!isOverlayAttached()) {
      safelyAddView(view, params)
      return
    }

    safelyUpdateViewLayout(view, params)
  }

  private fun hideInternal() {
    stopTicker()
    val view = overlayView
    overlayAttached = false
    if (view != null && view.parent != null) {
      safelyRemoveView(view)
    }
    resetOverlayViewState()
  }

  private fun safelyAddView(view: View, params: WindowManager.LayoutParams) {
    try {
      windowManager.addView(view, params)
      overlayAttached = true
    } catch (error: WindowManager.BadTokenException) {
      overlayAttached = false
      stopTicker()
      resetOverlayViewState()
      Log.w(TAG, "Failed to add overlay view", error)
    } catch (error: IllegalArgumentException) {
      overlayAttached = false
      stopTicker()
      resetOverlayViewState()
      Log.w(TAG, "Invalid overlay add operation", error)
    } catch (error: RuntimeException) {
      overlayAttached = false
      stopTicker()
      resetOverlayViewState()
      Log.w(TAG, "Unexpected error while adding overlay view", error)
    }
  }

  private fun safelyUpdateViewLayout(view: View, params: WindowManager.LayoutParams) {
    if (!isOverlayAttached()) {
      return
    }

    try {
      windowManager.updateViewLayout(view, params)
      overlayAttached = true
    } catch (error: IllegalArgumentException) {
      overlayAttached = false
      stopTicker()
      if (view.parent != null) {
        safelyRemoveView(view)
      }
      resetOverlayViewState()
      Log.w(TAG, "Invalid overlay update operation", error)
    } catch (error: RuntimeException) {
      overlayAttached = false
      stopTicker()
      if (view.parent != null) {
        safelyRemoveView(view)
      }
      resetOverlayViewState()
      Log.w(TAG, "Unexpected error while updating overlay view", error)
    }
  }

  private fun safelyRemoveView(view: View) {
    try {
      windowManager.removeView(view)
    } catch (error: IllegalArgumentException) {
      Log.w(TAG, "Invalid overlay remove operation", error)
    } catch (error: RuntimeException) {
      Log.w(TAG, "Unexpected error while removing overlay view", error)
    }
  }

  private fun isOverlayAttached(): Boolean {
    val attached = overlayAttached && overlayView?.parent != null
    if (!attached) {
      overlayAttached = false
    }
    return attached
  }

  private fun resetOverlayViewState() {
    overlayView = null
    valueView = null
    layoutParams = null
  }

  private fun runOnMainThread(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      action()
      return
    }

    mainHandler.post(action)
  }

  private fun buildActionButton(label: String, backgroundColor: Int, textSizeSp: Float): TextView {
    return TextView(context).apply {
      text = label
      gravity = Gravity.CENTER
      setTypeface(Typeface.DEFAULT_BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp)
      setTextColor(Color.parseColor(TEXT_COLOR))
      minWidth = dp(38)
      minHeight = dp(38)
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(14).toFloat()
        setColor(backgroundColor)
      }
    }
  }

  private fun remainingSeconds(): Int {
    return max(0L, (endsAtMs - System.currentTimeMillis() + 999L) / 1000L).toInt()
  }

  private fun dp(value: Int): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value.toFloat(),
      context.resources.displayMetrics,
    ).toInt()
  }
}
