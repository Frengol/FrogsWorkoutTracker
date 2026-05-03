package com.frogworkouttracker.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class RestOverlayModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val manager = RestOverlayManager(
    context = reactContext.applicationContext,
    onDismissed = {
      emitEvent("onOverlayDismissed", null)
    },
    onPressed = { workoutId ->
      if (!launchWorkoutIfNeeded(workoutId)) {
        val payload = Arguments.createMap().apply {
          if (workoutId != null) {
            putString("workoutId", workoutId)
          } else {
            putNull("workoutId")
          }
        }
        emitEvent("onOverlayPressed", payload)
      }
    },
  )

  override fun getName() = "FrogRestOverlay"

  override fun invalidate() {
    manager.destroy()
    super.invalidate()
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isOverlayPermissionGranted(): Boolean = manager.canDrawOverlays()

  @ReactMethod
  fun openOverlayPermissionSettings(promise: Promise) {
    runCatching {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
          data = Uri.parse("package:${reactContext.packageName}")
        }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      if (intent.resolveActivity(reactContext.packageManager) == null) {
        promise.resolve(null)
        return
      }

      reactContext.startActivity(intent)
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("E_OVERLAY_SETTINGS", error.message, error)
    }
  }

  @ReactMethod
  fun openAppDetailsSettings(promise: Promise) {
    runCatching {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      if (intent.resolveActivity(reactContext.packageManager) == null) {
        promise.resolve(null)
        return
      }

      reactContext.startActivity(intent)
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("E_APP_DETAILS_SETTINGS", error.message, error)
    }
  }

  @ReactMethod
  fun showRestOverlay(payload: ReadableMap, promise: Promise) {
    handleOverlayMutation(payload, promise) { workoutId, endsAtMs ->
      manager.show(workoutId, endsAtMs)
    }
  }

  @ReactMethod
  fun updateRestOverlay(payload: ReadableMap, promise: Promise) {
    handleOverlayMutation(payload, promise) { workoutId, endsAtMs ->
      manager.update(workoutId, endsAtMs)
    }
  }

  @ReactMethod
  fun hideRestOverlay(promise: Promise) {
    runCatching {
      manager.hide()
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("E_OVERLAY_HIDE", error.message, error)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun handleOverlayMutation(
    payload: ReadableMap,
    promise: Promise,
    action: (workoutId: String, endsAtMs: Long) -> Unit,
  ) {
    runCatching {
      val workoutId = payload.getString("workoutId") ?: throw IllegalArgumentException("workoutId is required")
      val endsAtMs = payload.getDouble("endsAtMs").toLong()
      action(workoutId, endsAtMs)
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("E_OVERLAY_MUTATION", error.message, error)
    }
  }

  private fun emitEvent(eventName: String, payload: WritableMap?) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun launchWorkoutIfNeeded(workoutId: String?): Boolean {
    if (workoutId.isNullOrBlank()) {
      return false
    }

    val activity = reactContext.currentActivity
    if (activity?.hasWindowFocus() == true) {
      return false
    }

    val intent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("frogworkouttracker:///workout/live/${Uri.encode(workoutId)}"),
    ).apply {
      `package` = reactContext.packageName
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP,
      )
    }

    if (intent.resolveActivity(reactContext.packageManager) == null) {
      return false
    }

    reactContext.startActivity(intent)
    return true
  }
}
