import {
  detectImageMimeType,
  readImageDimensions,
} from './image-signature.util.js';

function pngBuffer(width = 16, height = 8): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gifBuffer(width = 4, height = 2, version = 'GIF89a'): Buffer {
  const buffer = Buffer.alloc(14);
  buffer.write(version, 0, 'ascii');
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function jpegBuffer(
  width = 20,
  height = 10,
  { withApp0 = true }: { withApp0?: boolean } = {},
): Buffer {
  const parts: number[] = [0xff, 0xd8];

  if (withApp0) {
    parts.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);
  }

  parts.push(
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  );

  return Buffer.from(parts);
}

function webpVp8xBuffer(width = 100, height = 50): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function webpVp8lBuffer(width = 100, height = 50): Buffer {
  const buffer = Buffer.alloc(25);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(17, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer.writeUInt32LE(5, 16);
  buffer[20] = 0x2f;
  buffer.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return buffer;
}

function webpVp8Buffer(width = 64, height = 32): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer[23] = 0x9d;
  buffer[24] = 0x01;
  buffer[25] = 0x2a;
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

describe('image-signature.util', () => {
  describe('detectImageMimeType', () => {
    it('detects PNG content', () => {
      expect(detectImageMimeType(pngBuffer())).toBe('image/png');
    });

    it('detects JPEG content', () => {
      expect(detectImageMimeType(jpegBuffer())).toBe('image/jpeg');
    });

    it('detects GIF87a and GIF89a content', () => {
      expect(detectImageMimeType(gifBuffer(4, 2, 'GIF87a'))).toBe('image/gif');
      expect(detectImageMimeType(gifBuffer())).toBe('image/gif');
    });

    it('detects WebP content in all chunk variants', () => {
      expect(detectImageMimeType(webpVp8xBuffer())).toBe('image/webp');
      expect(detectImageMimeType(webpVp8lBuffer())).toBe('image/webp');
      expect(detectImageMimeType(webpVp8Buffer())).toBe('image/webp');
    });

    it('rejects arbitrary non-image content', () => {
      expect(detectImageMimeType(Buffer.from('hello world'))).toBeNull();
      expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
    });

    it('rejects RIFF files that are not WebP', () => {
      const buffer = Buffer.alloc(16);
      buffer.write('RIFF', 0, 'ascii');
      buffer.write('WAVE', 8, 'ascii');
      expect(detectImageMimeType(buffer)).toBeNull();
    });

    it('does not match a truncated PNG signature', () => {
      expect(
        detectImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      ).toBeNull();
    });
  });

  describe('readImageDimensions', () => {
    it('reads PNG dimensions from the IHDR chunk', () => {
      expect(readImageDimensions(pngBuffer(320, 240), 'image/png')).toEqual({
        width: 320,
        height: 240,
      });
    });

    it('returns null for truncated PNG data', () => {
      expect(readImageDimensions(pngBuffer().subarray(0, 16), 'image/png'))
        .toBeNull();
    });

    it('reads GIF dimensions from the logical screen descriptor', () => {
      expect(readImageDimensions(gifBuffer(320, 200), 'image/gif')).toEqual({
        width: 320,
        height: 200,
      });
    });

    it('reads JPEG dimensions from the start-of-frame marker', () => {
      expect(readImageDimensions(jpegBuffer(640, 480), 'image/jpeg')).toEqual({
        width: 640,
        height: 480,
      });
    });

    it('skips JPEG segments before the frame header', () => {
      expect(
        readImageDimensions(jpegBuffer(12, 24, { withApp0: false }), 'image/jpeg'),
      ).toEqual({ width: 12, height: 24 });
    });

    it('returns null for JPEG data without a frame header', () => {
      expect(
        readImageDimensions(
          Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
          'image/jpeg',
        ),
      ).toBeNull();
    });

    it('reads WebP VP8X dimensions', () => {
      expect(readImageDimensions(webpVp8xBuffer(800, 600), 'image/webp')).toEqual(
        { width: 800, height: 600 },
      );
    });

    it('reads WebP VP8L dimensions', () => {
      expect(readImageDimensions(webpVp8lBuffer(77, 33), 'image/webp')).toEqual({
        width: 77,
        height: 33,
      });
    });

    it('reads WebP VP8 dimensions', () => {
      expect(readImageDimensions(webpVp8Buffer(1024, 512), 'image/webp')).toEqual(
        { width: 1024, height: 512 },
      );
    });

    it('returns null when dimensions are zero', () => {
      expect(readImageDimensions(pngBuffer(0, 10), 'image/png')).toBeNull();
      expect(readImageDimensions(gifBuffer(0, 0), 'image/gif')).toBeNull();
    });
  });
});
