
export interface FirmwareSegment {
    address: number;
    data: Uint8Array;
}

export const FileParsers = {
    /**
     * Parse a raw binary file. Assumes start address is 0x08000000 (Flash Base).
     */
    parseBin(buffer: ArrayBuffer, baseAddress: number = 0x08000000): FirmwareSegment[] {
        return [{
            address: baseAddress,
            data: new Uint8Array(buffer)
        }];
    },

    /**
     * Parse Intel HEX format.
     * Based on spec: :LLAAAATTDD...CC
     */
    parseHex(text: string): FirmwareSegment[] {
        const segments: FirmwareSegment[] = [];
        const lines = text.split(/\r?\n/);

        let extendedAddress = 0;
        let currentData: number[] = [];
        let currentAddress = -1;

        // Helper to commit current buffered data as a segment
        const commitSegment = () => {
            if (currentData.length > 0 && currentAddress !== -1) {
                segments.push({
                    address: currentAddress,
                    data: new Uint8Array(currentData)
                });
                currentData = [];
                currentAddress = -1;
            }
        };

        for (const line of lines) {
            if (!line.startsWith(':')) continue; // Ignore empty or comment lines

            const len = parseInt(line.substring(1, 3), 16);
            const addr = parseInt(line.substring(3, 7), 16);
            const type = parseInt(line.substring(7, 9), 16);
            const dataStr = line.substring(9, 9 + len * 2);

            if (type === 0x00) { // Data Record
                const absoluteAddr = extendedAddress + addr;

                // If this is a new disjoint segment, commit previous and start new
                if (currentAddress === -1) {
                    currentAddress = absoluteAddr;
                } else if (absoluteAddr !== currentAddress + currentData.length) {
                    commitSegment();
                    currentAddress = absoluteAddr;
                }

                for (let i = 0; i < len; i++) {
                    currentData.push(parseInt(dataStr.substring(i * 2, i * 2 + 2), 16));
                }
            } else if (type === 0x02) { // Extended Segment Address
                const segment = parseInt(dataStr, 16);
                extendedAddress = segment << 4;
                commitSegment();
            } else if (type === 0x04) { // Extended Linear Address
                const highAddr = parseInt(dataStr, 16);
                extendedAddress = highAddr << 16;
                commitSegment();
            } else if (type === 0x01) { // End of File
                commitSegment();
                break;
            }
        }
        commitSegment(); // Ensure final segment is pushed
        return segments;
    },

    /**
     * Parse ELF Program Headers (32-bit ELF).
     * Looks for PT_LOAD segments.
     */
    parseElf(buffer: ArrayBuffer): FirmwareSegment[] {
        const view = new DataView(buffer);
        const segments: FirmwareSegment[] = [];

        // Check Magic: 7F 45 4C 46
        if (view.getUint32(0) !== 0x7F454C46) {
            throw new Error("Invalid ELF Magic");
        }

        // Check Class (0x01 = 32-bit, 0x02 = 64-bit) at offset 4
        const is64Bit = view.getUint8(4) === 2;
        // We mainly expect 32-bit for AT32 (Cortex-M)

        // Check Endianness (0x01 = Little, 0x02 = Big) at offset 5
        const littleEndian = view.getUint8(5) === 1;

        let phOff, phNum, phEntSize;

        if (!is64Bit) {
            // 32-bit Header
            // e_phoff at 28 (4 bytes)
            phOff = view.getUint32(28, littleEndian);
            // e_phentsize at 42 (2 bytes)
            phEntSize = view.getUint16(42, littleEndian);
            // e_phnum at 44 (2 bytes)
            phNum = view.getUint16(44, littleEndian);
        } else {
            throw new Error("64-bit ELF not supported yet (Target is likely 32-bit MCU)");
        }

        for (let i = 0; i < phNum; i++) {
            const offset = phOff + i * phEntSize;

            // p_type at offset 0 (4 bytes)
            const pType = view.getUint32(offset, littleEndian);

            // PT_LOAD = 1
            if (pType === 1) {
                // 32-bit Program Header:
                // 00: p_type
                // 04: p_offset
                // 08: p_vaddr
                // 0C: p_paddr  <-- We want Physical Address for flashing
                // 10: p_filesz <-- File size
                // 14: p_memsz
                // 18: p_flags
                // 1C: p_align

                const pOffset = view.getUint32(offset + 4, littleEndian);
                const pPaddr = view.getUint32(offset + 12, littleEndian);
                const pFilesz = view.getUint32(offset + 16, littleEndian);

                if (pFilesz > 0) {
                    const segmentData = new Uint8Array(buffer, pOffset, pFilesz);
                    segments.push({
                        address: pPaddr,
                        data: segmentData
                    });
                }
            }
        }

        return segments;
    }
};
