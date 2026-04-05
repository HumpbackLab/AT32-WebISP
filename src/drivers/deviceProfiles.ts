import type { FirmwareSegment } from '../utils/FileParsers';

export type DeviceProfileId = 'at32f43x-xgt7' | 'at32f43x-xmt7';

export interface DeviceProfile {
  id: DeviceProfileId;
  label: string;
  family: 'at32f43x';
  flashBase: number;
  flashSize: number;
  sectorSize: number;
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
};

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
