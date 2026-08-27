import { Platform } from 'react-native';
import { File, UploadType } from 'expo-file-system';

// Uploads a local file (from expo-image-picker, on device or web) directly
// to a presigned URL (docs/REMEDIATION.md §8.2 — avatar upload). Never
// routes the bytes through our own backend; the backend only hands out the
// presigned URL (apiService.getAvatarUploadUrl).
//
// Two code paths: expo-file-system's `File.upload()` wraps a native upload
// task (background-session-capable, doesn't hold the whole file in JS
// memory) that's the right tool on iOS/Android. On web, the picker result's
// URI is a `blob:`/`data:` URL and the Fetch API can PUT it directly —
// simpler and doesn't depend on expo-file-system's native-module internals
// behaving identically in a browser.
export async function uploadFileToUrl(localUri: string, uploadUrl: string, contentType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': contentType },
    });
    if (!res.ok) {
      throw new Error(`Upload failed (${res.status}).`);
    }
    return;
  }

  const file = new File(localUri);
  const result = await file.upload(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result.status}).`);
  }
}
