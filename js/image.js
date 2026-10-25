// Turns a camera or gallery photo into an upright JPEG that is cheap to store. Measuring wants detail, so the photo is kept
// larger than in a document app: 2400 px on the long side is about 0.5 to 1 MB, and the corners can still be placed to a pixel.
export const MAX_SIDE = 2400;     // longest side of the stored photo, in pixels
export const THUMB_SIDE = 360;    // longest side of the list thumbnail
export const QUALITY = 0.86;

/** Reads the EXIF "Orientation" tag (1 to 8) from the start of a JPEG. 1 means upright, or unknown. */
export function parseOrientation(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 4 < bytes.length) {
    if (bytes[p] !== 0xff) return 1;
    const marker = bytes[p + 1];
    if (marker === 0xda || marker === 0xd9) return 1;           // image data starts: there was no EXIF block
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    const isExif = marker === 0xe1 && bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69
      && bytes[p + 7] === 0x66 && bytes[p + 8] === 0 && bytes[p + 9] === 0;
    if (isExif) {
      const t = p + 10;                                          // start of the TIFF header
      const little = bytes[t] === 0x49;                          // "II" = little endian, "MM" = big endian
      const u16 = (o) => (little ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
      const u32 = (o) => (little
        ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
        : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (u16(entry) === 0x0112) { const v = u16(entry + 8); return v >= 1 && v <= 8 ? v : 1; }
      }
      return 1;
    }
    p += 2 + length;
  }
  return 1;
}

/** Inserts an EXIF block saying "rotate 90 degrees" into a JPEG. Used only to test the browser (and by the tests). */
export function withExifOrientation(jpegBytes, orientation) {
  const exif = Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                     // APP1 "Exif"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,                                 // TIFF header, big endian, IFD at 8
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,   // 1 entry: Orientation
    0x00, 0x00, 0x00, 0x00,                                                         // no next IFD
  ]);
  const out = new Uint8Array(jpegBytes.length + exif.length);
  out.set(jpegBytes.subarray(0, 2), 0);
  out.set(exif, 2);
  out.set(jpegBytes.subarray(2), 2 + exif.length);
  return out;
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) =>
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The photo could not be saved.'))), type, quality));

async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error('That photo could not be read. Please try another one.');
  }
}

let autoRotates;
/** Do this browser's <img> and canvas apply EXIF rotation by themselves? Newer ones do; older ones do not. Found out once, by testing. */
export function browserRotatesExif() {
  autoRotates ??= (async () => {
    try {
      const canvas = Object.assign(document.createElement('canvas'), { width: 2, height: 1 });
      canvas.getContext('2d').fillRect(0, 0, 2, 1);
      const bytes = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer());
      const { img, release } = await loadImage(new Blob([withExifOrientation(bytes, 6)], { type: 'image/jpeg' }));
      const rotated = img.naturalWidth === 1 && img.naturalHeight === 2;       // 2x1 turned 90 degrees is 1x2
      release();
      return rotated;
    } catch { return true; }
  })();
  return autoRotates;
}

function orientationTransform(o, w, h) {
  return { 2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h], 5: [0, 1, 1, 0, 0, 0],
           6: [0, 1, -1, 0, h, 0], 7: [0, -1, -1, 0, h, w], 8: [0, -1, 1, 0, 0, w] }[o];
}

/**
 * Decodes an image, turns it the right way up, and draws it onto a canvas no larger than `maxSide`.
 * `assumeAutoRotated` and `forceOrientation` exist so the tests can exercise the by-hand rotation path in a browser that rotates by itself.
 */
async function renderUpright(file, { maxSide, fill, assumeAutoRotated, forceOrientation }) {
  const manual = !(assumeAutoRotated ?? await browserRotatesExif());
  const orientation = forceOrientation ?? (manual ? parseOrientation(new Uint8Array(await file.slice(0, 131072).arrayBuffer())) : 1);

  const { img, release } = await loadImage(file);
  try {
    const sw = img.naturalWidth, sh = img.naturalHeight;                    // stored (unrotated) size when we rotate by hand
    const ow = orientation >= 5 ? sh : sw, oh = orientation >= 5 ? sw : sh; // size as it should appear
    const scale = Math.min(1, maxSide / Math.max(ow, oh));
    const width = Math.max(1, Math.round(ow * scale)), height = Math.max(1, Math.round(oh * scale));

    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: !fill });
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, width, height); }   // JPEG has no transparency: transparent areas become white, not black
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(scale, scale);
    if (orientation > 1) ctx.transform(...orientationTransform(orientation, sw, sh));
    ctx.drawImage(img, 0, 0);
    return { canvas, width, height };
  } finally {
    release();
  }
}

/**
 * @param {Blob} file  a photo from the camera or gallery
 * @returns {{photo: Blob, thumb: Blob, width: number, height: number}}  upright JPEGs, longest side <= 2400 px (thumbnail 360 px)
 */
export async function processPhoto(file, options = {}) {
  const { canvas, width, height } = await renderUpright(file, { maxSide: MAX_SIDE, fill: '#fff', ...options });
  const photo = await toBlob(canvas, 'image/jpeg', QUALITY);
  const ts = Math.min(1, THUMB_SIDE / Math.max(width, height));
  const small = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(width * ts)), height: Math.max(1, Math.round(height * ts)) });
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  const thumb = await toBlob(small, 'image/jpeg', QUALITY);
  canvas.width = canvas.height = small.width = small.height = 0;          // let go of the pixel memory straight away (matters on phones)
  return { photo, thumb, width, height };
}
