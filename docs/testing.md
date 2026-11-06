# Test checklist

Run `npm run typecheck` and `npm run build` before deployment.

## Desktop

- [ ] Load an H.264 MP4 and verify duration and dimensions.
- [ ] Extract with interval mode; confirm timestamps and frame count.
- [ ] Extract with target-count mode; confirm the requested count.
- [ ] Add custom timestamps and verify they are included once and sorted.
- [ ] Toggle blur filtering and compare skipped-frame metrics.
- [ ] Export JPEG at more than one quality setting.
- [ ] Export PNG and confirm file extension and format.
- [ ] Select/deselect individual frames and download one image.
- [ ] Download a ZIP and inspect its contents.
- [ ] Cancel an extraction and confirm already captured frames remain usable.
- [ ] Test an unsupported/corrupt video and confirm a useful error appears.

## Android

- [ ] Open the deployed HTTPS URL in Chrome.
- [ ] Select a video from the gallery or file picker.
- [ ] Confirm video preview, metadata, and playback.
- [ ] Extract a short MP4 at 2-second intervals.
- [ ] Preview an extracted frame.
- [ ] Download one image and a ZIP; verify both appear in Downloads.
- [ ] Repeat with a larger video and observe memory/performance.
- [ ] Confirm layout controls remain usable at 320–430 px viewport widths.

## Known platform limitations

Video format support depends on the browser's decoder and the codecs inside the container. Test real devices before describing MOV/HEVC or AVI as supported. Browser memory and download behavior also vary by device.

## Video Layout Studio

- [ ] Open Video Layout Studio from the application navigation without losing the extractor workflow.
- [ ] Load JPEG, PNG, WebP, AVIF, GIF, BMP, and SVG images on browsers that support their decoders.
- [ ] Try TIFF and HEIC/HEIF files; confirm supported browsers decode them and unsupported browsers show a useful message.
- [ ] Drag and drop an image and a video; verify the file picker and drag/drop use the same validation.
- [ ] Adjust blur, darkness, background scale, and foreground scale; verify the live 16:9 preview updates.
- [ ] Adjust crop zoom and vertical position; verify the visible composition changes.
- [ ] Edit the multi-panel headline, caption, and accent theme; verify the preview updates.
- [ ] Compare all three layout methods at desktop and mobile widths.
- [ ] Export image compositions as PNG, JPEG, and WebP; verify file extensions and actual MIME types.
- [ ] Play a source video in the preview, then export a WebM; verify the output duration, visual composition, and audio when captureStream exposes an audio track.
- [ ] Stop an export manually and confirm the file downloads.
- [ ] Test unsupported media and browsers without MediaRecorder; confirm actionable messages appear.
- [ ] Confirm all processing stays local and no media request is sent to the Worker.
