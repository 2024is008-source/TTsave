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
} from './contracts.js';

export type Status =
  | 'idle'
  | 'validating'
  | 'analyzing'
  | 'ready'
  | 'starting-download'
  | 'downloading'
  | 'download-requested'
  | 'error';
export type State = {
  status: Status;
  url: string;
  media: Media | null;
  formatId: string | null;
  progress: Progress | null;
  message: string;
  invalidUrl: boolean;
};
export type Event =
  | { type: 'RESET'; url: string; message?: string }
  | { type: 'VALIDATE' }
  | { type: 'ANALYZE'; url: string }
  | { type: 'READY'; media: Media }
  | { type: 'SELECT'; formatId: string }
  | { type: 'START' }
  | { type: 'DOWNLOADING' }
  | { type: 'PROGRESS'; progress: Progress }
  | { type: 'REQUESTED' }
  | { type: 'FAIL'; message: string; invalidUrl?: boolean }
  | { type: 'CANCEL' };

export function initialState(url = ''): State {
  return {
    status: 'idle',
    url,
    media: null,
    formatId: null,
    progress: null,
    message: '',
    invalidUrl: false,
  };
}
export const isBusy = (status: Status): boolean =>
  ['validating', 'analyzing', 'starting-download', 'downloading'].includes(status);

/** Invalid or stale events leave state untouched. All transitions are event-driven. */
export function transition(state: State, event: Event): State {
  switch (event.type) {
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
            formatId: event.media.formats[0]?.id ?? null,
            message: 'Video details ready. Choose an available format.',
          }
        : state;
    case 'SELECT':
      return state.status === 'ready' &&
        state.media?.formats.some((format) => format.id === event.formatId)
        ? { ...state, formatId: event.formatId }
        : state;
    case 'START':
      return state.status === 'ready' && state.formatId
        ? {
            ...state,
            status: 'starting-download',
            progress: null,
            message: 'Starting the download request…',
          }
        : state;
    case 'DOWNLOADING':
      return state.status === 'starting-download'
        ? {
            ...state,
            status: 'downloading',
            message: 'Preparing the file. Progress is unknown.',
          }
        : state;
    case 'PROGRESS':
      return state.status === 'downloading'
        ? {
            ...state,
            progress: event.progress,
            message:
              event.progress.percent === undefined
                ? 'Preparing the file. Progress is unknown.'
                : `Preparing the file: ${String(event.progress.percent)}%.`,
          }
        : state;
    case 'REQUESTED':
      return state.status === 'downloading'
        ? {
            ...state,
            status: 'download-requested',
            message:
              'Download requested. Your browser will handle the file; saving is not confirmed.',
          }
        : state;
    case 'FAIL':
      return {
        ...state,
        status: 'error',
        progress: null,
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
      dispatch({ type: 'SELECT', formatId });
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
        state.media.downloadAvailable === false
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
          await adapter.startDownload(mediaId, formatId, signal),
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
        requestDownload(download.url);
        dispatch({ type: 'REQUESTED' });
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
