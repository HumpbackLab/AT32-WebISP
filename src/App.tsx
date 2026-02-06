
import { useState, useRef } from 'react'
import { WebSerialInterface, MockSerialInterface } from './drivers/SerialInterface'
import type { ISerialInterface } from './drivers/SerialInterface'
import { AT32Protocol } from './drivers/AT32Protocol'
import { Card, Button, ProgressBar } from './components/Common'
import { LogViewer } from './components/LogViewer'
import { Cpu, Zap, RotateCcw, FileCode, Play, AlertCircle } from 'lucide-react'

// --- Types ---
type AppStatus = 'disconnected' | 'connecting' | 'connected' | 'working' | 'error';
interface LogEntry { id: number; time: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }

function App() {
  // --- State ---
  const [status, setStatus] = useState<AppStatus>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<{ pid: number, projectID: number, version: number } | null>(null);
  const [file, setFile] = useState<{ name: string, data: Uint8Array } | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [useMock, setUseMock] = useState(false);

  // --- Refs ---
  const serialRef = useRef<ISerialInterface | null>(null);
  const protocolRef = useRef<AT32Protocol | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---
  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-100), { id: Date.now(), time, message: msg, type }]);
  };

  // --- Actions ---
  const connect = async () => {
    try {
      setStatus('connecting');
      addLog(useMock ? 'Connecting to Mock Device...' : 'Requesting Serial Port...', 'info');

      const serial = useMock ? new MockSerialInterface() : new WebSerialInterface();
      await serial.connect({ baudRate: 115200, parity: 'even', dataBits: 8, stopBits: 1 });
      serialRef.current = serial;

      const protocol = new AT32Protocol(serial);
      protocolRef.current = protocol;

      addLog('Port Opened. Syncing...', 'info');
      await protocol.sync();
      addLog('Sync OK. Getting Device Info...', 'success');

      const id = await protocol.getID();
      const ver = await protocol.getVersion(); // Optional if supported

      setDeviceInfo({ ...id, version: ver.version });
      setStatus('connected');
      addLog(`Connected: PID 0x${id.pid.toString(16).toUpperCase()} (Ver ${ver.version})`, 'success');

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      addLog(`Connection Failed: ${err.message}`, 'error');
      if (serialRef.current) {
        await serialRef.current.disconnect();
        serialRef.current = null;
      }
    }
  };

  const disconnect = async () => {
    try {
      if (serialRef.current) await serialRef.current.disconnect();
    } catch (err: any) {
      console.error(err);
    } finally {
      serialRef.current = null;
      protocolRef.current = null;
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
      setFile({ name: f.name, data: new Uint8Array(buf) });
      addLog(`Loaded ${f.name} (${buf.byteLength} bytes)`, 'info');
    } catch (err: any) {
      addLog(`Failed to load file: ${err.message}`, 'error');
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
    } catch (err: any) {
      addLog(`Erase Failed: ${err.message}`, 'error');
    } finally {
      setStatus('connected');
    }
  };

  const program = async () => {
    if (!protocolRef.current || !file) return;
    try {
      setStatus('working');
      setProgress(0);
      addLog(`Programming ${file.data.length} bytes...`, 'info');

      const chunkSize = 256;
      const totalChunks = Math.ceil(file.data.length / chunkSize);
      const baseAddress = 0x08000000; // AT32 Flash Start

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.data.length);
        const chunk = file.data.slice(start, end);
        const addr = baseAddress + start;

        await protocolRef.current.writeMemory(addr, chunk);

        const percent = Math.round(((i + 1) / totalChunks) * 100);
        setProgress(percent);
        setProgressLabel(`Writing ${start + chunk.length} bytes to 0x${addr.toString(16)}...`);
      }

      addLog('Programming Complete.', 'success');
    } catch (err: any) {
      addLog(`Programming Failed: ${err.message}`, 'error');
      setStatus('error');
    } finally {
      setStatus('connected');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/30 text-blue-400">
              <Cpu className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                AT32 ISP Tool
              </h1>
              <p className="text-slate-500 text-sm">Web Serial Bootloader Utility</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4 px-3 py-1 bg-slate-900/50 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-xs uppercase tracking-wider font-bold">Mode</span>
              <button
                onClick={() => setUseMock(!useMock)}
                className={`text-xs px-2 py-0.5 rounded ${useMock ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}
              >
                {useMock ? 'MOCK' : 'REAL'}
              </button>
            </div>


            {status === 'disconnected' || status === 'error' || status === 'connecting' ? (
              <Button
                onClick={connect}
                loading={status === 'connecting'}
                icon={<Zap className="w-4 h-4" />}
              >
                {status === 'connecting' ? 'Connecting...' : 'Connect Device'}
              </Button>
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
            <div className="grid grid-cols-3 gap-4">
              <Card className="flex flex-col items-center justify-center py-4 bg-blue-500/5 border-blue-500/20">
                <span className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-1">Status</span>
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  Connected
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
            </div>

            {/* Operations Area */}
            <Card className="space-y-6">
              {/* File Selection */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".bin"
                  className="hidden"
                />
                <div className="flex items-center gap-4">
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()} icon={<FileCode className="w-4 h-4" />}>
                    Select Firmware (.bin)
                  </Button>
                  {file ? (
                    <div className="flex-1 flex items-center justify-between px-4 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                      <span className="text-slate-200 font-mono text-sm">{file.name}</span>
                      <span className="text-slate-500 text-xs">{(file.data.length / 1024).toFixed(1)} KB</span>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic text-sm">No file selected</span>
                  )}
                </div>
              </div>

              <div className="h-px bg-slate-800/50" />

              {/* Actions */}
              <div className="grid grid-cols-2 gap-4">
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
                  disabled={!file || status === 'working'}
                  icon={<Play className="w-4 h-4" />}
                >
                  Write to Flash
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
