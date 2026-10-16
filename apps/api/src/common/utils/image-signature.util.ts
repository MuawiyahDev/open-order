export type SupportedImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif';

export interface ImageDimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89_SIGNATURE = Buffer.from('GIF89a', 'ascii');
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');

function positiveDimensions(
  width: number,
  height: number,
): ImageDimensions | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function detectImageMimeType(
  buffer: Buffer,
): SupportedImageMimeType | null {
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  if (
    buffer.subarray(0, 6).equals(GIF87_SIGNATURE) ||
    buffer.subarray(0, 6).equals(GIF89_SIGNATURE)
  ) {
    return 'image/gif';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_SIGNATURE) &&
    buffer.subarray(8, 12).equals(WEBP_SIGNATURE)
  ) {
    return 'image/webp';
  }

  return null;
}

export function readImageDimensions(
  buffer: Buffer,
  mimeType: SupportedImageMimeType,
): ImageDimensions | null {
  switch (mimeType) {
    case 'image/png':
      return readPngDimensions(buffer);
    case 'image/gif':
      return readGifDimensions(buffer);
    case 'image/jpeg':
      return readJpegDimensions(buffer);
    case 'image/webp':
      return readWebpDimensions(buffer);
    default:
      return null;
  }
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) {
    return null;
  }

  return positiveDimensions(
    buffer.readUInt32BE(16),
    buffer.readUInt32BE(20),
  );
}

function readGifDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) {
    return null;
  }

  return positiveDimensions(
    buffer.readUInt16LE(6),
    buffer.readUInt16LE(8),
  );
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2;

  while (offset + 9 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null;
    }

    const marker = buffer[offset + 1];

    // Standalone markers without a length payload.
    if (
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd8)
    ) {
      offset += 2;
      continue;
    }

    // End of image or start of scan: no frame header will follow.
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);

    if (segmentLength < 2) {
      return null;
    }

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isStartOfFrame) {
      return positiveDimensions(
        buffer.readUInt16BE(offset + 7),
        buffer.readUInt16BE(offset + 5),
      );
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 16) {
    return null;
  }

  const chunkType = buffer.toString('ascii', 12, 16);

  if (chunkType === 'VP8 ') {
    if (buffer.length < 30) {
      return null;
    }

    // Lossy bitstream: 3-byte frame tag, sync code, then 14-bit dimensions.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return null;
    }

    return positiveDimensions(
      buffer.readUInt16LE(26) & 0x3fff,
      buffer.readUInt16LE(28) & 0x3fff,
    );
  }

  if (chunkType === 'VP8L') {
    if (buffer.length < 25) {
      return null;
    }

    if (buffer[20] !== 0x2f) {
      return null;
    }

    const bits = buffer.readUInt32LE(21);

    return positiveDimensions(
      (bits & 0x3fff) + 1,
      ((bits >> 14) & 0x3fff) + 1,
    );
  }

  if (chunkType === 'VP8X') {
    if (buffer.length < 30) {
      return null;
    }

    return positiveDimensions(
      buffer.readUIntLE(24, 3) + 1,
      buffer.readUIntLE(27, 3) + 1,
    );
  }

  return null;
}
