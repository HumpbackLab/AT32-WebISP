# AT32 ISP Web UI

[English README](./README.en.md)

基于浏览器的 AT32 微控制器固件烧写工具，使用 Web Serial API 通过串口与芯片 Bootloader 通信。

[![Build and Release](https://github.com/HumpbackLab/AT32-WebISP/actions/workflows/release.yml/badge.svg)](https://github.com/HumpbackLab/AT32-WebISP/actions/workflows/release.yml)

## 功能特性

- 浏览器内运行，无需安装桌面工具
- 单文件发布，构建后可直接分发 `index.html`
- 基于 Web Serial API 与 USB-TTL 直接通信
- 支持 `.bin`、`.hex`、`.elf` 固件格式
- 支持擦除、烧写、校验等基础 Bootloader 操作
- 使用 React 和 Tailwind CSS 构建界面

## 快速开始

### 方式 1：直接使用在线版本

访问 [https://humpbacklab.github.io/AT32-WebISP/](https://HumpbackLab.github.io/AT32-WebISP/) 即可使用，无需下载。

### 方式 2：下载构建产物

1. 从 [Releases](https://github.com/HumpbackLab/AT32-WebISP/releases) 下载最新的 `index.html`
2. 用现代浏览器打开，推荐 Chrome 或 Edge
3. 连接设备后开始烧写

### 方式 3：从源码构建

```bash
git clone https://github.com/HumpbackLab/AT32-WebISP.git
cd AT32-WebISP
npm install
npm run build
```

构建产物位于 `dist/index.html`。

## 使用方法

### 硬件准备

1. 进入 Bootloader 模式
   - 将 `BOOT0` 拉高到 `3.3V`
   - 复位单片机
   - 芯片将进入内置 Bootloader

2. 连接 USB-TTL
   - 将 USB-TTL 适配器连接到 AT32 的 UART 引脚
   - 常见串口为 `UART1 (PA9/PA10)` 或 `UART3`

### 烧写流程

1. 连接设备
   - 点击 `Connect Device`
   - 在浏览器弹窗中选择正确串口
   - 默认波特率为 `256000`，可按需要手动调整

2. 选择固件
   - 点击 `Select Firmware`
   - 选择 `.bin`、`.hex` 或 `.elf` 文件

3. 执行操作
   - `Full Chip Erase`：整片擦除
   - `Write to Flash`：写入固件
   - `Verify Flash`：回读并校验写入结果

## 支持的文件格式

| 格式 | 说明 | 基地址 |
|------|------|--------|
| `.bin` | 原始二进制 | `0x08000000`（默认） |
| `.hex` | Intel HEX | 从文件内容解析 |
| `.elf` | ELF 可执行文件 | 从可加载段解析 |

## 已实现的 Bootloader 命令

- `0x00` - Get Commands
- `0x01` - Get Version
- `0x02` - Get ID
- `0x11` - Read Memory
- `0x21` - Go
- `0x31` - Write Memory
- `0x44` - Extended Erase
- `0xAC` - Firmware CRC

## 浏览器兼容性

需要浏览器支持 Web Serial API：

- Chrome 89+
- Edge 89+
- Opera 75+
- Firefox：不支持
- Safari：不支持

注意：Web Serial API 需要在 `HTTPS` 或 `localhost` 下使用。

## 开发

```bash
# 本地开发
npm run dev

# 代码检查
npm run lint

# 生产构建
npm run build
```

## 项目结构

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

项目包含 GitHub Actions 工作流：

- 触发条件：推送到 `main`
- 执行动作：
  1. 构建单文件 HTML
  2. 生成时间戳版本标签
  3. 创建 GitHub Release 并上传产物

## 故障排查

### 浏览器提示找不到兼容设备

- 确认复位前 `BOOT0` 已拉高
- 检查 UART 引脚连接
- 确认波特率设置正确

### 读取响应超时

- 让 MCU 重新进入 Bootloader 模式后再连接
- 确认串口接线正确，优先检查 `UART1` 或 `UART3`
- 尝试降低波特率

### 浏览器提示无权限

- 使用 Chrome 或 Edge
- 通过 `HTTPS` 或 `localhost` 访问页面
- 在浏览器弹窗中授予串口访问权限

## 相关项目

- [AT32 Official Tools](https://www.arterytek.com/)：ArteryTek 官方工具
- [stm32flash](https://sourceforge.net/projects/stm32flash/)：类似的 STM32 串口烧写工具

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT
