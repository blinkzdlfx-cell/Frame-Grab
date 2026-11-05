# Architecture

## Runtime and storage boundaries

- React + TypeScript + Vite provide the client application.
- HTMLVideoElement decodes the selected local file; HTMLCanvasElement captures frames.
- JSZip packages selected images locally.
- Cloudflare Workers serves static assets only. Video and screenshot processing never pass through the Worker.
- IndexedDB stores project metadata, settings, recovery checkpoints, screenshot Blobs, and a temporary source-video Blob while a project is a draft or extraction is active/paused.
- A completed project's source-video Blob is automatically removed. Screenshots and project metadata remain available.
- IndexedDB is the only storage implementation in this release. There is no cloud-storage provider abstraction or remote backup integration yet. Accounts, authentication, cloud backup, and the planned per-account 500 MB backup allowance are deferred; no cloud upload is performed.

## Project lifecycle

1. Selecting a video creates a local project with a default title and saved extraction settings.
2. The original video Blob is stored temporarily in IndexedDB for refresh recovery, subject to browser quota.
3. Settings and project metadata are persisted while the user configures extraction.
4. The extraction timestamp plan and cursor are saved before processing.
5. Each accepted screenshot and its next-index recovery checkpoint are written in one IndexedDB transaction. Deterministic IDs based on project ID and timestamp-plan index make retries idempotent.
6. On refresh, the project, source video, settings, screenshots, and checkpoint are restored. An interrupted active extraction resumes from its next unprocessed timestamp when its source Blob is available.
7. If the browser cannot store the source video, the current tab can still process it, but the project is marked as requiring the source again after refresh.
8. On successful completion, the source Blob is deleted automatically to release storage. Users can also remove it manually.
9. Projects and individual screenshots can be deleted independently.

## Storage safeguards

- Storage usage and quota are displayed using the browser StorageManager estimate API where supported. These figures are estimates, not guaranteed allocations.
- Large videos trigger a confirmation before a temporary recovery copy is stored.
- When the estimated remaining quota is smaller than the source video, the user is warned before continuing.
- Quota errors are surfaced with actionable recovery guidance. Already committed screenshots remain available if a later write fails.
- Browser storage may be evicted, cleared by the user, or unavailable in private/restricted browsing modes. Local persistence cannot be guaranteed.
- The app requests persistent browser storage when supported, but the browser may deny the request.
- The legacy version-1 screenshot store is migrated into a recovered project rather than discarded.

## Extraction constraints

- Sequential extraction avoids decoding many frames concurrently and reduces peak memory pressure.
- Interval extraction is capped at 500 frames; target-count extraction is capped at 100 frames.
- Seeking has a timeout so unsupported or damaged files do not hang indefinitely.
- Browser codec support is device-dependent; the app does not promise universal MOV, HEVC, or AVI support.
- Sharpness filtering is a heuristic, not a guarantee that every retained image is perfectly sharp.
- ZIP generation runs locally and may use significant memory for large selections.

## Hosting

Cloudflare Workers Static Assets serves the built Vite application. No server-side upload endpoint, database service, R2 bucket, or cloud credentials are required for this release.