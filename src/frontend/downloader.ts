import { createApiAdapter } from './api-adapter.js';
import { createDownloaderController, isBusy, type State } from './state-machine.js';
import type { DownloaderAdapter } from './contracts.js';
import { initializePhotoGallery } from './photo-gallery.js';

type Options = {
  adapter?: DownloaderAdapter;
  clipboard?: Pick<Clipboard, 'readText'>;
  requestDownload?: (url: string) => void;
};

const instances = new WeakMap<Document, { destroy: () => void }>();

export function initializeDownloader(root: Document = document, options: Options = {}) {
  const form = root.querySelector<HTMLFormElement>('#download-form');
  if (!form) return null;
  instances.get(root)?.destroy();
  // Element types come from the fixed EJS markup; fail early if the markup is missing.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing downloader element: ${selector}`);
    return element;
  };
  const input = get<HTMLInputElement>('#video-url');
  const submit = get<HTMLButtonElement>('.analyze-button');
  const submitLabel = root.querySelector<HTMLElement>('.analyze-label') ?? submit;
  const paste = get<HTMLButtonElement>('.paste-button');
  const clear = get<HTMLButtonElement>('.clear-button');
  const cancel = get<HTMLButtonElement>('.cancel-button');
  const status = get('#form-status');
  const result = get('#result-card');
  const resultHeading = get('#result-title');
  const resultWorkspace = root.querySelector<HTMLElement>('.result-workspace');
  const formats = get('#format-options');
  const extraFormats = get('#extra-format-options');
  const moreFormats = get<HTMLDetailsElement>('#more-formats');
  const thumbnail = get<HTMLImageElement>('#result-thumbnail');
  const previewUnavailable = get('#preview-unavailable');
  const creator = get('#result-creator');
  const previewCreator = get('#preview-creator');
  const previewTitle = get('#preview-title');
  const duration = get('#result-duration');
  const download = get<HTMLButtonElement>('.download-button');
  const downloadLabel = root.querySelector<HTMLElement>('.download-label') ?? download;
  const progressCard = get('#progress-card');
  const progressHeading = get('#progress-title');
  const progress = get<HTMLProgressElement>('#download-progress');
  const metrics = get('#progress-metrics');
  const analyzing = get('#analyzing-indicator');
  const hero = root.querySelector<HTMLElement>('#hero');
  const qualityCard = get('#quality-card');
  const completedCard = get('#completed-card');
  const errorCard = get('#error-card');
  const save = get<HTMLButtonElement>('.save-button');
  const preview = get('.analyzed-phone');
  // Mini thumbnail inside the result panel (separate from the phone thumbnail)
  const miniThumb = root.querySelector<HTMLImageElement>('#rp-mini-thumb');
  // Custom progress fill div (driven by CSS variable --rp-progress)
  const progFill = root.querySelector<HTMLElement>('.rp-prog-fill');
  const progTrack = root.querySelector<HTMLElement>('.rp-prog-track');
  let lastStatus = 'idle';
  let renderedMedia: State['media'] = null;
  let clipboardVersion = 0;
  const eventController = new AbortController();
  const events = { signal: eventController.signal };
  const fallback = '/assets/images/preview-unavailable.webp';
  // ── Byte formatting helpers ──────────────────────────────────────
  const fmtBytes = (bytes: number): string => {
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${String(Math.round(bytes / 1024))} KB`;
    return `${String(bytes)} B`;
  };
  const fmtSpeed = (bps: number): string => {
    if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${String(Math.round(bps / 1024))} KB/s`;
    return `${String(bps)} B/s`;
  };
  // ─────────────────────────────────────────────────────────────────
  thumbnail.addEventListener(
    'error',
    () => {
      if (thumbnail.getAttribute('src') === fallback) return;
      thumbnail.src = fallback;
      thumbnail.alt = 'Video preview unavailable';
      previewUnavailable.hidden = false;
    },
    events,
  );
  const clipboard = options.clipboard ?? root.defaultView?.navigator.clipboard;
  const requestDownload =
    options.requestDownload ??
    ((url: string) => {
      const link = root.createElement('a');
      link.href = url;
      link.download = '';
      link.hidden = true;
      root.body.append(link);
      link.click();
      link.remove();
    });
  const controller = createDownloaderController({
    adapter: options.adapter ?? createApiAdapter(),
    requestDownload,
  });
  const renderGallery = initializePhotoGallery(root, controller, eventController.signal);

  const render = (state: State) => {
    const photoMode = state.media?.postType === 'photo';
    renderGallery(state);
    const busy = isBusy(state.status);
    const downloading = ['starting-download', 'downloading'].includes(state.status);
    get('#downloader').dataset.state = state.status;
    // Drive idle vs active layout via the hero section's data attribute
    if (hero) hero.dataset.downloaderState = state.status;
    preview.hidden = !state.media || photoMode;
    form.setAttribute('aria-busy', String(busy));
    input.disabled = busy;
    input.setAttribute('aria-invalid', String(state.invalidUrl));
    submit.disabled = busy;
    paste.disabled = busy;
    cancel.hidden = !busy || downloading;
    cancel.textContent = downloading ? 'Cancel download request' : 'Cancel analysis';
    clear.disabled = !input.value && !busy;
    submitLabel.textContent =
      state.status === 'validating'
        ? 'Checking link…'
        : state.status === 'analyzing'
          ? 'Analyzing video…'
          : 'Get video';
    status.textContent = state.message;
    analyzing.hidden = !['validating', 'analyzing'].includes(state.status);
    result.hidden = ![
      'ready',
      'starting-download',
      'downloading',
      'completed',
      'download-requested',
      'error',
    ].includes(state.status);
    qualityCard.hidden = state.status !== 'ready' || photoMode;
    completedCard.hidden = !['completed', 'download-requested'].includes(state.status);
    errorCard.hidden = state.status !== 'error';
    get('#error-message').textContent = state.message;
    get<HTMLButtonElement>('.choose-button').hidden = !state.media;
    save.disabled = state.status !== 'completed';
    save.textContent =
      state.status === 'download-requested'
        ? 'Save requested'
        : photoMode
          ? 'Save image'
          : `Save ${state.downloadType.toUpperCase()}`;
    const audioMode = state.downloadType === 'mp3';
    get('#video-quality-panel').hidden = audioMode;
    get('#audio-quality-panel').hidden = !audioMode;
    get('#audio-unavailable').hidden = state.media?.capabilities?.mp3 === true;
    result
      .querySelectorAll<HTMLInputElement>('input[name="download-type"]')
      .forEach((radio) => {
        radio.checked = radio.value === state.downloadType;
        radio.disabled =
          state.status !== 'ready' ||
          (radio.value === 'mp3' && state.media?.capabilities?.mp3 !== true);
      });
    get('.rp-helper').textContent = audioMode
      ? 'The audio is converted to MP3. Audio quality depends on the source.'
      : 'Choose an available source quality. Video and audio are saved together.';
    get('#completed-title').textContent = photoMode
      ? 'Your image is ready'
      : audioMode
        ? 'Your MP3 is ready'
        : 'Download ready';
    const selected = state.media?.formats.find((format) => format.id === state.formatId);
    const creatorInitial = root.querySelector<HTMLElement>('#result-creator-initial');
    if (creatorInitial)
      creatorInitial.textContent =
        state.media?.creator?.replace(/^@/, '').slice(0, 1).toUpperCase() ?? '';
    const creatorHeader = root.querySelector<HTMLElement>('.rp-creator-header');
    if (creatorHeader) creatorHeader.hidden = !state.media?.creator;
    const postLabel = creatorHeader?.querySelector('p');
    if (postLabel)
      postLabel.textContent = photoMode
        ? 'Public TikTok photo post'
        : 'Public TikTok video';
    const badge = result.querySelector('.rp-format-badge');
    if (badge) badge.textContent = photoMode ? 'Photos' : 'Video';
    result.setAttribute(
      'aria-label',
      photoMode ? 'Photo download workspace' : 'Video download workspace',
    );
    get<HTMLButtonElement>('.choose-button').textContent = photoMode
      ? 'Choose another image'
      : 'Choose another quality';
    get<HTMLButtonElement>('.another-button').textContent = photoMode
      ? 'Download another post'
      : 'Download another video';
    const containerLabel = root.querySelector<HTMLElement>('#result-container-label');
    if (containerLabel)
      containerLabel.textContent = photoMode
        ? 'Image'
        : (selected?.container?.toUpperCase() ?? 'Video');
    get('#progress-quality').textContent = photoMode
      ? 'Selected image'
      : audioMode
        ? 'MP3 Audio'
        : (selected?.label ?? '');
    get('#completed-quality').textContent = photoMode
      ? 'Selected image'
      : audioMode
        ? 'MP3 Audio'
        : (state.download?.qualityLabel ?? selected?.label ?? '');
    get('#completed-size').textContent =
      state.download?.sizeBytes === undefined || state.download.sizeBytes === 0
        ? ''
        : fmtBytes(state.download.sizeBytes);
    download.disabled =
      !['ready', 'starting-download'].includes(state.status) ||
      state.status === 'starting-download' ||
      !state.formatId ||
      state.media?.downloadAvailable === false ||
      (audioMode && state.media?.capabilities?.mp3 !== true);
    downloadLabel.textContent =
      state.media?.downloadAvailable === false
        ? 'Download unavailable'
        : state.status === 'starting-download'
          ? 'Preparing download\u2026'
          : downloading && state.status === 'downloading'
            ? 'Preparing download\u2026'
            : `Download ${state.downloadType.toUpperCase()}`;
    if (state.media !== renderedMedia) {
      formats.replaceChildren();
      extraFormats.replaceChildren();
      moreFormats.open = false;
      moreFormats.hidden = !state.media || state.media.formats.length <= 4;
      renderedMedia = state.media;
      resultHeading.textContent = state.media?.title ?? 'Available video formats';
      resultHeading.title = state.media?.title ?? '';
      creator.textContent = state.media?.creator ?? '';
      previewCreator.textContent = state.media?.creator ?? '';
      const title = state.media?.title ?? '';
      previewTitle.textContent = title;
      duration.textContent =
        state.media?.durationSeconds == null
          ? ''
          : `${String(Math.floor(state.media.durationSeconds / 60))}:${String(Math.floor(state.media.durationSeconds % 60)).padStart(2, '0')}`;
      get('#preview-duration').textContent = duration.textContent;
      thumbnail.src = state.media?.thumbnail ?? fallback;
      thumbnail.alt = state.media?.thumbnail
        ? `Preview of ${state.media.title ?? 'the analyzed video'}${state.media.creator ? ` by ${state.media.creator}` : ''}`
        : 'Video preview unavailable';
      previewUnavailable.hidden = !!state.media?.thumbnail;
      // Populate the mini-thumb in the result panel
      if (miniThumb) {
        miniThumb.src = state.media?.thumbnail ?? fallback;
        miniThumb.alt = thumbnail.alt;
      }
      state.media?.formats.forEach((format, index) => {
        const label = root.createElement('label');
        label.className = 'format-option';
        const radio = root.createElement('input');
        radio.type = 'radio';
        radio.name = 'format';
        radio.value = format.id;
        radio.id = `format-${String(index)}`;
        radio.setAttribute('aria-label', format.label);
        const text = root.createElement('span');
        text.className = 'quality-text';
        const name = root.createElement('strong');
        name.textContent = format.label;
        text.append(name);
        label.append(radio, text);
        (index < 4 ? formats : extraFormats).append(label);
      });
    }
    result.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((radio) => {
      radio.checked = radio.value === state.formatId;
      radio.disabled = state.status !== 'ready';
    });
    progressCard.hidden = !downloading;
    // Progress heading: distinguish start from active and 100%
    progressHeading.textContent = photoMode
      ? state.status === 'starting-download'
        ? 'Preparing image…'
        : 'Downloading image…'
      : audioMode && state.progress?.phase === 'converting'
        ? 'Converting audio to MP3…'
        : audioMode && state.status === 'starting-download'
          ? 'Preparing MP3…'
          : state.status === 'starting-download' || state.progress?.percent === 100
            ? 'Preparing your download\u2026'
            : 'Downloading\u2026';
    const percent = state.progress?.percent;
    const isIndeterminate = percent === undefined;
    if (isIndeterminate) progress.removeAttribute('value');
    else progress.value = percent;
    // Drive the custom CSS progress fill via CSS custom property
    if (progFill) {
      progFill.style.setProperty(
        '--rp-progress',
        isIndeterminate ? '1' : String(percent / 100),
      );
    }
    if (progTrack) progTrack.dataset.indeterminate = String(isIndeterminate);
    // Build clean metrics row
    metrics.replaceChildren();
    const addMetric = (text: string, sep = false) => {
      if (sep && metrics.childElementCount > 0) {
        const dot = root.createElement('span');
        dot.textContent = '\u00b7';
        dot.setAttribute('aria-hidden', 'true');
        metrics.append(dot);
      }
      const item = root.createElement('p');
      item.textContent = text;
      metrics.append(item);
    };
    if (!isIndeterminate) addMetric(`${String(percent)}%`);
    if (state.progress?.downloadedBytes !== undefined)
      addMetric(fmtBytes(state.progress.downloadedBytes), true);
    if (state.progress?.sizeBytes !== undefined && state.progress.sizeBytes > 0)
      addMetric(`/ ${fmtBytes(state.progress.sizeBytes)}`, false);
    if (state.progress?.speedBytesPerSecond !== undefined)
      addMetric(fmtSpeed(state.progress.speedBytesPerSecond), true);
    if (isIndeterminate) addMetric('Preparing\u2026');

    if (lastStatus !== state.status) {
      if (state.status === 'error') {
        if (state.invalidUrl) input.focus();
        else status.focus();
      } else if (state.status === 'ready') {
        // Scroll the workspace into view so its top sits just below the sticky
        // header (scroll-margin-top: 96px is already set in CSS). Then move
        // keyboard focus to the analyzed video's heading. We set
        // preventScroll:true so that the focus() call does NOT trigger a
        // second, competing scroll event.
        if ((!photoMode || lastStatus === 'analyzing') && resultWorkspace) {
          const win = root.defaultView;
          const prefersReduced =
            typeof win?.matchMedia === 'function'
              ? win.matchMedia('(prefers-reduced-motion: reduce)').matches
              : false;
          if (typeof resultWorkspace.scrollIntoView === 'function') {
            resultWorkspace.scrollIntoView({
              behavior: prefersReduced ? 'auto' : 'smooth',
              block: 'start',
            });
          }
        }
        if (!photoMode || lastStatus === 'analyzing')
          resultHeading.focus({ preventScroll: true });
        else if (state.message.startsWith('Download requested.'))
          get('#photo-download').focus({ preventScroll: true });
      } else if (state.status === 'analyzing') analyzing.focus();
      else if (downloading) progressHeading.focus({ preventScroll: photoMode });
      else if (state.status === 'completed')
        get('#completed-title').focus({ preventScroll: photoMode });
      else if (state.status === 'download-requested') status.focus();
      else if (state.status === 'idle' && lastStatus !== 'idle') input.focus();
    }
    lastStatus = state.status;
  };
  const unsubscribe = controller.subscribe(render);
  form.noValidate = true;
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (isBusy(controller.getState().status)) return;
      clipboardVersion += 1;
      if (controller.getState().url !== input.value) controller.setUrl(input.value);
      void controller.analyze();
    },
    events,
  );
  input.addEventListener(
    'input',
    () => {
      clipboardVersion += 1;
      controller.setUrl(input.value);
    },
    events,
  );
  clear.addEventListener(
    'click',
    () => {
      clipboardVersion += 1;
      input.value = '';
      controller.setUrl('');
      input.focus();
    },
    events,
  );
  cancel.addEventListener(
    'click',
    () => {
      controller.cancel();
    },
    events,
  );
  paste.addEventListener(
    'click',
    () => {
      const version = ++clipboardVersion;
      void (async () => {
        try {
          if (!clipboard) throw new Error('Clipboard unavailable');
          const text = await clipboard.readText();
          if (version !== clipboardVersion || isBusy(controller.getState().status))
            return;
          input.value = text;
          controller.setUrl(text, 'Link pasted. Select Get video to continue.');
        } catch {
          if (version !== clipboardVersion || isBusy(controller.getState().status))
            return;
          controller.setUrl(
            input.value,
            'Clipboard access is unavailable. Paste your link directly into the field.',
          );
        }
        input.focus();
      })();
    },
    events,
  );
  result.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        if (
          target.name === 'download-type' &&
          (target.value === 'mp4' || target.value === 'mp3')
        )
          controller.selectDownloadType(target.value);
        else if (target.name === 'format') controller.selectFormat(target.value);
      }
    },
    events,
  );
  download.addEventListener(
    'click',
    () => {
      void controller.download();
    },
    events,
  );
  get<HTMLButtonElement>('.progress-cancel').addEventListener(
    'click',
    () => controller.cancel(),
    events,
  );
  save.addEventListener('click', () => controller.save(), events);
  get<HTMLButtonElement>('.another-button').addEventListener(
    'click',
    () => {
      input.value = '';
      controller.setUrl('');
      input.focus();
    },
    events,
  );
  get<HTMLButtonElement>('.choose-button').addEventListener(
    'click',
    () => controller.chooseQuality(),
    events,
  );
  get<HTMLButtonElement>('.retry-button').addEventListener(
    'click',
    () => {
      if (controller.getState().media) {
        controller.chooseQuality();
        void controller.download();
      } else void controller.analyze();
    },
    events,
  );
  const instance = {
    controller,
    destroy() {
      clipboardVersion += 1;
      eventController.abort();
      unsubscribe();
      controller.destroy();
      instances.delete(root);
    },
  };
  instances.set(root, instance);
  root.defaultView?.addEventListener('pagehide', () => instance.destroy(), events);
  return instance;
}
