import type { ISerialInterface } from './SerialInterface';

export const CMD = {
    GET_COMMANDS: 0x00,
    GET_VERSION: 0x01,
    GET_ID: 0x02,
    READ_MEMORY: 0x11,
    GO: 0x21,
    WRITE_MEMORY: 0x31,
    ERASE: 0x44, // Extended Erase
    FIRMWARE_CRC: 0xAC,
};

export const ACK = 0x79;
export const NACK = 0x1F;

export class AT32Protocol {
    private serial: ISerialInterface;

    constructor(serial: ISerialInterface) {
        this.serial = serial;
    }

    /**
     * Sync with the bootloader by sending 0x7F
     */
    async sync(): Promise<void> {
        // Flush any garbage
        await this.serial.flush();

        // Send 0x7F
        await this.serial.write(new Uint8Array([0x7F]));

        // Wait for ACK
        const resp = await this.serial.read(1, 1000);
        if (resp[0] !== ACK) {
            if (resp[0] === NACK) throw new Error('Received NACK during sync');
            throw new Error(`Sync failed. Expected 0x79, got 0x${resp[0].toString(16)}`);
        }
    }

    /**
     * Send a command with its complement checksum
     */
    async sendCommand(cmd: number): Promise<void> {
        const frame = new Uint8Array([cmd, cmd ^ 0xFF]);
        await this.serial.write(frame);

        const resp = await this.serial.read(1);
        if (resp[0] !== ACK) {
            throw new Error(`Command 0x${cmd.toString(16)} failed. Got 0x${resp[0].toString(16)}`);
        }
    }

    /**
     * Get Chip ID
     * Returns generic ID info (PID + Project ID)
     */
    async getID(): Promise<{ pid: number; projectID: number }> {
        await this.sendCommand(CMD.GET_ID);

        // Read N (number of bytes - 1)
        const lenBuf = await this.serial.read(1);
        const n = lenBuf[0]; // N = len - 1
        const totalBytes = n + 1; // Expected bytes from device

        // Read ID bytes
        const idBytes = await this.serial.read(totalBytes);

        // Read final ACK
        const ack = await this.serial.read(1);
        if (ack[0] !== ACK) throw new Error('GetID: Missing final ACK');

        // Protocol: PID (4 bytes) + Project ID (1 byte)?
        // Text says: "4 bytes Product ID and 1 byte Project ID"
        // So total 5 bytes. N should be 4.

        // Assume Little Endian for Product ID?
        // No, usually Big Endian or specified order. ref says "Product ID [8-15]", "[0-7]" etc.
        // Let's just return raw bytes or construct integer if needed.
        // ref: Byte 1: PID[8-15], Byte 2: PID[0-7], Byte 3: PID[24-31], Byte 4: PID[16-23]
        // That's a weird byte order.
        // Let's reconstruct cleanly.

        // idBytes[0] = PID[8-15]
        // idBytes[1] = PID[0-7]
        // idBytes[2] = PID[24-31]
        // idBytes[3] = PID[16-23]
        // idBytes[4] = ProjectID

        const pid =
            (idBytes[2] << 24) |
            (idBytes[3] << 16) |
            (idBytes[0] << 8) |
            (idBytes[1]);

        return {
            pid: pid >>> 0, // ensure unsigned
            projectID: idBytes[4]
        };
    }

    async getVersion(): Promise<{ version: number, optionBytes: number[] }> {
        await this.sendCommand(CMD.GET_VERSION);

        const ver = await this.serial.read(1);
        const opt1 = await this.serial.read(1);
        const opt2 = await this.serial.read(1);

        const ack = await this.serial.read(1);
        if (ack[0] !== ACK) throw new Error('GetVersion: Missing final ACK');

        return {
            version: ver[0],
            optionBytes: [opt1[0], opt2[0]]
        };
    }

    async readMemory(address: number, length: number): Promise<Uint8Array> {
        if (length <= 0 || length > 256) throw new Error('Invalid read length');
        await this.sendCommand(CMD.READ_MEMORY);

        // Send Address
        await this.sendAddress(address);

        // Send Length (N = len - 1)
        const n = length - 1;
        const checksum = 0xFF ^ n;
        await this.serial.write(new Uint8Array([n, checksum]));

        const ack = await this.serial.read(1);
        if (ack[0] !== ACK) throw new Error('ReadMemory: Length NACK');

        // Read Data
        const data = await this.serial.read(length);
        return data;
    }

    async writeMemory(address: number, data: Uint8Array): Promise<void> {
        // Protocol allows sending max 256 bytes per write command
        // We assume data is <= 256 bytes.
        if (data.length > 256 || data.length === 0) throw new Error('Invalid write length');

        await this.sendCommand(CMD.WRITE_MEMORY);
        await this.sendAddress(address);

        // Protocol: Host sends N (1 byte), N+1 data bytes, 1 Checksum byte
        // Checksum = XOR (N, data...)
        const n = data.length - 1;

        let checksum = n;
        const frame = new Uint8Array(data.length + 2);
        frame[0] = n;

        for (let i = 0; i < data.length; i++) {
            frame[i + 1] = data[i];
            checksum ^= data[i];
        }
        frame[data.length + 1] = checksum;

        await this.serial.write(frame);

        const ack = await this.serial.read(1);
        if (ack[0] !== ACK) throw new Error('WriteMemory: NACK during data write');
    }

    async eraseAll(): Promise<void> {
        await this.sendCommand(CMD.ERASE); // 0x44

        // Special global erase command: 0xFFFF + Checksum
        const code1 = 0xFF;
        const code2 = 0xFF; // Global erase
        const checksum = code1 ^ code2;

        await this.serial.write(new Uint8Array([code1, code2, checksum]));

        const ack = await this.serial.read(1, 10000); // Erase takes time
        if (ack[0] !== ACK) throw new Error('Erase All failed');
    }

    async firmwareCRC(startAddress: number, sectorCount: number): Promise<number> {
        if (sectorCount <= 0 || sectorCount > 0x10000) {
            throw new Error('Invalid sector count');
        }

        await this.sendCommand(CMD.FIRMWARE_CRC);
        await this.sendAddress(startAddress);

        const n = sectorCount - 1;
        const msb = (n >> 8) & 0xFF;
        const lsb = n & 0xFF;
        const checksum = msb ^ lsb ^ 0xFF;

        await this.serial.write(new Uint8Array([msb, lsb, checksum]));

        const ack = await this.serial.read(1);
        if (ack[0] !== ACK) throw new Error('Firmware CRC: NACK during sector count');

        const crcBytes = await this.serial.read(4, 10000);
        const crc =
            (crcBytes[0] << 24) |
            (crcBytes[1] << 16) |
            (crcBytes[2] << 8) |
            (crcBytes[3]);

        return crc >>> 0;
    }

    private async sendAddress(addr: number): Promise<void> {
        const b3 = (addr >> 24) & 0xFF;
        const b2 = (addr >> 16) & 0xFF;
        const b1 = (addr >> 8) & 0xFF;
        const b0 = addr & 0xFF;
        const checksum = b3 ^ b2 ^ b1 ^ b0;

        await this.serial.write(new Uint8Array([b3, b2, b1, b0, checksum]));

        const ack = await this.serial.read(1);
        if (ack[0] !== ACK) throw new Error('Address NACK');
    }
}
