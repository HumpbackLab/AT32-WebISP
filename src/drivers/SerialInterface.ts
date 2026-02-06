
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

  // Keep reading in background to fill buffer
  private readingPromise: Promise<void> | null = null;
  private keepReading = false;

  async connect(options: SerialOptions = { baudRate: 115200, parity: 'even', dataBits: 8, stopBits: 1 }): Promise<void> {
    try {
      this.status = 'connecting';
      this.port = await navigator.serial.requestPort();
      await this.port.open(options);

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
    if (!this.port || !this.port.writable) throw new Error('Port not open');

    if (!this.writer) {
      this.writer = this.port.writable.getWriter();
    }

    await this.writer.write(data);
    this.writer.releaseLock();
    this.writer = null;
  }

  // Read exact number of bytes with timeout
  async read(count: number, timeoutMs: number = 1000): Promise<Uint8Array> {
    const startTime = Date.now();

    while (this.buffer.length < count) {
      if (!this.keepReading) throw new Error('Port disconnected during read');
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout reading ${count} bytes. Got ${this.buffer.length}.`);
      }
      await new Promise(r => setTimeout(r, 10)); // Sleep 10ms
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
}

export class MockSerialInterface implements ISerialInterface {
  public status: ConnectionStatus = 'disconnected';
  private buffer: number[] = [];

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

    const byte = data[0];

    // Sync 0x7F -> 0x79
    if (byte === 0x7F) {
      this.push([0x79]);
      return;
    }

    // Command Simulation
    // Get ID: 0x02, 0xFD -> ACK(0x79), N=4(0x04), Data(4 bytes), PID(1 byte), ACK(0x79)
    if (byte === 0x02 && data[1] === 0xFD) {
      this.push([0x79]); // Pre-ACK
      setTimeout(() => {
        // Length 4+1 = 5 bytes total payload. N = Length-1?
        // Protocol: 1 byte len-1. If 5 bytes, value is 4.
        const pid = [0x41, 0x54, 0x33, 0x32]; // AT32
        const prid = 0x01;
        this.push([0x04, ...pid, prid, 0x79]);
      }, 50);
      return;
    }

    // Default ACK for any command for now to pass "cmd" check
    if (data.length === 2 && (data[0] ^ data[1]) === 0xFF) {
      // Valid xor command
      this.push([0x79]); // ACK
    }
  }

  private push(bytes: number[]) {
    bytes.forEach(b => this.buffer.push(b));
  }
}
