import type { State } from './state-machine.js';

type Controls = {
  getState: () => State;
  selectFormat: (id: string) => void;
  download: () => Promise<void>;
  downloadSelected: () => Promise<void>;
  selectPhotos: (ids: string[]) => void;
  setUrl: (url: string) => void;
};
export function initializePhotoGallery(
  root: Document,
  controls: Controls,
  signal: AbortSignal,
) {
  const gallery = root.querySelector<HTMLElement>('#photo-gallery');
  if (!gallery) return () => undefined;
  const selected = gallery.querySelector<HTMLImageElement>('#photo-selected');
  const strip = gallery.querySelector<HTMLElement>('#photo-thumbnails');
  const loading = gallery.querySelector<HTMLElement>('#photo-loading');
  const unavailable = gallery.querySelector<HTMLElement>('#photo-unavailable');
  const position = gallery.querySelector<HTMLElement>('#photo-position');
  const previous = gallery.querySelector<HTMLButtonElement>('#photo-previous');
  const next = gallery.querySelector<HTMLButtonElement>('#photo-next');
  const download = gallery.querySelector<HTMLButtonElement>('#photo-download');
  const another = gallery.querySelector<HTMLButtonElement>('#photo-another');
  const list = gallery.querySelector<HTMLUListElement>('#photo-selection-list');
  const selectAll = gallery.querySelector<HTMLButtonElement>('#photo-select-all');
  const clearSelection = gallery.querySelector<HTMLButtonElement>(
    '#photo-clear-selection',
  );
  const downloadSelected = gallery.querySelector<HTMLButtonElement>(
    '#photo-download-selected',
  );
  const selectionCount = gallery.querySelector<HTMLElement>('#photo-selection-count');
  if (
    !selected ||
    !strip ||
    !loading ||
    !unavailable ||
    !position ||
    !previous ||
    !next ||
    !download ||
    !another ||
    !list ||
    !selectAll ||
    !clearSelection ||
    !downloadSelected ||
    !selectionCount
  )
    throw new Error('Incomplete photo gallery');
  let rendered: State['media'] = null;
  const move = (delta: number) => {
    const state = controls.getState();
    const photos = state.media?.photos ?? [];
    const index = photos.findIndex((photo) => photo.id === state.formatId);
    const photo = photos[index + delta];
    if (photo) controls.selectFormat(photo.id);
  };
  const events = { signal };
  selectAll.addEventListener(
    'click',
    () =>
      controls.selectPhotos(
        (controls.getState().media?.photos ?? []).map((photo) => photo.id),
      ),
    events,
  );
  clearSelection.addEventListener('click', () => controls.selectPhotos([]), events);
  downloadSelected.addEventListener(
    'click',
    () => {
      void controls.downloadSelected();
    },
    events,
  );
  previous.addEventListener('click', () => move(-1), events);
  next.addEventListener('click', () => move(1), events);
  gallery.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }
    },
    events,
  );
  download.addEventListener(
    'click',
    () => {
      void controls.download();
    },
    events,
  );
  another.addEventListener(
    'click',
    () => {
      const input = root.querySelector<HTMLInputElement>('#video-url');
      if (input) {
        input.value = '';
        input.focus();
      }
      controls.setUrl('');
    },
    events,
  );
  selected.addEventListener(
    'load',
    () => {
      loading.hidden = true;
      unavailable.hidden = true;
    },
    events,
  );
  selected.addEventListener(
    'error',
    () => {
      loading.hidden = true;
      unavailable.hidden = false;
      selected.hidden = true;
    },
    events,
  );
  return (state: State) => {
    gallery.hidden = state.media?.postType !== 'photo';
    if (gallery.hidden) {
      strip.replaceChildren();
      list.replaceChildren();
      const multi = gallery.querySelector<HTMLDetailsElement>('#photo-multi');
      if (multi) multi.open = false;
      selected.removeAttribute('src');
      rendered = null;
      return;
    }
    const photos = state.media?.photos ?? [];
    if (rendered !== state.media) {
      rendered = state.media;
      strip.replaceChildren();
      list.replaceChildren();
      const count = gallery.querySelector('#photo-count');
      if (count)
        count.textContent = `${String(photos.length)} photos · Select an image to download`;
      for (const photo of photos) {
        const button = root.createElement('button');
        button.type = 'button';
        button.dataset.photoId = photo.id;
        button.setAttribute('aria-label', `Select image ${String(photo.position)}`);
        const image = root.createElement('img');
        image.loading = 'lazy';
        image.src = photo.previewUrl;
        image.alt = `Image ${String(photo.position)}`;
        image.addEventListener(
          'error',
          () => {
            image.hidden = true;
          },
          { once: true },
        );
        const label = root.createElement('small');
        label.textContent = String(photo.position);
        button.append(image, label);
        button.addEventListener('click', () => controls.selectFormat(photo.id));
        strip.append(button);
        const item = root.createElement('li');
        const checkboxLabel = root.createElement('label');
        const checkbox = root.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.photoId = photo.id;
        checkbox.setAttribute('aria-label', `Save photo ${String(photo.position)}`);
        const preview = root.createElement('img');
        preview.src = photo.previewUrl;
        preview.alt = `Photo ${String(photo.position)} from the analyzed TikTok post`;
        preview.loading = 'lazy';
        preview.width = 120;
        preview.height = 120;
        preview.addEventListener(
          'error',
          () => {
            preview.hidden = true;
          },
          { once: true },
        );
        const text = root.createElement('span');
        text.textContent = `Photo ${String(photo.position)}`;
        checkboxLabel.append(preview, checkbox, text);
        checkbox.addEventListener('change', () => {
          const ids = new Set(controls.getState().selectedPhotoIds);
          if (checkbox.checked) ids.add(photo.id);
          else ids.delete(photo.id);
          controls.selectPhotos([...ids]);
        });
        item.append(checkboxLabel);
        list.append(item);
      }
    }
    const index = photos.findIndex((photo) => photo.id === state.formatId);
    const photo = photos[index];
    if (photo && selected.getAttribute('src') !== photo.previewUrl) {
      selected.hidden = false;
      loading.hidden = false;
      unavailable.hidden = true;
      selected.alt = `Photo ${String(photo.position)} from the analyzed TikTok post`;
      selected.src = photo.previewUrl;
    }
    position.textContent = `${String(index + 1)} of ${String(photos.length)}`;
    const canSelect = ['ready', 'completed', 'download-requested'].includes(state.status);
    previous.disabled = !canSelect || index <= 0;
    next.disabled = !canSelect || index >= photos.length - 1;
    download.hidden = state.status !== 'ready';
    const multi = gallery.querySelector<HTMLDetailsElement>('#photo-multi');
    if (multi) multi.hidden = state.status !== 'ready';
    download.disabled = state.media?.downloadAvailable !== true;
    selectAll.disabled = state.status !== 'ready';
    clearSelection.disabled = state.status !== 'ready' || !state.selectedPhotoIds.length;
    downloadSelected.disabled =
      state.status !== 'ready' ||
      !state.selectedPhotoIds.length ||
      state.media?.downloadAvailable !== true;
    selectionCount.textContent = `${String(state.selectedPhotoIds.length)} of ${String(photos.length)} selected`;
    list.querySelectorAll<HTMLInputElement>('input').forEach((checkbox) => {
      checkbox.checked = state.selectedPhotoIds.includes(checkbox.dataset.photoId ?? '');
      checkbox.disabled = state.status !== 'ready';
    });
    another.disabled = ['starting-download', 'downloading'].includes(state.status);
    another.hidden = ['completed', 'download-requested'].includes(state.status);
    // Keep the selected image among five visible thumbnails, including long posts.
    const firstVisible = Math.max(0, Math.min(index - 2, photos.length - 5));
    strip.querySelectorAll<HTMLButtonElement>('button').forEach((button, buttonIndex) => {
      button.hidden = buttonIndex < firstVisible || buttonIndex >= firstVisible + 5;
      const active = button.dataset.photoId === state.formatId;
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !canSelect;
      const label = button.querySelector('small');
      if (label)
        label.textContent = `${String(photos.find((item) => item.id === button.dataset.photoId)?.position ?? '')}${active ? ' ✓' : ''}`;
    });
  };
}
