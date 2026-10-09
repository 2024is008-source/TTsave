import { ZodError } from 'zod';

import {
  downloadSchema,
  jobSchema,
  mediaSchema,
  progressSchema,
  videoUrlSchema,
  type DownloaderAdapter,
  type Media,
  type Progress,
  type Download,
  type DownloadJob,
} from './contracts.js';

export type Status =
  | 'idle'
  | 'validating'
  | 'analyzing'
  | 'ready'
  | 'starting-download'
  | 'downloading'
  | 'completed'
  | 'download-requested'
  | 'error';
export type State = {
  downloadType: 'mp4' | 'mp3' | 'image';
  status: Status;
  url: string;
  media: Media | null;
  formatId: string | null;
  progress: Progress | null;
  message: string;
  invalidUrl: boolean;
  download: Download | null;
};
export type Event =
  | { type: 'SELECT_TYPE'; downloadType: 'mp4' | 'mp3' }
  | { type: 'RESET'; url: string; message?: string }
  | { type: 'VALIDATE' }
  | { type: 'ANALYZE'; url: string }
  | { type: 'READY'; media: Media }
  | { type: 'SELECT'; formatId: string }
  | { type: 'START' }
  | { type: 'DOWNLOADING' }
  | { type: 'PROGRESS'; progress: Progress }
  | { type: 'REQUESTED' }
  | { type: 'COMPLETE'; download: Download }
  | { type: 'CHOOSE' }
  | { type: 'FAIL'; message: string; invalidUrl?: boolean }
  | { type: 'CANCEL' };

export function initialState(url = ''): State {
  return {
    downloadType: 'mp4',
    status: 'idle',
    url,
    media: null,
    formatId: null,
    progress: null,
    message: '',
    invalidUrl: false,
    download: null,
  };
}
export const isBusy = (status: Status): boolean =>
  ['validating', 'analyzing', 'starting-download', 'downloading'].includes(status);

