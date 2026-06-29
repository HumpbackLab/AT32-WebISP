import type { FirmwareSegment } from '../utils/FileParsers';

export type DeviceProfileId = 'at32f43x-xgt7' | 'at32f43x-xmt7' | 'at32f421-x4' | 'at32f421-x6' | 'at32f421-x8' | 'at32f425-x6' | 'at32f425-x8';

export type DeviceFamily = 'at32f43x' | 'at32f421' | 'at32f425';

export interface DeviceProfile {
  id: DeviceProfileId;
  label: string;
  family: DeviceFamily;
  flashBase: number;
  flashSize: number;
  sectorSize: number;
}

/**
 * Known device families — these support profile-based sector erase.
 * Anything not in this set falls back to full-chip erase.
 */
const KNOWN_FAMILIES: ReadonlySet<DeviceFamily> = new Set(['at32f43x', 'at32f421', 'at32f425']);

/**
 * Returns true if the family is recognized and supports sector erase.
 */
export function isKnownFamily(family: string): family is DeviceFamily {
  return KNOWN_FAMILIES.has(family as DeviceFamily);
}

const FLASH_BASE = 0x08000000;

export const DEVICE_PROFILES: Record<DeviceProfileId, DeviceProfile> = {
  'at32f43x-xgt7': {
    id: 'at32f43x-xgt7',
    label: 'AT32F43x xGT7 (1024KB)',
    family: 'at32f43x',
    flashBase: FLASH_BASE,
    flashSize: 1024 * 1024,
    sectorSize: 2 * 1024,
  },
  'at32f43x-xmt7': {
    id: 'at32f43x-xmt7',
    label: 'AT32F43x xMT7 (4032KB)',
    family: 'at32f43x',
    flashBase: FLASH_BASE,
    flashSize: 4032 * 1024,
    sectorSize: 4 * 1024,
  },
  'at32f421-x4': {
    id: 'at32f421-x4',
    label: 'AT32F421 x4 (16KB)',
    family: 'at32f421',
    flashBase: FLASH_BASE,
    flashSize: 16 * 1024,
    sectorSize: 1 * 1024,
  },
  'at32f421-x6': {
    id: 'at32f421-x6',
    label: 'AT32F421 x6 (32KB)',
    family: 'at32f421',
    flashBase: FLASH_BASE,
    flashSize: 32 * 1024,
    sectorSize: 1 * 1024,
  },
  'at32f421-x8': {
    id: 'at32f421-x8',
    label: 'AT32F421 x8 (64KB)',
    family: 'at32f421',
    flashBase: FLASH_BASE,
    flashSize: 64 * 1024,
    sectorSize: 1 * 1024,
  },
  'at32f425-x6': {
    id: 'at32f425-x6',
    label: 'AT32F425 x6 (32KB)',
    family: 'at32f425',
    flashBase: FLASH_BASE,
    flashSize: 32 * 1024,
    sectorSize: 1 * 1024,
  },
  'at32f425-x8': {
    id: 'at32f425-x8',
    label: 'AT32F425 x8 (64KB)',
    family: 'at32f425',
    flashBase: FLASH_BASE,
    flashSize: 64 * 1024,
    sectorSize: 1 * 1024,
  },
};

/**
 * Family detection via PID prefix matching.
 *
 * Artery PIDs are the DBGMCU_IDCODE register value (32 bits, at 0xE0042000).
 * The upper 16 bits identify the device series; the lower 16 bits encode
 * flash size and package variant.
 *
 * Sources:
 *   AT32F421 — 0x50020112 (empirically verified on real hardware)
 *   AT32F425 — 0x50092XXX (RM_AT32F425_V2.06 §Debug, DEBUG_IDCODE table)
 *
 * The protocol also returns a separate 1-byte Project ID (§4.4 of protocol_ref.txt);
 * that may be a simpler series discriminator, but values are undocumented.
 */
const FAMILY_PREFIXES: { prefix: number; mask: number; family: DeviceFamily }[] = [
  { prefix: 0x50020000, mask: 0xFFFF0000, family: 'at32f421' },
  { prefix: 0x50090000, mask: 0xFFFF0000, family: 'at32f425' },
];

/**
 * Try to determine the device family from its PID (upper 16-bit prefix match).
 * Returns the family if recognized, or undefined if unknown.
 */
export function detectFamilyFromPID(pid: number): DeviceFamily | undefined {
  for (const { prefix, mask, family } of FAMILY_PREFIXES) {
    if ((pid & mask) === prefix) {
      return family;
    }
  }
  return undefined;
}

function getSectorIndex(profile: DeviceProfile, address: number): number {
  const offset = address - profile.flashBase;
  if (offset < 0 || offset >= profile.flashSize) {
    throw new Error(`Address 0x${address.toString(16).toUpperCase()} is outside ${profile.label} flash range`);
  }

  return Math.floor(offset / profile.sectorSize);
}

export function getSectorsForSegments(profile: DeviceProfile, segments: FirmwareSegment[]): number[] {
  const sectors = new Set<number>();

  for (const segment of segments) {
    if (segment.data.length === 0) {
      continue;
    }

    const startSector = getSectorIndex(profile, segment.address);
    const endSector = getSectorIndex(profile, segment.address + segment.data.length - 1);

    for (let sector = startSector; sector <= endSector; sector++) {
      sectors.add(sector);
    }
  }

  return Array.from(sectors).sort((a, b) => a - b);
}
