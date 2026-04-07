# AT32 ISP Web UI

[中文 README](./README.md)

A browser-based firmware programming utility for AT32 microcontrollers using Web Serial API.

[![Build and Release](https://github.com/HumpbackLab/AT32-WebISP/actions/workflows/release.yml/badge.svg)](https://github.com/HumpbackLab/AT32-WebISP/actions/workflows/release.yml)

## Features

- Browser-based workflow with no desktop installation
- Single-file distribution via built `index.html`
- Direct USB-TTL communication through Web Serial API
- Support for `.bin`, `.hex`, and `.elf` firmware files
- Core bootloader operations: erase, program, and verify
- UI built with React and Tailwind CSS

## Quick Start

### Option 1: Use the Online Version

Visit [https://humpbacklab.github.io/AT32-WebISP/](https://humpbacklab.github.io/AT32-WebISP/) and use it directly in the browser.

### Option 2: Download a Release Build

1. Download the latest `index.html` from [Releases](https://github.com/HumpbackLab/AT32-WebISP/releases)
2. Open it in a modern browser, preferably Chrome or Edge
3. Connect your target and start programming

### Option 3: Build from Source

```bash
git clone https://github.com/HumpbackLab/AT32-WebISP.git
cd AT32-WebISP
npm install
npm run build
```

The output file is `dist/index.html`.

## Usage

### Hardware Setup

1. Enter Bootloader mode
   - Pull `BOOT0` high to `3.3V`
   - Reset the MCU
   - The chip will boot into its internal bootloader

2. Connect USB-TTL
   - Connect the USB-TTL adapter to the AT32 UART pins
   - Common ports are `UART1 (PA9/PA10)` or `UART3`

### Programming Flow

1. Connect the device
   - Click `Connect Device`
   - Select the correct serial port in the browser prompt
   - The default baud rate is `256000`, and it remains configurable

2. Select firmware
   - Click `Select Firmware`
   - Choose a `.bin`, `.hex`, or `.elf` file

3. Run operations
   - `Full Chip Erase`: erase the whole flash
   - `Write to Flash`: program the firmware
   - `Verify Flash`: read back and verify written data

## Supported Formats

| Format | Description | Base Address |
|--------|-------------|--------------|
| `.bin` | Raw binary | `0x08000000` (default) |
| `.hex` | Intel HEX | Parsed from file content |
| `.elf` | ELF executable | Parsed from loadable segments |

## Implemented Bootloader Commands

- `0x00` - Get Commands
- `0x01` - Get Version
- `0x02` - Get ID
- `0x11` - Read Memory
- `0x21` - Go
- `0x31` - Write Memory
- `0x44` - Extended Erase
- `0xAC` - Firmware CRC

## Browser Compatibility

Web Serial API support is required:

- Chrome 89+
- Edge 89+
- Opera 75+
- Firefox: not supported
- Safari: not supported

Note: Web Serial API requires `HTTPS` or `localhost`.

## Development

```bash
# Local development
npm run dev

# Lint
npm run lint

# Production build
npm run build
```

## Project Structure

```text
AT32-WebISP/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── Common.tsx
│   │   └── LogViewer.tsx
│   ├── drivers/
│   │   ├── AT32Protocol.ts
│   │   └── SerialInterface.ts
│   └── utils/
│       └── FileParsers.ts
├── .github/
│   └── workflows/
│       └── release.yml
└── vite.config.ts
```

## CI/CD

The repository includes a GitHub Actions workflow:

- Trigger: push to `main`
- Actions:
  1. Build a single-file HTML artifact
  2. Generate a timestamped version tag
  3. Create a GitHub Release and upload the built artifact

## Troubleshooting

### No compatible device found

- Ensure `BOOT0` is high before reset
- Check UART wiring
- Verify the selected baud rate

### Timeout reading response

- Re-enter Bootloader mode and reconnect
- Double-check the UART wiring, especially `UART1` or `UART3`
- Try a lower baud rate

### Permission denied in browser

- Use Chrome or Edge
- Open the page via `HTTPS` or `localhost`
- Grant serial-port permission when prompted

## Related Projects

- [AT32 Official Tools](https://www.arterytek.com/): official ArteryTek tools
- [stm32flash](https://sourceforge.net/projects/stm32flash/): a similar UART flashing tool for STM32

## Contributing

Issues and pull requests are welcome.

## License

MIT
