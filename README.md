# AT32 ISP Web UI

A browser-based firmware programming utility for AT32 microcontrollers using Web Serial API.

[![Build and Release](https://github.com/HumpbackLab/AT32-WebISP/actions/workflows/release.yml/badge.svg)](https://github.com/HumpbackLab/AT32-WebISP/actions/workflows/release.yml)

## Features

- 🌐 **Browser-Based** - No installation required, runs entirely in your browser
- 📦 **Single File Distribution** - Built as a standalone HTML file for easy sharing
- 🔌 **Web Serial API** - Direct USB-TTL communication without drivers
- 📁 **Multiple Format Support** - Supports `.bin`, `.hex`, and `.elf` firmware files
- ⚡ **Full Bootloader Control** - Erase, program, and verify flash memory
- 🎨 **Modern UI** - Clean, responsive interface built with React and Tailwind CSS

## Quick Start

### Option 1: Download Pre-built Release

1. Download the latest `index.html` from [Releases](https://github.com/HumpbackLab/AT32-WebISP/releases)
2. Open the file in a modern browser (Chrome or Edge recommended)
3. Connect your AT32 device and start programming

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/HumpbackLab/AT32-WebISP.git
cd AT32-WebISP

# Install dependencies
npm install

# Build single-file HTML
npm run build

# Output will be in dist/index.html
```

## Usage

### Hardware Setup

1. **Enter Bootloader Mode**
   - Connect BOOT0 pin to HIGH (3.3V)
   - Reset the microcontroller
   - The device will enter bootloader mode

2. **USB-TTL Connection**
   - Connect USB-TTL adapter to your AT32's UART pins
   - Common configurations: UART1 (PA9/PA10) or UART3

### Programming Steps

1. **Connect Device**
   - Click "Connect Device" button
   - Select the correct serial port from the browser dialog
   - Default baud rate: 115200 (configurable)

2. **Load Firmware**
   - Click "Select Firmware" and choose your file
   - Supported formats: `.bin`, `.hex`, `.elf`

3. **Program Flash**
   - **Full Chip Erase**: Erase entire flash memory
   - **Write to Flash**: Program the selected firmware
   - **Verify Flash**: Verify written data matches firmware file

## Supported Formats

| Format | Description | Base Address |
|--------|-------------|--------------|
| `.bin` | Raw binary | 0x08000000 (default) |
| `.hex` | Intel HEX | Extracted from file |
| `.elf` | ELF executable | Extracted from loadable segments |

## AT32 Bootloader Protocol

This tool implements the AT32 UART bootloader protocol with the following commands:

- `0x00` - Get Commands
- `0x01` - Get Version
- `0x02` - Get ID
- `0x11` - Read Memory
- `0x21` - Go (Execute)
- `0x31` - Write Memory
- `0x44` - Extended Erase
- `0xAC` - Firmware CRC

## Browser Compatibility

Requires a browser with Web Serial API support:

- ✅ Chrome 89+
- ✅ Edge 89+
- ✅ Opera 75+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

**Note**: HTTPS or localhost is required for Web Serial API access.

## Development

```bash
# Development server with hot reload
npm run dev

# Type checking
npm run lint

# Build for production
npm run build
```

### Project Structure

```
AT32-WebISP/
├── src/
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   ├── components/          # UI components
│   │   ├── Common.tsx       # Reusable UI elements
│   │   └── LogViewer.tsx    # System log viewer
│   ├── drivers/             # Protocol implementation
│   │   ├── AT32Protocol.ts  # AT32 bootloader protocol
│   │   └── SerialInterface.ts # Web Serial API wrapper
│   └── utils/
│       └── FileParsers.ts   # Firmware format parsers
├── .github/
│   └── workflows/
│       └── release.yml      # CI/CD workflow
└── vite.config.ts           # Build configuration
```

## CI/CD

This project includes automated GitHub Actions workflow:

- **Trigger**: Push to `main` branch
- **Actions**:
  1. Build project as single HTML file
  2. Generate timestamped version tag
  3. Create GitHub Release with built file

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- Built with [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- UI styled with [Tailwind CSS](https://tailwindcss.com/)
- Icons from [Lucide React](https://lucide.dev/)
- Single-file build powered by [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)

## Troubleshooting

### "No compatible device found"
- Ensure BOOT0 is HIGH before resetting
- Check UART pin connections
- Verify baud rate matches bootloader configuration

### "Timeout reading response"
- Reset the MCU and try reconnecting
- Confirm correct UART pins (usually UART1 or UART3)
- Try a different baud rate

### "Permission denied" in browser
- Use Chrome or Edge browser
- Access via HTTPS or localhost
- Grant serial port permissions when prompted

## Related Projects

- [AT32 Official Tools](https://www.arterytek.com/) - Official ArteryTek programming tools
- [stm32flash](https://sourceforge.net/projects/stm32flash/) - Similar tool for STM32 via UART

---

**Made with ❤️ for the embedded development community**
