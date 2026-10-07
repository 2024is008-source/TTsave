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
estimated. A future successful job supplies a relative `/api/v1/downloads/<jobId>/file` URL.

`src/frontend/api-adapter.ts` calls the versioned backend API and reads job events.
The in-memory backend returns explicitly labelled mock analysis and queued jobs.
The adapter cancels mock jobs and reports that files cannot be produced. Source
metrics remain unknown; progress and successful file handoffs occur only in test
fixtures. See `API.md` for the contract and mock limitations.

Form tests use rendered EJS with jsdom. State-machine tests cover transitions,
validation, duplicate requests, cancellation, late responses and browser handoff.
Playwright also checks native keyboard selection, cancellation and real-data
progress rendering. Theme preferences persist in local storage independently of
the downloader.
