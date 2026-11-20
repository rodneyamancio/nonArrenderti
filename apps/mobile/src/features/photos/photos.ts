import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { api } from '@/session/provider';
import { apiUrl } from '@/lib/config';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Asks camera or library (the person chooses), never both permissions up front. */
export function choosePhoto(): Promise<PickedPhoto | null> {
  return new Promise((resolve) => {
    const pick = async (source: 'camera' | 'library') => {
      try {
        // The library uses the system photo picker: no access to the whole library is needed or asked.
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Sem permissão', 'Libere a câmera para o Tenace nos Ajustes do aparelho.');
            return resolve(null);
          }
        }
        const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
        const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        const a = r.canceled ? null : r.assets[0];
        resolve(a ? { uri: a.uri, width: a.width, height: a.height } : null);
      } catch (e) {
        if (__DEV__) console.warn('choosePhoto', e);
        Alert.alert('Não foi possível abrir', source === 'camera' ? 'A câmera não abriu. Tente de novo.' : 'As fotos não abriram. Tente de novo.');
        resolve(null);
      }
    };
    Alert.alert('Adicionar foto', undefined, [
      { text: 'Tirar foto', onPress: () => setTimeout(() => void pick('camera'), 350) },
      { text: 'Escolher da galeria', onPress: () => setTimeout(() => void pick('library'), 350) },
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** Same as the portal: max 1600 px, JPEG ~0.82, then raw bytes to /groups/:id/uploads. */
export async function uploadPhoto(groupId: string, photo: PickedPhoto): Promise<string> {
  const max = 1600;
  const scale = Math.min(1, max / Math.max(photo.width || max, photo.height || max));
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (scale < 1) ctx.resize({ width: Math.round(photo.width * scale) });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
  const blob = await (await fetch(saved.uri)).blob();
  const r = await api<{ id: string }>(`/groups/${groupId}/uploads`, { method: 'POST', raw: { body: blob, contentType: 'image/jpeg' } });
  return r.id;
}

export const uploadUrl = (groupId: string, id: string) => `${apiUrl}/groups/${groupId}/uploads/${id}`;
