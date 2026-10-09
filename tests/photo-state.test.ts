import { expect, it, vi } from 'vitest';
import { createDownloaderController } from '../src/frontend/state-machine.js';
import type { DownloaderAdapter, Media } from '../src/frontend/contracts.js';
it('selects opaque photos, retains a failed selection and prepares further images without mixing analyses', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const capability = 'a'.repeat(43);
  const media: Media = {
    id,
    postType: 'photo',
    title: 'Public images',
    formats: [],
    capability,
    downloadAvailable: true,
    capabilities: { images: true, mp4: false, mp3: false },
    photos: [1, 2, 3].map((position) => {
      const photoId = `123e4567-e89b-42d3-a456-42661417400${String(position)}`;
      return {
        id: photoId,
        position,
        previewUrl: `/api/v1/analysis/${id}/photos/${photoId}/preview?token=${capability}`,
      };
    }),
  };
  const adapter: DownloaderAdapter = {
    analyze: vi.fn().mockResolvedValue(media),
    startDownload: vi.fn().mockResolvedValue({ id: 'job', accessToken: 'b'.repeat(43) }),
    waitForDownload: vi
      .fn()
      .mockRejectedValueOnce(new Error('Image unavailable'))
      .mockResolvedValue({ url: `/api/v1/downloads/job/file?token=${'c'.repeat(43)}` }),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
  };
  const controller = createDownloaderController({ adapter, requestDownload: vi.fn() });
  controller.setUrl('https://www.tiktok.com/@creator/photo/123');
  await controller.analyze();
  expect(controller.getState().downloadType).toBe('image');
  expect(controller.getState().formatId).toBe(media.photos?.[0]?.id);
  const ids = media.photos?.map((photo) => photo.id) ?? [];
  expect(controller.getState().selectedPhotoIds).toEqual([]);
  controller.selectPhotos(['unknown']);
  expect(controller.getState().selectedPhotoIds).toEqual([]);
  controller.selectPhotos([...ids].reverse());
  expect(controller.getState().selectedPhotoIds).toEqual(ids);
  controller.selectPhotos([ids[0] ?? '', ids[0] ?? '']);
  expect(controller.getState().selectedPhotoIds).toEqual(ids);
  controller.selectPhotos([]);
  expect(controller.getState().selectedPhotoIds).toEqual([]);
  const second = media.photos?.[1]?.id;
  if (!second) throw new Error('Missing photo');
  controller.selectFormat(second);
  await controller.download();
  expect(controller.getState().status).toBe('error');
  controller.chooseQuality();
  expect(controller.getState().formatId).toBe(second);
  await controller.download();
  expect(controller.getState().status).toBe('completed');
  expect(adapter.startDownload).toHaveBeenCalledWith(
    id,
    second,
    expect.any(AbortSignal),
    'image',
    capability,
  );
  controller.chooseQuality();
  expect(adapter.cancelDownload).toHaveBeenCalled();
  expect(controller.getState().status).toBe('ready');
  expect(controller.getState().formatId).toBe(second);
  controller.setUrl('https://www.tiktok.com/@creator/photo/456');
  expect(controller.getState().media).toBeNull();
  expect(controller.getState().formatId).toBeNull();
  expect(controller.getState().selectedPhotoIds).toEqual([]);
  await controller.analyze();
  expect(controller.getState().formatId).toBe(media.photos?.[0]?.id);
});

it('selects and saves successive photos without cancelling a handed-off file', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const capability = 'a'.repeat(43);
  const photos = [1, 2].map((position) => ({
    id: `123e4567-e89b-42d3-a456-42661417400${String(position)}`,
    position,
    previewUrl: `/api/v1/analysis/${id}/photos/123e4567-e89b-42d3-a456-42661417400${String(position)}/preview?token=${capability}`,
  }));
  const media: Media = {
    id,
    postType: 'photo',
    title: 'Public images',
    formats: [],
    photos,
    capability,
    downloadAvailable: true,
    capabilities: { images: true, mp4: false, mp3: false },
  };
  const adapter: DownloaderAdapter = {
    analyze: vi.fn().mockResolvedValue(media),
    startDownload: vi.fn().mockResolvedValue({ id: 'job', accessToken: 'b'.repeat(43) }),
    waitForDownload: vi
      .fn()
      .mockResolvedValue({ url: `/api/v1/downloads/job/file?token=${'c'.repeat(43)}` }),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
  };
  const [first, second] = photos;
  if (!first || !second) throw new Error('Missing photos');
  const requestDownload = vi.fn();
  const controller = createDownloaderController({ adapter, requestDownload });
  controller.setUrl('https://www.tiktok.com/@creator/photo/123');
  await controller.analyze();
  await controller.download();
  controller.save();
  expect(controller.getState().status).toBe('ready');
  controller.selectFormat('unknown-photo');
  expect(controller.getState().status).toBe('ready');
  controller.selectFormat(second.id);
  expect(controller.getState()).toMatchObject({
    status: 'ready',
    formatId: second.id,
    download: null,
    progress: null,
  });
  expect(adapter.cancelDownload).not.toHaveBeenCalled();
  const pending = controller.download();
  controller.selectFormat(first.id);
  expect(controller.getState().formatId).toBe(second.id);
  await pending;
  controller.save();
  expect(adapter.startDownload).toHaveBeenNthCalledWith(
    2,
    id,
    second.id,
    expect.any(AbortSignal),
    'image',
    capability,
  );
  expect(requestDownload).toHaveBeenCalledTimes(2);
  expect(adapter.analyze).toHaveBeenCalledTimes(1);
  controller.selectFormat(first.id);
  await controller.download();
  // Changing an unsaved selection must clean up the abandoned prepared file.
  controller.selectFormat(second.id);
  expect(adapter.cancelDownload).toHaveBeenCalledTimes(1);
  expect(controller.getState().status).toBe('ready');
});
