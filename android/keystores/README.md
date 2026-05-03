# Android Keystores

Place local Android signing files here when preparing release builds.

- Keep keystore files out of git.
- `*.jks`, `*.p12`, `*.key` and related secrets are already ignored at the repository root.
- Configure the matching values in `android/gradle.properties` locally or through your local Gradle user properties.

Expected property names:

```properties
FROG_UPLOAD_STORE_FILE=keystores/frog-upload.keystore
FROG_UPLOAD_STORE_PASSWORD=change-me
FROG_UPLOAD_KEY_ALIAS=frog-upload
FROG_UPLOAD_KEY_PASSWORD=change-me
```
