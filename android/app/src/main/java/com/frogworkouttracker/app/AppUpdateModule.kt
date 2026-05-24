package com.frogworkouttracker.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallState
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

class AppUpdateModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val appUpdateManager: AppUpdateManager by lazy {
    AppUpdateManagerFactory.create(reactContext)
  }
  private var installStateListener: InstallStateUpdatedListener? = null

  override fun getName() = "FrogAppUpdate"

  override fun invalidate() {
    unregisterInstallStateListener()
    super.invalidate()
  }

  @ReactMethod
  fun checkForUpdate(promise: Promise) {
    appUpdateManager.appUpdateInfo
      .addOnSuccessListener { info ->
        promise.resolve(createAppUpdateInfoMap(info))
      }
      .addOnFailureListener { error ->
        promise.reject("E_APP_UPDATE_CHECK", error.message, error)
      }
  }

  @ReactMethod
  fun startFlexibleUpdate(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("E_APP_UPDATE_ACTIVITY", "No active activity for the update flow.")
      return
    }

    appUpdateManager.appUpdateInfo
      .addOnSuccessListener { info ->
        val options = AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
        if (
          info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE ||
          !info.isUpdateTypeAllowed(options)
        ) {
          promise.resolve(createAppUpdateInfoMap(info))
          return@addOnSuccessListener
        }

        registerInstallStateListener()
        appUpdateManager.startUpdateFlow(info, activity, options)
          .addOnSuccessListener {
            promise.resolve(createAppUpdateInfoMap(info))
          }
          .addOnFailureListener { error ->
            promise.reject("E_APP_UPDATE_START", error.message, error)
          }
      }
      .addOnFailureListener { error ->
        promise.reject("E_APP_UPDATE_CHECK", error.message, error)
      }
  }

  @ReactMethod
  fun completeUpdate(promise: Promise) {
    appUpdateManager.completeUpdate()
      .addOnSuccessListener {
        promise.resolve(createStatusMap("installing"))
      }
      .addOnFailureListener { error ->
        promise.reject("E_APP_UPDATE_COMPLETE", error.message, error)
      }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun registerInstallStateListener() {
    if (installStateListener != null) {
      return
    }

    val listener = InstallStateUpdatedListener { state ->
      emitEvent(createInstallStateMap(state))
      when (state.installStatus()) {
        InstallStatus.INSTALLED,
        InstallStatus.FAILED,
        InstallStatus.CANCELED -> unregisterInstallStateListener()
      }
    }

    installStateListener = listener
    appUpdateManager.registerListener(listener)
  }

  private fun unregisterInstallStateListener() {
    val listener = installStateListener ?: return
    installStateListener = null
    runCatching {
      appUpdateManager.unregisterListener(listener)
    }
  }

  private fun createAppUpdateInfoMap(info: AppUpdateInfo): WritableMap {
    val options = AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
    return Arguments.createMap().apply {
      putBoolean("supported", true)
      putString("updateAvailability", mapUpdateAvailability(info.updateAvailability()))
      putString("installStatus", mapInstallStatus(info.installStatus()))
      putBoolean("isFlexibleUpdateAllowed", info.isUpdateTypeAllowed(options))
      val availableVersionCode = info.availableVersionCode()
      if (availableVersionCode > 0) {
        putInt("availableVersionCode", availableVersionCode)
      }
    }
  }

  private fun createInstallStateMap(state: InstallState): WritableMap =
    Arguments.createMap().apply {
      putBoolean("supported", true)
      putString("updateAvailability", "unknown")
      putString("installStatus", mapInstallStatus(state.installStatus()))
      putDouble("bytesDownloaded", state.bytesDownloaded().toDouble())
      putDouble("totalBytesToDownload", state.totalBytesToDownload().toDouble())
    }

  private fun createStatusMap(installStatus: String): WritableMap =
    Arguments.createMap().apply {
      putBoolean("supported", true)
      putString("updateAvailability", "unknown")
      putString("installStatus", installStatus)
    }

  private fun mapUpdateAvailability(updateAvailability: Int): String =
    when (updateAvailability) {
      UpdateAvailability.UPDATE_AVAILABLE -> "available"
      UpdateAvailability.UPDATE_NOT_AVAILABLE -> "notAvailable"
      UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "developerTriggeredUpdateInProgress"
      UpdateAvailability.UNKNOWN -> "unknown"
      else -> "unknown"
    }

  private fun mapInstallStatus(installStatus: Int): String =
    when (installStatus) {
      InstallStatus.PENDING -> "pending"
      InstallStatus.DOWNLOADING -> "downloading"
      InstallStatus.DOWNLOADED -> "downloaded"
      InstallStatus.INSTALLING -> "installing"
      InstallStatus.INSTALLED -> "installed"
      InstallStatus.FAILED -> "failed"
      InstallStatus.CANCELED -> "canceled"
      InstallStatus.UNKNOWN -> "unknown"
      else -> "unknown"
    }

  private fun emitEvent(payload: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onAppUpdateStateChanged", payload)
  }
}
