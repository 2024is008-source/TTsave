# Downloader frontend

The controller in `src/frontend/state-machine.ts` owns these states:

| State              | Trigger and behavior                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| idle               | Accept a link, paste clipboard text or clear the form.                                           |
| validating         | Validate the entered link with Zod before calling the adapter.                                   |
| analyzing          | Await analysis with an abort signal and accessible activity indicator.                           |
| ready              | Render only returned formats as native radio controls.                                           |
| starting-download  | Request a download job for the selected returned format.                                         |
| downloading        | Await that job; show indeterminate progress unless measured data arrives.                        |
| completed          | Show verified quality and actual size, and wait for explicit Save MP4.                           |
| download-requested | Hand a validated local download URL to the browser. This does not confirm that a file was saved. |
| error              | Announce the error and preserve the entered link for correction or retry.                        |

Busy operations reject duplicate submissions. Cancel and Clear abort the active
operation; generation checks also ignore late responses from adapters that do
not honor cancellation. Cancel returns to the available formats during a
download, or to idle during analysis. Clear removes the link and result.

`src/frontend/contracts.ts` defines the adapter and validates its responses.
Analysis supplies a media ID and formats with IDs and labels. Dimensions and
sizes are optional. Download start supplies a job ID; waiting may report optional
percentage, bytes per second and total bytes. Unknown values are omitted, not
estimated. A completed job supplies a short-lived relative file URL with a
one-use capability token.

`src/frontend/api-adapter.ts` calls the versioned backend API and reads job events.
Job creation returns a capability token. The adapter sends it as a Bearer token
when reading SSE or cancelling a job. It uses fetch streaming so credentials stay
out of event URLs. Clear, Cancel, failed streams and aborted requests cancel the
job; the last event subscriber disconnect also cancels active work. A completed
job keeps its one-use file URL until the user chooses Save MP4. Expired capabilities
produce a friendly retry state. The interface announces the request,
without claiming the browser saved the file. `downloadAvailable: false` still
disables unsupported requests. Mock metadata and jobs are confined to tests.
See `API.md` and `DOWNLOAD_JOBS.md` for contracts and operational limits.

Form tests use rendered EJS with jsdom. State-machine tests cover transitions,
validation, duplicate requests, cancellation, late responses and browser handoff.
Playwright also checks native keyboard selection, cancellation and real-data
progress rendering. Theme preferences persist in local storage independently of
the downloader.
