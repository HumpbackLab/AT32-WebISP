
export interface SerialOptions {
  baudRate: number;
  parity?: 'none' | 'even' | 'odd';
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ISerialInterface {
  connect(options?: SerialOptions): Promise<void>;
  disconnect(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  read(count: number, timeoutMs?: number): Promise<Uint8Array>;
  flush(): Promise<void>;
  status: ConnectionStatus;
}

export class WebSerialInterface implements ISerialInterface {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  public status: ConnectionStatus = 'disconnected';
  private buffer: number[] = [];
  private readWaiters: Array<() => void> = [];

  // Keep reading in background to fill buffer
  private readingPromise: Promise<void> | null = null;
  private keepReading = false;

  async connect(options: SerialOptions = { baudRate: 256000, parity: 'even', dataBits: 8, stopBits: 1 }): Promise<void> {
    try {
      this.status = 'connecting';
      this.port = await navigator.serial.requestPort();
      await this.port.open(options);
      this.writer = this.port.writable?.getWriter() ?? null;

      this.keepReading = true;
      this.readingPromise = this.readLoop();

      this.status = 'connected';
    } catch (err) {
      this.status = 'error';
      console.error('Failed to connect:', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    this.notifyReadWaiters();
    if (this.reader) {
      await this.reader.cancel();
    }
    if (this.readingPromise) {
      await this.readingPromise.catch(() => { });
    }
    if (this.writer) {
      await this.writer.close();
      this.writer.releaseLock();
    }
    if (this.port) {
      await this.port.close();
    }
    this.port = null;
    this.status = 'disconnected';
  }


  async write(data: Uint8Array): Promise<void> {
    if (!this.port || !this.writer) throw new Error('Port not open');

    await this.writer.write(data);
  }

  // Read exact number of bytes with timeout
  async read(count: number, timeoutMs: number = 1000): Promise<Uint8Array> {
    const startTime = Date.now();

    while (this.buffer.length < count) {
      if (!this.keepReading) throw new Error('Port disconnected during read');
      const remainingMs = timeoutMs - (Date.now() - startTime);
      if (remainingMs <= 0) {
        throw new Error(`Timeout reading ${count} bytes. Got ${this.buffer.length}.`);
      }
      await this.waitForData(remainingMs);
    }

    const result = new Uint8Array(this.buffer.slice(0, count));
    this.buffer = this.buffer.slice(count);
    return result;
  }

  async flush(): Promise<void> {
    this.buffer = [];
  }

  private async readLoop() {
    if (!this.port || !this.port.readable) return;

    try {
      this.reader = this.port.readable.getReader();
      while (this.keepReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          for (let i = 0; i < value.length; i++) {
            this.buffer.push(value[i]);
          }
          this.notifyReadWaiters();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private waitForData(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.readWaiters = this.readWaiters.filter(waiter => waiter !== onData);
        resolve();
      }, timeoutMs);

      const onData = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeoutId);
        resolve();
      };

      this.readWaiters.push(onData);
    });
  }

  private notifyReadWaiters() {
    const waiters = this.readWaiters;
    this.readWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }
}

export class MockSerialInterface implements ISerialInterface {
  public status: ConnectionStatus = 'disconnected';
  private buffer: number[] = [];
  private pendingCommand: number | null = null;
  private pendingAddress: number | null = null;
  private readonly flashBase = 0x08000000;
  private readonly flashSize = 1024 * 1024;
  private readonly sectorSize = 2 * 1024;
  private readonly flash = new Uint8Array(this.flashSize).fill(0xFF);

  constructor() {
    console.log("Mock Serial Initialized");
  }

  async connect(): Promise<void> {
    console.log("Mock Connected");
    this.status = 'connected';
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    console.log("Mock Disconnected");
    this.status = 'disconnected';
    return Promise.resolve();
  }

  async write(data: Uint8Array): Promise<void> {
    console.log('Mock Write:', data);
    this.processCommand(data);
  }

