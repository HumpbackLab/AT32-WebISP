import { useState, useRef } from 'react'
import { MockSerialInterface, WebSerialInterface } from './drivers/SerialInterface'
import type { ISerialInterface } from './drivers/SerialInterface'
import { AT32Protocol } from './drivers/AT32Protocol'
import { DEVICE_PROFILES, getSectorsForSegments, type DeviceProfileId } from './drivers/deviceProfiles'
import { Card, Button, ProgressBar } from './components/Common'
import { LogViewer } from './components/LogViewer'
import { FileParsers, type FirmwareSegment } from './utils/FileParsers'
import { Cpu, Zap, RotateCcw, FileCode, Play, AlertCircle, CheckCircle, MonitorPlay } from 'lucide-react'

// --- Types ---
type AppStatus = 'disconnected' | 'connecting' | 'connected' | 'working' | 'error';
interface LogEntry { id: number; time: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }
type EraseMode = 'unknown' | 'full-chip' | 'sector';
type ConnectionMode = 'serial' | 'demo' | null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROGRAM_ERASE_PROGRESS_MAX = 15;

function App() {
  // --- State ---
  const [status, setStatus] = useState<AppStatus>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<{ pid: number, projectID: number, version: number } | null>(null);

  // File state now holds segments, not raw buffer
  const [fileInfo, setFileInfo] = useState<{ name: string, size: number, segments: FirmwareSegment[] } | null>(null);

  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [baudRate, setBaudRate] = useState(256000);
  const [eraseMode, setEraseMode] = useState<EraseMode>('unknown');
  const [detectedFamily, setDetectedFamily] = useState<'unknown' | 'at32f43x' | 'other'>('unknown');
  const [selectedProfileId, setSelectedProfileId] = useState<DeviceProfileId | ''>('');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(null);

  // --- Refs ---
  const serialRef = useRef<ISerialInterface | null>(null);
  const protocolRef = useRef<AT32Protocol | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectedFamilyRef = useRef<'unknown' | 'at32f43x' | 'other'>('unknown');

  // --- Helpers ---
  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-100), { id: Date.now(), time, message: msg, type }]);
  };

  // --- Actions ---
  const connectWithInterface = async (serial: ISerialInterface, mode: ConnectionMode) => {
    try {
      setStatus('connecting');
      addLog(mode === 'demo' ? 'Starting Demo Mode...' : `Requesting Serial Port (${baudRate} baud)...`, 'info');
      await serial.connect({ baudRate, parity: 'even', dataBits: 8, stopBits: 1 });
      serialRef.current = serial;
      setConnectionMode(mode);

      const protocol = new AT32Protocol(serial);
      protocolRef.current = protocol;

      addLog(mode === 'demo' ? 'Demo transport ready. Syncing...' : `Port Opened at ${baudRate} baud. Syncing...`, 'info');
      await protocol.sync();
      addLog('Sync OK. Getting Device Info...', 'success');

      const id = await protocol.getID();
      const ver = await protocol.getVersion();

      setDeviceInfo({ ...id, version: ver.version });
      setStatus('connected');
      addLog(`Connected: PID 0x${id.pid.toString(16).toUpperCase()} (Ver ${ver.version})`, 'success');

      try {
        const isF435437Family = await protocol.detectF435437Family();
        const family = isF435437Family ? 'at32f43x' : 'other';
        detectedFamilyRef.current = family;
        setDetectedFamily(family);
        setEraseMode(isF435437Family ? 'unknown' : 'full-chip');

        if (isF435437Family) {
          if (mode === 'demo') {
            setSelectedProfileId('at32f43x-xgt7');
          }
          addLog('Detected AT32F435/F437-compatible bootloader.', 'info');
          addLog(mode === 'demo'
            ? 'Demo Mode defaulted to the AT32F43x xGT7 device profile.'
            : 'Select the exact AT32F43x capacity tier before partial sector erase.', 'warning');
        } else {
          addLog('Unknown or non-F435/F437 device. Programming will fall back to full-chip erase.', 'warning');
        }
      } catch (err: unknown) {
        detectedFamilyRef.current = 'other';
        setDetectedFamily('other');
        setEraseMode('full-chip');
        addLog(`Could not determine AT32F43x family support: ${getErrorMessage(err)}`, 'warning');
        addLog('Programming will fall back to full-chip erase for safety.', 'warning');
      }

    } catch (err: unknown) {
      console.error(err);
      setStatus('error');
      const message = getErrorMessage(err);
      addLog(`Connection Failed: ${message}`, 'error');
      if (message.includes('Timeout reading')) {
        addLog('Please reset the MCU, switch to Bootloader mode again, and reconnect.', 'warning');
      }
      if (serialRef.current) {
        await serialRef.current.disconnect();
        serialRef.current = null;
      }
      setConnectionMode(null);
    }
  };

  const connect = async () => {
    await connectWithInterface(new WebSerialInterface(), 'serial');
  };

  const connectDemo = async () => {
    await connectWithInterface(new MockSerialInterface(), 'demo');
  };

  const disconnect = async () => {
    try {
      if (serialRef.current) await serialRef.current.disconnect();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      serialRef.current = null;
      protocolRef.current = null;
      detectedFamilyRef.current = 'unknown';
      setEraseMode('unknown');
      setDetectedFamily('unknown');
      setSelectedProfileId('');
      setConnectionMode(null);
      setStatus('disconnected');
      setDeviceInfo(null);
      addLog('Disconnected.', 'warning');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const buf = await f.arrayBuffer();
      let segments: FirmwareSegment[] = [];

      if (f.name.toLowerCase().endsWith('.hex')) {
        const text = new TextDecoder().decode(buf);
        segments = FileParsers.parseHex(text);
        addLog(`Parsed HEX file. Found ${segments.length} segments.`, 'info');
      } else if (f.name.toLowerCase().endsWith('.elf')) {
        segments = FileParsers.parseElf(buf);
        addLog(`Parsed ELF file. Found ${segments.length} loadable segments.`, 'info');
      } else {
        // Default to .bin
        segments = FileParsers.parseBin(buf);
        addLog(`Parsed Binary file. (Base: 0x08000000)`, 'info');
      }

      if (segments.length === 0) {
        throw new Error("No loadable data found in file.");
      }

      setFileInfo({
        name: f.name,
        size: buf.byteLength,
        segments
      });

    } catch (err: unknown) {
      addLog(`Failed to load file: ${getErrorMessage(err)}`, 'error');
    }
  };

  // --- Operations ---
  const erase = async () => {
    if (!protocolRef.current) return;
    try {
      setStatus('working');
      setProgress(0);
      setProgressLabel('Erasing Chip...');
      addLog('Starting Full Erase...', 'info');

      // Simulate progress for Erase since it's one blocking command
      const interval = setInterval(() => {
        setProgress(old => Math.min(old + 5, 95));
      }, 500);

      await protocolRef.current.eraseAll();

      clearInterval(interval);
      setProgress(100);
      addLog('Erase Complete', 'success');
    } catch (err: unknown) {
      addLog(`Erase Failed: ${getErrorMessage(err)}`, 'error');
    } finally {
      setStatus('connected');
    }
  };

  const program = async () => {
    if (!protocolRef.current || !fileInfo) return;
    let eraseProgressTimer: number | null = null;
    try {
      setStatus('working');
      setProgress(0);
      setProgressLabel('Preparing erase plan...');

      // Calculate total bytes for progress
      const totalBytes = fileInfo.segments.reduce((acc, seg) => acc + seg.data.length, 0);
      let writtenBytes = 0;

      addLog(`Programming ${totalBytes} bytes in ${fileInfo.segments.length} segments...`, 'info');

      eraseProgressTimer = globalThis.setInterval(() => {
        setProgress((old) => Math.min(old + 1, PROGRAM_ERASE_PROGRESS_MAX - 1));
      }, 250);

      if (detectedFamilyRef.current === 'at32f43x') {
        if (!selectedProfileId) {
          throw new Error('Select the exact AT32F43x device profile before programming.');
        }

        const profile = DEVICE_PROFILES[selectedProfileId];
        const eraseSectors = getSectorsForSegments(profile, fileInfo.segments);
        setEraseMode('sector');
        addLog(`Using ${profile.label} sector layout for partial erase.`, 'info');
        addLog(`Erasing ${eraseSectors.length} sector(s) from file coverage before programming...`, 'info');
        setProgressLabel(`Erasing ${eraseSectors.length} sector(s)...`);
        await protocolRef.current.eraseSectors(eraseSectors);
      } else {
        setEraseMode('full-chip');
        setProgressLabel('Unknown device, erasing full chip...');
        addLog('Unknown or unsupported device for sector erase. Falling back to full-chip erase before programming.', 'warning');
        await protocolRef.current.eraseAll();
      }

      if (eraseProgressTimer !== null) {
        globalThis.clearInterval(eraseProgressTimer);
      }
      setProgress(PROGRAM_ERASE_PROGRESS_MAX);

      addLog('Erase Complete. Starting program write...', 'success');
      setProgressLabel('Writing to Flash...');

      const chunkSize = 256;

      for (const segment of fileInfo.segments) {
        const totalChunks = Math.ceil(segment.data.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, segment.data.length);
          const chunk = segment.data.slice(start, end);
          const addr = segment.address + start;

          await protocolRef.current.writeMemory(addr, chunk);

          writtenBytes += chunk.length;
          const writeProgress = (writtenBytes / totalBytes) * (100 - PROGRAM_ERASE_PROGRESS_MAX);
          const percent = PROGRAM_ERASE_PROGRESS_MAX + writeProgress;

          setProgress(percent);
          setProgressLabel(`Writing to 0x${addr.toString(16).toUpperCase()}...`);
        }
      }

      setProgress(100);
      addLog('Programming Complete.', 'success');
    } catch (err: unknown) {
      addLog(`Programming Failed: ${getErrorMessage(err)}`, 'error');
      setStatus('error');
    } finally {
      if (eraseProgressTimer !== null) {
        globalThis.clearInterval(eraseProgressTimer);
      }
      setStatus('connected');
    }
  };

  const verify = async () => {
    if (!protocolRef.current || !fileInfo) return;
    try {
      setStatus('working');
      setProgress(0);
      setProgressLabel('Verifying Flash...');

      const totalBytes = fileInfo.segments.reduce((acc, seg) => acc + seg.data.length, 0);
      let verifiedBytes = 0;

      addLog(`Verifying ${totalBytes} bytes in ${fileInfo.segments.length} segments...`, 'info');

      const chunkSize = 256;

      for (const segment of fileInfo.segments) {
        const totalChunks = Math.ceil(segment.data.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, segment.data.length);
          const len = end - start;
          const addr = segment.address + start;

          const readBack = await protocolRef.current.readMemory(addr, len);
          for (let j = 0; j < len; j++) {
            const expected = segment.data[start + j];
            const actual = readBack[j];
            if (expected !== actual) {
              const failAddr = addr + j;
              throw new Error(`Verify mismatch at 0x${failAddr.toString(16).toUpperCase()}: expected 0x${expected.toString(16).padStart(2, '0').toUpperCase()}, got 0x${actual.toString(16).padStart(2, '0').toUpperCase()}`);
            }
          }

          verifiedBytes += len;
          const percent = (verifiedBytes / totalBytes) * 100;

          setProgress(percent);
          setProgressLabel(`Verifying 0x${addr.toString(16).toUpperCase()}...`);
        }
      }

      addLog('Verify Complete.', 'success');
    } catch (err: unknown) {
      addLog(`Verify Failed: ${getErrorMessage(err)}`, 'error');
      setStatus('error');
    } finally {
      setStatus('connected');
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/30 text-blue-400">
              <Cpu className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                AT32 Utility
              </h1>
              <p className="text-slate-500 text-sm">Web Serial Bootloader Utility</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-lg border border-slate-800 w-fit">
              <span className="text-slate-400 text-xs uppercase tracking-wider font-bold">Baud</span>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                disabled={status === 'connecting' || status === 'working'}
                className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              >
                <option value={1200}>1200</option>
                <option value={2400}>2400</option>
                <option value={4800}>4800</option>
                <option value={9600}>9600</option>
                <option value={14400}>14400</option>
                <option value={19200}>19200</option>
                <option value={28800}>28800</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={76800}>76800</option>
                <option value={115200}>115200</option>
                <option value={128000}>128000</option>
                <option value={230400}>230400</option>
                <option value={256000}>256000</option>
              </select>
            </div>
            {status === 'disconnected' || status === 'error' || status === 'connecting' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={connect}
                  loading={status === 'connecting'}
                  icon={<Zap className="w-4 h-4" />}
                >
                  {status === 'connecting' ? 'Connecting...' : 'Connect Device'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={connectDemo}
                  disabled={status === 'connecting'}
                  icon={<MonitorPlay className="w-4 h-4" />}
                >
                  Demo Mode
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={disconnect} icon={<RotateCcw className="w-4 h-4" />}>
                Disconnect
              </Button>
            )}
          </div>
        </div>

        {/* State: Disconnected */}
        {status === 'disconnected' && (
          <Card className="text-center py-12 border-dashed border-2 border-slate-800 bg-slate-900/20">
            <div className="p-4 bg-slate-800/50 rounded-full inline-block mb-4 text-slate-500">
              <Cpu className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-medium text-slate-200">No Device Connected</h3>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              Connect your AT32 device via USB-TTL. Ensure BOOT0 is pulled HIGH and reset the device to enter bootloader mode.
            </p>
          </Card>
        )}

        {/* State: Connected */}
        {(status === 'connected' || status === 'working') && (
          <div className="space-y-4">
            {/* Device Info */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="flex flex-col items-center justify-center py-4 bg-blue-500/5 border-blue-500/20">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">Status</span>
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  {connectionMode === 'demo' ? 'Demo Connected' : 'Connected'}
                </div>
              </Card>
              <Card className="flex flex-col items-center justify-center py-4">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">Product ID</span>
                <span className="font-mono text-lg text-slate-200">
                  {deviceInfo ? `0x${deviceInfo.pid.toString(16).toUpperCase()}` : '...'}
                </span>
              </Card>
              <Card className="flex flex-col items-center justify-center py-4">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">Bootloader</span>
                <span className="font-mono text-lg text-slate-200">
                  v{deviceInfo ? deviceInfo.version : '?'}
                </span>
              </Card>
              <Card className="flex flex-col items-center justify-center py-4">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">Erase Mode</span>
                <span className={`text-sm font-medium ${
                  eraseMode === 'sector'
                    ? 'text-cyan-300'
                    : eraseMode === 'full-chip'
                      ? 'text-amber-300'
                      : 'text-slate-400'
                }`}>
                  {eraseMode === 'sector'
                    ? 'Sector Erase'
                    : eraseMode === 'full-chip'
                      ? 'Full Chip Fallback'
                      : 'Detecting...'}
                </span>
              </Card>
            </div>

            {connectionMode === 'demo' && (
              <Card className="flex items-center justify-between gap-4 border-cyan-500/30 bg-cyan-500/5">
                <div>
                  <div className="text-cyan-200 font-medium">Demo Mode</div>
                  <div className="text-slate-400 text-sm">Using a simulated AT32 device so users can explore the UI without real serial hardware.</div>
                </div>
                <div className="text-cyan-300 text-xs uppercase tracking-[0.2em] font-bold">Simulation</div>
              </Card>
            )}

            {detectedFamily === 'at32f43x' && (
              <Card className="space-y-3">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-slate-300 font-medium">AT32F43x Device Profile</div>
                    <div className="text-slate-500 text-sm">Choose the exact capacity tier before partial erase.</div>
                  </div>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value as DeviceProfileId | '')}
                    disabled={status === 'working'}
                    className="w-full lg:w-auto lg:min-w-72 text-sm px-3 py-2 rounded-lg bg-slate-900 text-slate-200 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                  >
                    <option value="">Select profile...</option>
                    <option value="at32f43x-xgt7">{DEVICE_PROFILES['at32f43x-xgt7'].label}</option>
                    <option value="at32f43x-xmt7">{DEVICE_PROFILES['at32f43x-xmt7'].label}</option>
                  </select>
                </div>
              </Card>
            )}

            {/* Operations Area */}
            <Card className="space-y-6">
              {/* File Selection */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".bin,.hex,.elf"
                  className="hidden"
                />
                <div className="flex items-center gap-4">
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()} icon={<FileCode className="w-4 h-4" />}>
                    Select Firmware
                  </Button>
                  {fileInfo ? (
                    <div className="flex-1 flex items-center justify-between px-4 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                      <span className="text-slate-200 font-mono text-sm">{fileInfo.name}</span>
                      <div className='text-right'>
                        <span className="text-slate-500 text-xs block">{(fileInfo.size / 1024).toFixed(1)} KB</span>
                        <span className="text-slate-600 text-[10px] block">{fileInfo.segments.length} Segment(s)</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic text-sm">Supports .bin, .hex, .elf</span>
                  )}
                </div>
              </div>

              <div className="h-px bg-slate-800/50" />

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Button
                  onClick={erase}
                  variant="danger"
                  disabled={status === 'working'}
                  icon={<RotateCcw className="w-4 h-4" />}
                >
                  Full Chip Erase
                </Button>
                <Button
                  onClick={program}
                  variant="success"
                  disabled={!fileInfo || status === 'working'}
                  icon={<Play className="w-4 h-4" />}
                >
                  Write to Flash
                </Button>
                <Button
                  onClick={verify}
                  variant="secondary"
                  disabled={!fileInfo || status === 'working'}
                  icon={<CheckCircle className="w-4 h-4" />}
                >
                  Verify Flash
                </Button>
              </div>

              {/* Progress */}
              {status === 'working' && (
                <div className="pt-4 border-t border-slate-800/50">
                  <ProgressBar progress={progress} label={progressLabel} status="Processing" />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Logs */}
        <Card className="p-0 overflow-hidden bg-black/20">
          <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800/50 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Log</span>
          </div>
          <LogViewer logs={logs} />
        </Card>

      </div>
    </div>
  )
}

export default App
