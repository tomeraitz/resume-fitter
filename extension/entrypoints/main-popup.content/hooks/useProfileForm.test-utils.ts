import { vi } from 'vitest';
import type { UserProfile } from '../../../types/storage';

export const mockSetValue = vi.fn();

export function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    cvTemplate: '',
    professionalHistory: '',
    ...overrides,
  };
}

export function createMockFile(
  name: string,
  type: string,
  sizeOrContent?: number | Uint8Array,
): File {
  let content: BlobPart[];
  if (sizeOrContent instanceof Uint8Array) {
    content = [sizeOrContent];
  } else if (typeof sizeOrContent === 'number') {
    content = [new Uint8Array(sizeOrContent)];
  } else {
    content = [new Uint8Array(10)];
  }
  return new File(content, name, { type });
}

// PDF magic bytes: %PDF
export const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x00, 0x00, 0x00]);
