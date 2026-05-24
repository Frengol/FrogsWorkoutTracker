package com.frogworkouttracker.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
    onPressed = { workoutId, sourceSetId ->
      if (!launchWorkoutIfNeeded(workoutId, sourceSetId)) {
        val payload = Arguments.createMap().apply {
          if (workoutId != null) {
            putString("workoutId", workoutId)
          } else {
            putNull("workoutId")
          }
          if (sourceSetId != null) {
            putString("sourceSetId", sourceSetId)
          } else {
            putNull("sourceSetId")
          }
        }
        emitEvent("onOverlayPressed", payload)
      }
    },
  )
  private var userPresentReceiver: BroadcastReceiver? = null

  override fun getName() = "FrogRestOverlay"

  override fun invalidate() {
    stopUserPresentListenerInternal()
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
    handleOverlayMutation(payload, promise) { workoutId, sourceSetId, endsAtMs, isFinished ->
      manager.show(workoutId, sourceSetId, endsAtMs, isFinished)
    }
  }

  @ReactMethod
  fun updateRestOverlay(payload: ReadableMap, promise: Promise) {
    handleOverlayMutation(payload, promise) { workoutId, sourceSetId, endsAtMs, isFinished ->
      manager.update(workoutId, sourceSetId, endsAtMs, isFinished)
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

  @ReactMethod
  fun startUserPresentListener(promise: Promise) {
    runCatching {
      if (userPresentReceiver != null) {
        promise.resolve(null)
        return
      }

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent?.action == Intent.ACTION_USER_PRESENT) {
            emitEvent("onUserPresent", null)
          }
        }
      }
      val filter = IntentFilter(Intent.ACTION_USER_PRESENT)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        reactContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        reactContext.registerReceiver(receiver, filter)
      }

      userPresentReceiver = receiver
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("E_USER_PRESENT_LISTENER", error.message, error)
    }
  }

  @ReactMethod
  fun stopUserPresentListener(promise: Promise) {
    runCatching {
      stopUserPresentListenerInternal()
      promise.resolve(null)
    }.onFailure { error ->
      promise.reject("E_USER_PRESENT_LISTENER_STOP", error.message, error)
    }
  }

  private fun handleOverlayMutation(
    payload: ReadableMap,
    promise: Promise,
    action: (workoutId: String, sourceSetId: String?, endsAtMs: Long, isFinished: Boolean) -> Unit,
  ) {
    runCatching {
      val workoutId = payload.getString("workoutId") ?: throw IllegalArgumentException("workoutId is required")
      val sourceSetId = if (payload.hasKey("sourceSetId") && !payload.isNull("sourceSetId")) {
        payload.getString("sourceSetId")
      } else {
        null
      }
      val endsAtMs = payload.getDouble("endsAtMs").toLong()
      val isFinished = payload.hasKey("isFinished") && payload.getBoolean("isFinished")
      action(workoutId, sourceSetId, endsAtMs, isFinished)
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

  private fun launchWorkoutIfNeeded(workoutId: String?, sourceSetId: String?): Boolean {
    if (workoutId.isNullOrBlank()) {
      return false
    }

    val activity = reactContext.currentActivity
    if (activity?.hasWindowFocus() == true) {
      return false
    }

    val intent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse(buildWorkoutUri(workoutId, sourceSetId)),
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

  private fun buildWorkoutUri(workoutId: String, sourceSetId: String?): String {
    val baseUri = "frogworkouttracker:///workout/live/${Uri.encode(workoutId)}"
    if (sourceSetId.isNullOrBlank()) {
      return baseUri
    }

    return "$baseUri?focusSetId=${Uri.encode(sourceSetId)}"
  }

  private fun stopUserPresentListenerInternal() {
    val receiver = userPresentReceiver ?: return
    userPresentReceiver = null
    runCatching {
      reactContext.unregisterReceiver(receiver)
    }
  }
}