/** Invalid or stale events leave state untouched. All transitions are event-driven. */
export function transition(state: State, event: Event): State {
  switch (event.type) {
    case 'SELECT_TYPE':
      return state.status === 'ready' &&
        state.media?.postType !== 'photo' &&
        (event.downloadType === 'mp4' || state.media?.capabilities?.mp3 === true)
        ? {
            ...state,
            downloadType: event.downloadType,
            message:
              event.downloadType === 'mp3'
                ? 'MP3 audio selected. Audio quality depends on the source.'
                : 'MP4 video selected. Choose an available source quality.',
          }
        : state;
    case 'RESET':
      return { ...initialState(event.url), message: event.message ?? '' };
    case 'VALIDATE':
      return isBusy(state.status)
        ? state
        : {
            ...initialState(state.url),
            status: 'validating',
            message: 'Checking the link…',
          };
    case 'ANALYZE':
      return state.status === 'validating'
        ? {
            ...state,
            url: event.url,
            status: 'analyzing',
            message: 'Analyzing the public video link…',
          }
        : state;
    case 'READY':
      return state.status === 'analyzing'
        ? {
            ...state,
            status: 'ready',
            media: event.media,
            downloadType: event.media.postType === 'photo' ? 'image' : 'mp4',
            formatId:
              event.media.postType === 'photo'
                ? (event.media.photos?.[0]?.id ?? null)
                : (event.media.formats[0]?.id ?? null),
            message:
              event.media.postType === 'photo'
                ? 'Select an image to download'
                : 'Video details ready. Choose an available format.',
          }
        : state;
    case 'SELECT':
      return (state.status === 'ready' ||
        (state.downloadType === 'image' &&
          ['completed', 'download-requested'].includes(state.status))) &&
        (state.media?.postType === 'photo'
          ? state.media.photos?.some((photo) => photo.id === event.formatId)
          : state.media?.formats.some((format) => format.id === event.formatId))
        ? {
            ...state,
            status: 'ready',
            formatId: event.formatId,
            ...(state.downloadType === 'image'
              ? { progress: null, download: null, message: 'Select an image to download' }
              : {}),
          }
        : state;
    case 'START':
      return state.status === 'ready' && state.formatId
        ? {
            ...state,
            status: 'starting-download',
            progress: null,
            message:
              state.downloadType === 'image'
                ? 'Preparing image…'
                : state.downloadType === 'mp3'
                  ? 'Preparing MP3…'
                  : 'Starting the download request…',
          }
        : state;
    case 'DOWNLOADING':
      return state.status === 'starting-download'
        ? {
            ...state,
            status: 'downloading',
            message:
              state.downloadType === 'image'
                ? 'Downloading image…'
                : 'Preparing the file. Progress is unknown.',
          }
        : state;
    case 'PROGRESS':
      return state.status === 'downloading'
        ? {
            ...state,
            progress: event.progress,
            message:
              state.downloadType === 'image'
                ? 'Downloading image…'
                : event.progress.phase === 'converting'
                  ? 'Converting audio to MP3…'
                  : event.progress.percent === undefined
                    ? 'Preparing the file. Progress is unknown.'
                    : `Preparing the file: ${String(event.progress.percent)}%.`,
          }
        : state;
    case 'REQUESTED':
      if (state.status === 'completed' && state.downloadType === 'image')
        return {
          ...state,
          status: 'ready',
          download: null,
          progress: null,
          message:
            'Download requested. Select another image to download. Your browser handles saving.',
        };
      return state.status === 'completed'
        ? {
            ...state,
            status: 'download-requested',
            message:
              'Download requested. Your browser will handle the file; saving is not confirmed.',
          }
        : state;
    case 'COMPLETE':
      return state.status === 'downloading'
        ? {
            ...state,
            status: 'completed',
            download: event.download,
            message:
              state.downloadType === 'image'
                ? 'Your image is ready. Select Save image to request the file.'
                : state.downloadType === 'mp3'
                  ? 'Your MP3 is ready. Select Save MP3 to request the file.'
                  : 'Your video is ready. Select Save MP4 to request the file.',
          }
        : state;
    case 'CHOOSE':
      return (state.status === 'error' ||
        (state.downloadType === 'image' &&
          ['completed', 'download-requested'].includes(state.status))) &&
        state.media
        ? {
            ...state,
            status: 'ready',
            progress: null,
            download: null,
            message:
              state.downloadType === 'image'
                ? 'Select an image to download'
                : 'Choose an available quality.',
          }
        : state;
    case 'FAIL':
      return {
        ...state,
        status: 'error',
        progress: null,
        download: null,
        message: event.message,
        invalidUrl: event.invalidUrl ?? false,
      };
    case 'CANCEL':
      return isBusy(state.status)
        ? {
            ...state,
            status: state.media ? 'ready' : 'idle',
            progress: null,
            message: 'Request cancelled. Your link has been kept.',
          }
        : state;
  }
}

type ControllerOptions = {
  adapter: DownloaderAdapter;
  requestDownload: (url: string) => void;
};