  async read(count: number, timeoutMs: number = 1000): Promise<Uint8Array> {
    const startTime = Date.now();
    while (this.buffer.length < count) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Mock Timeout');
      }
      await new Promise(r => setTimeout(r, 10));
    }
    const result = new Uint8Array(this.buffer.slice(0, count));
    this.buffer = this.buffer.slice(count);
    return result;
  }

  async flush(): Promise<void> {
    this.buffer = [];
  }

  private processCommand(data: Uint8Array) {
    if (data.length === 0) return;

    if (this.pendingCommand !== null) {
      this.processPendingFrame(data);
      return;
    }

    const byte = data[0];

    // Sync 0x7F -> 0x79
    if (byte === 0x7F) {
      this.push([0x79]);
      return;
    }

    if (data.length === 2 && (data[0] ^ data[1]) === 0xFF) {
      const cmd = data[0];
      this.push([0x79]);

      switch (cmd) {
        case 0x01: // Get Version
          setTimeout(() => this.push([0x20, 0x00, 0x00, 0x79]), 20);
          return;
        case 0x02: // Get ID
          setTimeout(() => {
            const pid = [0x43, 0x35, 0x00, 0x10];
            const projectId = 0x01;
            this.push([0x04, ...pid, projectId, 0x79]);
          }, 20);
          return;
        case 0x11: // Read Memory
        case 0x31: // Write Memory
        case 0x44: // Erase
          this.pendingCommand = cmd;
          this.pendingAddress = null;
          return;
        case 0xD2: // Get sLib Status
          // 16-byte payload identifies the demo target as AT32F43x family.
          setTimeout(() => this.push([
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x79
          ]), 20);
          return;
        default:
          return;
      }
    }
  }

  private processPendingFrame(data: Uint8Array) {
    switch (this.pendingCommand) {
      case 0x11:
        this.processReadMemoryFrame(data);
        return;
      case 0x31:
        this.processWriteMemoryFrame(data);
        return;
      case 0x44:
        this.processEraseFrame(data);
        return;
      default:
        this.pendingCommand = null;
        this.pendingAddress = null;
    }
  }

  private processReadMemoryFrame(data: Uint8Array) {
    if (this.pendingAddress === null) {
      this.pendingAddress = this.parseAddressFrame(data);
      this.push([0x79]);
      return;
    }

    const length = data[0] + 1;
    const expectedChecksum = 0xFF ^ data[0];
    if (data.length !== 2 || data[1] !== expectedChecksum) {
      throw new Error('Mock ReadMemory checksum mismatch');
    }

    const offset = this.toFlashOffset(this.pendingAddress);
    this.push([0x79]);
    this.push(Array.from(this.flash.slice(offset, offset + length)));
    this.pendingCommand = null;
    this.pendingAddress = null;
  }

  private processWriteMemoryFrame(data: Uint8Array) {
    if (this.pendingAddress === null) {
      this.pendingAddress = this.parseAddressFrame(data);
      this.push([0x79]);
      return;
    }

    const length = data[0] + 1;
    if (data.length !== length + 2) {
      throw new Error('Mock WriteMemory frame length mismatch');
    }

    let checksum = data[0];
    for (let i = 1; i < data.length - 1; i++) {
      checksum ^= data[i];
    }
    if (checksum !== data[data.length - 1]) {
      throw new Error('Mock WriteMemory checksum mismatch');
    }

    const offset = this.toFlashOffset(this.pendingAddress);
    this.flash.set(data.slice(1, data.length - 1), offset);
    this.push([0x79]);
    this.pendingCommand = null;
    this.pendingAddress = null;
  }

  private processEraseFrame(data: Uint8Array) {
    if (data.length < 3) {
      throw new Error('Mock Erase frame too short');
    }

    if (data[0] === 0xFF && data[1] === 0xFF) {
      this.flash.fill(0xFF);
      this.push([0x79]);
      this.pendingCommand = null;
      this.pendingAddress = null;
      return;
    }

    const count = (data[0] << 8) | data[1];
    const expectedLength = 2 + (count + 1) * 2 + 1;
    if (data.length === expectedLength) {
      let checksum = data[0] ^ data[1];
      for (let i = 0; i < count + 1; i++) {
        const msb = data[2 + i * 2];
        const lsb = data[3 + i * 2];
        checksum ^= msb ^ lsb;
        const sector = (msb << 8) | lsb;
        this.eraseSector(sector);
      }
      if (checksum !== data[data.length - 1]) {
        throw new Error('Mock EraseSectors checksum mismatch');
      }
      this.push([0x79]);
      this.pendingCommand = null;
      this.pendingAddress = null;
      return;
    }

    throw new Error('Mock Erase command is not supported for this frame');
  }

  private parseAddressFrame(data: Uint8Array): number {
    if (data.length !== 5) {
      throw new Error('Mock address frame length mismatch');
    }

    const checksum = data[0] ^ data[1] ^ data[2] ^ data[3];
    if (checksum !== data[4]) {
      throw new Error('Mock address checksum mismatch');
    }

    return ((data[0] << 24) >>> 0) | (data[1] << 16) | (data[2] << 8) | data[3];
  }

  private toFlashOffset(address: number): number {
    const offset = address - this.flashBase;
    if (offset < 0 || offset >= this.flash.length) {
      throw new Error(`Mock flash address out of range: 0x${address.toString(16).toUpperCase()}`);
    }
    return offset;
  }

  private eraseSector(sector: number) {
    const start = sector * this.sectorSize;
    const end = Math.min(start + this.sectorSize, this.flash.length);
    this.flash.fill(0xFF, start, end);
  }

  private push(bytes: number[]) {
    bytes.forEach(b => this.buffer.push(b));
  }
}
