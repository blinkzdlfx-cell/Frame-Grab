# Architecture

## Runtime

- React + TypeScript + Vite provide the client application.
- Tailwind CSS v4 is available for utility styling; the interface's component-level visual system is defined in `src/index.css`.
- HTMLVideoElement decodes the selected local file.
- HTMLCanvasElement captures a decoded frame.
- JSZip packages selected image blobs.
- Cloudflare Workers serves the static `dist/` assets. The Worker does not receive video data.

## Extraction pipeline

1. The browser creates an object URL for the selected File.
2. Metadata provides duration and intrinsic dimensions.
3. The selected strategy creates timestamps. Custom timestamps are merged and deduplicated.
4. The video seeks to each timestamp sequentially.
5. Canvas draws the decoded frame at its native dimensions.
6. Optional sharpness estimation runs on a downscaled sample.
7. Canvas exports a JPEG or PNG Blob; the gallery displays an object URL.
8. ZIP generation packages selected Blobs locally.

## Constraints and safeguards

- Sequential extraction avoids decoding many frames concurrently and reduces peak memory pressure.
- Interval extraction is capped at 500 frames per run.
- Target-count extraction is capped at 100 frames.
- Seeking has a timeout so unsupported or damaged files do not hang indefinitely.
- Browser codec support is device-dependent; the app must not promise universal MOV, HEVC, or AVI support.
- Large videos may be expensive for low-memory phones. The UI warns when a selected file exceeds 350 MB.
- Object URLs are revoked when frames or videos are replaced and when the app unmounts.

## Hosting

Cloudflare Workers Static Assets serves the built Vite application. All processing remains client-side. No secrets, environment variables, database, R2 bucket, or server-side upload endpoint are required.