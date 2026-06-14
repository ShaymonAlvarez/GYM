import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AppState, LocalMediaAsset, SupabaseSettings } from '../types';
import { normalizeAppState } from './state';

export const SUPABASE_STATE_TABLE = 'gym_app_states';
export const SUPABASE_PHOTO_BUCKET = 'gym-photos';

export type GymSupabaseClient = SupabaseClient;

export const getSupabaseConfig = (settings?: SupabaseSettings) => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  return {
    projectUrl: envUrl || settings?.projectUrl || '',
    anonKey: envAnonKey || settings?.anonKey || ''
  };
};

export const hasSupabaseConfig = (settings?: SupabaseSettings) => {
  const config = getSupabaseConfig(settings);

  return Boolean(config.projectUrl && config.anonKey);
};

// Singleton client created from env vars — always available for auth
const envConfig = getSupabaseConfig();
export const supabaseSingleton: GymSupabaseClient | null =
  envConfig.projectUrl && envConfig.anonKey
    ? createClient(envConfig.projectUrl, envConfig.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit'
        }
      })
    : null;

export const createGymSupabaseClient = (settings?: SupabaseSettings): GymSupabaseClient | null => {
  // Always prefer the singleton if env vars are configured
  if (supabaseSingleton) {
    return supabaseSingleton;
  }

  const config = getSupabaseConfig(settings);

  if (!config.projectUrl || !config.anonKey) {
    return null;
  }

  return createClient(config.projectUrl, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });
};

const stripMediaForRemote = (asset: LocalMediaAsset): LocalMediaAsset => ({
  id: asset.id,
  type: asset.type,
  name: asset.name,
  remoteUrl: undefined,
  storagePath: asset.storagePath,
  mimeType: asset.mimeType,
  originalBytes: asset.originalBytes,
  optimizedBytes: asset.optimizedBytes,
  syncedAt: asset.syncedAt,
  createdAt: asset.createdAt,
  weekIndex: asset.weekIndex,
  workoutId: asset.workoutId,
  exerciseId: asset.exerciseId
});

export const createRemoteStatePayload = (state: AppState): AppState => ({
  ...state,
  localMedia: (state.localMedia ?? []).filter((asset) => asset.type === 'photo').map(stripMediaForRemote),
  supabase: {
    enabled: state.supabase?.enabled ?? false,
    projectUrl: '',
    anonKey: ''
  }
});

export const saveRemoteAppState = async (client: GymSupabaseClient, user: User, state: AppState) => {
  const { error } = await client.from(SUPABASE_STATE_TABLE).upsert(
    {
      user_id: user.id,
      state: createRemoteStatePayload(state),
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw error;
  }
};

export const deleteRemoteAppState = async (client: GymSupabaseClient, user: User) => {
  const { error } = await client.from(SUPABASE_STATE_TABLE).delete().eq('user_id', user.id);
  if (error) throw error;
};

export const loadRemoteAppState = async (client: GymSupabaseClient) => {
  const { data, error } = await client.from(SUPABASE_STATE_TABLE).select('state').maybeSingle();

  if (error) {
    throw error;
  }

  return data?.state ? normalizeAppState(data.state as AppState) : null;
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality: number) =>
  new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });

export const optimizePhotoFile = async (file: File) => {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1200;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {
    alpha: false,
    colorSpace: 'srgb'
  });

  canvas.width = width;
  canvas.height = height;

  if (!context) {
    bitmap.close();
    return {
      blob: file,
      mimeType: file.type || 'image/jpeg',
      extension: file.name.split('.').pop() || 'jpg'
    };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webpBlob = await canvasToBlob(canvas, 'image/webp', 0.72);

  if (webpBlob) {
    return {
      blob: webpBlob,
      mimeType: 'image/webp',
      extension: 'webp'
    };
  }

  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.78);

  return {
    blob: jpegBlob ?? file,
    mimeType: jpegBlob ? 'image/jpeg' : file.type || 'image/jpeg',
    extension: jpegBlob ? 'jpg' : file.name.split('.').pop() || 'jpg'
  };
};

export const uploadPhotoAsset = async (
  client: GymSupabaseClient,
  user: User,
  asset: LocalMediaAsset,
  file: File
): Promise<LocalMediaAsset> => {
  const optimized = await optimizePhotoFile(file);
  const storagePath = `${user.id}/week-${asset.weekIndex + 1}/${asset.workoutId}/${asset.id}.${optimized.extension}`;
  const { error } = await client.storage.from(SUPABASE_PHOTO_BUCKET).upload(storagePath, optimized.blob, {
    cacheControl: '31536000',
    contentType: optimized.mimeType,
    upsert: true
  });

  if (error) {
    throw error;
  }

  const { data } = await client.storage.from(SUPABASE_PHOTO_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  return {
    ...asset,
    type: 'photo',
    dataUrl: undefined,
    remoteUrl: data?.signedUrl,
    storagePath,
    mimeType: optimized.mimeType,
    originalBytes: file.size,
    optimizedBytes: optimized.blob.size,
    syncedAt: new Date().toISOString()
  };
};

export const hydrateRemotePhotoUrls = async (client: GymSupabaseClient, state: AppState): Promise<AppState> => {
  const media = await Promise.all(
    (state.localMedia ?? []).map(async (asset) => {
      if (asset.type !== 'photo' || !asset.storagePath) {
        return asset;
      }

      const { data } = await client.storage.from(SUPABASE_PHOTO_BUCKET).createSignedUrl(asset.storagePath, 60 * 60 * 24 * 7);

      return {
        ...asset,
        remoteUrl: data?.signedUrl ?? asset.remoteUrl
      };
    })
  );

  return {
    ...state,
    localMedia: media
  };
};
