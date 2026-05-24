# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Expo SQLite constructs native option records through Expo Modules Core at app
# startup; keep the whole conversion path intact when R8 optimizes Play Store builds.
-keep class expo.modules.sqlite.** { *; }
-keep class expo.modules.kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-keep class * implements expo.modules.kotlin.records.Record { *; }
-keep class expo.modules.core.interfaces.DoNotStrip { *; }
-keep @expo.modules.core.interfaces.DoNotStrip class * { *; }
-keepclassmembers class * {
  @expo.modules.core.interfaces.DoNotStrip *;
}
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Expo Notifications persists scheduled local notifications through Java
# serialization. R8 must preserve the model/triggers and the special
# serialization hooks so JSONObject payloads keep being converted to strings.
-keep class expo.modules.notifications.notifications.model.** { *; }
-keep class expo.modules.notifications.notifications.triggers.** { *; }
-keepclassmembers class * implements java.io.Serializable {
  static final long serialVersionUID;
  private static final java.io.ObjectStreamField[] serialPersistentFields;
  private void writeObject(java.io.ObjectOutputStream);
  private void readObject(java.io.ObjectInputStream);
  java.lang.Object writeReplace();
  java.lang.Object readResolve();
}
