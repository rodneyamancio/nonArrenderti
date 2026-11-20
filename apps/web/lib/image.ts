'use client';
import { api } from './api';

/** Resizes a photo in the browser (max 1600px, JPEG ~0.82) before upload: fast on 4G, small on disk. */
export async function resizeImage(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82));
}

export async function uploadPhoto(groupId: string, file: File): Promise<string> {
  const blob = await resizeImage(file);
  const r = await api<{ id: string }>(`/groups/${groupId}/uploads`, { method: 'POST', raw: blob.type ? blob : new Blob([blob], { type: 'image/jpeg' }) });
  return r.id;
}

export const uploadUrl = (groupId: string, id: string) => `/api/groups/${groupId}/uploads/${id}`;