export function createDownloaderController({
  adapter,
  requestDownload,
}: ControllerOptions) {
  let state = initialState();
  let operation = 0;
  let abortController: AbortController | null = null;
  let readyJob: DownloadJob | null = null;
  const listeners = new Set<(state: State) => void>();
  const dispatch = (event: Event) => {
    const next = transition(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  };
  const invalidate = () => {
    operation += 1;
    abortController?.abort();
    abortController = null;
    if (readyJob) {
      void adapter.cancelDownload?.(readyJob).catch(() => undefined);
      readyJob = null;
    }
  };
  const fail = (error: unknown) =>
    dispatch({
      type: 'FAIL',
      message:
        error instanceof ZodError
          ? 'The server returned invalid video data. Please try again.'
          : error instanceof Error
            ? error.message
            : 'The request failed. Please try again.',
    });

  return {
    getState: () => state,
    subscribe(listener: (state: State) => void) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    setUrl(url: string, message = '') {
      invalidate();
      dispatch({ type: 'RESET', url, message });
    },
    selectFormat(formatId: string) {
      if (
        state.downloadType === 'image' &&
        ['completed', 'download-requested'].includes(state.status) &&
        state.media?.photos?.some((photo) => photo.id === formatId)
      )
        invalidate();
      dispatch({ type: 'SELECT', formatId });
    },
    selectDownloadType(downloadType: 'mp4' | 'mp3') {
      dispatch({ type: 'SELECT_TYPE', downloadType });
    },
    chooseQuality() {
      if (
        state.downloadType === 'image' &&
        ['completed', 'download-requested'].includes(state.status)
      )
        invalidate();
      dispatch({ type: 'CHOOSE' });
    },
    save() {
      if (state.status !== 'completed' || !state.download) return;
      if (
        state.download.expiresAt !== undefined &&
        state.download.expiresAt <= Date.now()
      ) {
        invalidate();
        fail(
          new Error(
            'The prepared file has expired. Try again to prepare a new download.',
          ),
        );
        return;
      }
      try {
        requestDownload(state.download.url);
        readyJob = null;
        dispatch({ type: 'REQUESTED' });
      } catch {
        invalidate();
        fail(new Error('Your browser could not request the file. Please try again.'));
      }
    },
    cancel() {
      invalidate();
      dispatch({ type: 'CANCEL' });
    },
    destroy() {
      invalidate();
      listeners.clear();
    },
    async analyze() {
      if (isBusy(state.status)) return;
      invalidate();
      const current = operation;
      dispatch({ type: 'VALIDATE' });
      const validation = videoUrlSchema.safeParse(state.url);
      if (!validation.success) {
        dispatch({
          type: 'FAIL',
          message:
            validation.error.issues[0]?.message ??
            'Enter a public TikTok video link using HTTPS.',
          invalidUrl: true,
        });
        return;
      }
      abortController = new AbortController();
      const signal = abortController.signal;
      dispatch({ type: 'ANALYZE', url: validation.data });
      try {
        const media = mediaSchema.parse(await adapter.analyze(validation.data, signal));
        if (current === operation) dispatch({ type: 'READY', media });
      } catch (error) {
        if (current === operation) {
          if (signal.aborted) dispatch({ type: 'CANCEL' });
          else fail(error);
        }
      } finally {
        if (current === operation) abortController = null;
      }
    },
    async download() {
      if (
        state.status !== 'ready' ||
        !state.media ||
        !state.formatId ||
        state.media.downloadAvailable === false ||
        (state.downloadType === 'mp3' && state.media.capabilities?.mp3 !== true)
      )
        return;
      invalidate();
      const current = operation;
      const mediaId = state.media.id;
      const formatId = state.formatId;
      abortController = new AbortController();
      const signal = abortController.signal;
      dispatch({ type: 'START' });
      try {
        const job = jobSchema.parse(
          await adapter.startDownload(
            mediaId,
            formatId,
            signal,
            state.downloadType,
            ...(state.downloadType === 'image' ? [state.media.capability] : []),
          ),
        );
        if (current !== operation) return;
        dispatch({ type: 'DOWNLOADING' });
        const download = downloadSchema.parse(
          await adapter.waitForDownload(job, signal, (data) => {
            if (current !== operation) return;
            const progress = progressSchema.safeParse(data);
            if (progress.success) dispatch({ type: 'PROGRESS', progress: progress.data });
          }),
        );
        if (current !== operation) return;
        readyJob = job;
        dispatch({ type: 'COMPLETE', download });
      } catch (error) {
        if (current === operation) {
          if (signal.aborted) dispatch({ type: 'CANCEL' });
          else fail(error);
        }
      } finally {
        if (current === operation) abortController = null;
      }
    },
  };
}
