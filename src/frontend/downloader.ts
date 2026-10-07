import { createMockAdapter } from './mock-adapter.js';
import { createDownloaderController, isBusy, type State } from './state-machine.js';
import type { DownloaderAdapter } from './contracts.js';

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
  const paste = get<HTMLButtonElement>('.paste-button');
  const clear = get<HTMLButtonElement>('.clear-button');
  const cancel = get<HTMLButtonElement>('.cancel-button');
  const status = get('#form-status');
  const result = get('#result-card');
  const resultHeading = get('#result-title');
  const formats = get('#format-options');
  const download = get<HTMLButtonElement>('.download-button');
  const progressCard = get('#progress-card');
  const progressHeading = get('#progress-title');
  const progress = get<HTMLProgressElement>('#download-progress');
  const metrics = get('#progress-metrics');
  const analyzing = get('#analyzing-indicator');
  let lastStatus = 'idle';
  let renderedMedia: State['media'] = null;
  let clipboardVersion = 0;
  const eventController = new AbortController();
  const events = { signal: eventController.signal };
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
    adapter: options.adapter ?? createMockAdapter(),
    requestDownload,
  });

  const render = (state: State) => {
    const busy = isBusy(state.status);
    const downloading = ['starting-download', 'downloading'].includes(state.status);
    get('#downloader').dataset.state = state.status;
    form.setAttribute('aria-busy', String(busy));
    input.disabled = busy;
    input.setAttribute('aria-invalid', String(state.invalidUrl));
    submit.disabled = busy;
    paste.disabled = busy;
    cancel.hidden = !busy;
    cancel.textContent = downloading ? 'Cancel download request' : 'Cancel analysis';
    clear.disabled = !input.value && !busy;
    submit.textContent =
      state.status === 'validating'
        ? 'Checking link…'
        : state.status === 'analyzing'
          ? 'Analyzing…'
          : 'Check link';
    status.textContent = state.message;
    analyzing.hidden = !['validating', 'analyzing'].includes(state.status);
    result.hidden =
      !state.media ||
      !['ready', 'starting-download', 'downloading', 'download-requested'].includes(
        state.status,
      );
    download.disabled = state.status !== 'ready' || !state.formatId;
    if (state.media !== renderedMedia) {
      formats.replaceChildren();
      renderedMedia = state.media;
      resultHeading.textContent = state.media?.title ?? 'Available video formats';
      state.media?.formats.forEach((format, index) => {
        const label = root.createElement('label');
        label.className = 'format-option';
        const radio = root.createElement('input');
        radio.type = 'radio';
        radio.name = 'format';
        radio.value = format.id;
        radio.id = `format-${String(index)}`;
        const text = root.createElement('span');
        text.textContent = format.label;
        label.append(radio, text);
        if (format.width !== undefined && format.height !== undefined) {
          const resolution = root.createElement('small');
          resolution.textContent = `${String(format.width)} × ${String(format.height)} source pixels`;
          label.append(resolution);
        }
        if (format.sizeBytes !== undefined) {
          const size = root.createElement('small');
          size.textContent = `${String(format.sizeBytes)} bytes`;
          label.append(size);
        }
        formats.append(label);
      });
    }
    formats.querySelectorAll<HTMLInputElement>('input').forEach((radio) => {
      radio.checked = radio.value === state.formatId;
      radio.disabled = state.status !== 'ready';
    });
    progressCard.hidden = !downloading;
    progressHeading.textContent =
      state.status === 'starting-download'
        ? 'Starting download request'
        : 'Preparing your file';
    const percent = state.progress?.percent;
    if (percent === undefined) progress.removeAttribute('value');
    else progress.value = percent;
    metrics.replaceChildren();
    const addMetric = (value: string) => {
      const item = root.createElement('p');
      item.textContent = value;
      metrics.append(item);
    };
    if (percent !== undefined) addMetric(`${String(percent)}%`);
    if (state.progress?.speedBytesPerSecond !== undefined)
      addMetric(`${String(state.progress.speedBytesPerSecond)} bytes/s`);
    if (state.progress?.sizeBytes !== undefined)
      addMetric(`${String(state.progress.sizeBytes)} bytes total`);
    if (percent === undefined) addMetric('Progress is unknown.');

    if (lastStatus !== state.status) {
      if (state.status === 'error') {
        if (state.invalidUrl) input.focus();
        else status.focus();
      } else if (state.status === 'ready') resultHeading.focus();
      else if (state.status === 'analyzing') analyzing.focus();
      else if (downloading) progressHeading.focus();
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
          controller.setUrl(text, 'Link pasted. Check the link to continue.');
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
  formats.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) controller.selectFormat(target.value);
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
  return instance;
}
