import { Platform } from 'react-native';
import { File } from 'expo-file-system';

/** Browser picker URLs are not native filesystem paths. */
export async function readStoryMedia(uri: string, fallbackType: string): Promise<{ base64: string; contentType: string }> {
  if (Platform.OS !== 'web') {
    return { base64: await new File(uri).base64(), contentType: fallbackType };
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected story file.');
  const blob = await response.blob();
  const contentType = blob.type || fallbackType;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected story file.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('Could not encode the selected story file.'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
  return { base64, contentType };
}
