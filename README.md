# FrameGrab

FrameGrab is a privacy-focused, browser-based video frame extractor. It turns a local video into a set of still images without requiring manual screenshots, cropping, or a media upload service.

Select a video, choose an extraction method, review the captured frames, and download individual images or a ZIP archive. Video decoding and frame extraction happen locally in the browser.

## Features

### Video Layout Studio
- Compose still images and videos into 16:9 widescreen layouts.
- Choose blurred background, crop and zoom, or multi-panel sidebar compositions.
- Adjust blur, background darkness, scale, crop position, zoom, sidebar headline, caption, and accent theme with a live preview.
- Compare all three composition methods side by side.
- Export still images as PNG, JPEG, or WebP; render video compositions locally as WebM with source audio when browser capture APIs expose it.
- Accept common image extensions including JPEG/JPG/JFIF, PNG/APNG, WebP, AVIF, GIF, BMP, ICO, SVG, TIFF, and HEIC/HEIF; actual decoding depends on browser support. Unsupported codecs or image formats show a clear error.


### Video extraction
- Local video preview and metadata detection
- Extract frames at a time interval or target frame count
- Add exact timestamps in seconds
- Best-effort sharpness filtering to skip some blurry frames
- Extract and save frames as JPEG, PNG, or WebP, with adjustable JPEG/WebP quality
- Export selected gallery images in their original formats or convert the entire ZIP to JPEG, PNG, or WebP
- Use descriptive filenames containing the project name, frame number, timestamp, and image dimensions
- Sequential processing with progress reporting and cancellation

### Projects and gallery
- Keep separate extraction projects with editable project names
- Browse each project's saved screenshots
- Preview images at full size and navigate in extraction order
- Select and download individual images or export a project's selection as a ZIP
- Delete individual images or entire projects

### Local storage and recovery
- Save projects, settings, screenshots, and extraction checkpoints in browser IndexedDB
- Restore saved projects after a page refresh when browser storage is available
- Resume interrupted extraction when its temporary source video is still available
- Remove the original video manually, or let FrameGrab remove it automatically after successful extraction
- View estimated browser storage usage and quota where supported
- Receive a confirmation before saving large source videos and a warning when estimated free space may be insufficient

## Important storage notes

FrameGrab stores project data in the browser on the current device. It does not currently provide accounts, cloud backup, or cross-device synchronization.

Browser storage is not guaranteed permanent storage. A browser or device can clear or evict site data, private browsing may restrict storage, and the browser may deny a persistent-storage request. The displayed usage and quota are estimates supplied by the browser, not a guaranteed allocation.

If a project says its source video is needed, select the original video again to continue or resume. Removing the source video does not delete screenshots already saved in the project.

Cloud backup and the proposed 500 MB per-account allowance are future work and are not part of the current release.

## Development

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

## Verify and build

```bash
npm run typecheck
npm run build
npm run preview
```

## Deploy to Cloudflare Workers

The Worker serves the static Vite build from `dist/`. It does not process videos or store user files.

```bash
npx wrangler login
npm run deploy
```

The first deployment may ask you to create or select the Cloudflare account.

## Browser and file compatibility

Video decoding depends on the codecs supported by the browser and device. MP4 with H.264 video is generally the safest recommendation, but support still varies by browser. MOV/HEVC and AVI support is not universal. A file extension alone does not guarantee that a video can be decoded.

Frame extraction and ZIP generation run in the browser. Very large videos, large image collections, or large ZIP exports can use substantial device memory and storage. The sharpness filter is heuristic; it cannot guarantee that every retained frame is perfectly sharp.

## Privacy

Video files are read through the browser File API and decoded by the local HTML video element. Extracted images and ZIP archives are generated locally. The application does not upload videos or screenshots to a server in the current release.
