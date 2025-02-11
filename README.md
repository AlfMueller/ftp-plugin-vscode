# Alfs FTP Plugin for VS Code

A user-friendly FTP plugin for Visual Studio Code that enables easy file upload and download via FTP.

## Features

### File Operations
- 📤 Upload files via FTP
- 📥 Download files from FTP server
- 📂 Synchronize folder structure
- 🆕 Create new files and folders directly on the server
- 🔄 Automatic detection of newer local files

### Automation
- ⚡ Automatic upload on save (optional)
- 🖱️ Automatic actions on click (configurable):
  - Upload newer files
  - Download server files
- 💾 Timestamp synchronization between local and server files

### User Interface
- 🌳 FTP Explorer in sidebar
- 🎨 Color highlighting for newer local files
- 📊 Various display modes:
  - Timestamp
  - File size
  - Names only

### Security
- 🔒 Support for secure FTP connections (FTPS)
- ⚙️ Configuration via separate JSON file
- 🔑 Secure credential storage

## Installation

1. Open VS Code
2. Open Extensions view (`Ctrl+Shift+X`)
3. Search for "Alfs FTP Plugin"
4. Click "Install"

## Configuration

### 1. Via ftp-settings.json (recommended)

Create an `ftp-settings.json` in your project's root directory:

```json
{
    "host": "ftp.your-domain.com",
    "username": "your_username",
    "password": "your_password",
    "remoteDirectory": "/public_html",
    "secure": false,
    "display": {
        "mode": "timestamp"
    },
    "autoActions": {
        "uploadOnClick": true,
        "downloadOnClick": true
    }
}
```

### 2. Via VS Code Settings
Use the "FTP: Configure Settings" command in the Command Palette (`Ctrl+Shift+P`).

## Usage

### FTP Explorer
- 👁️ Open the FTP view in the sidebar
- 📂 Navigate through server structure
- 🔍 View timestamps and file sizes
- 🔄 Refresh view with the refresh button

### Uploading Files
- 📤 Via context menu in Explorer
- ⌨️ Using keyboard shortcut `Ctrl+Alt+U`
- 💾 Automatically on save (if enabled)
- 🖱️ By clicking the upload arrow on newer files

### Downloading Files
- 📥 Via Command Palette (`Ctrl+Shift+P` → "FTP: Download File")
- ⌨️ Using keyboard shortcut `Ctrl+Alt+D`
- 🖱️ By clicking the download arrow in FTP view

### Creating New Items
- 📄 New File: Click "New File" in FTP view
- 📁 New Folder: Click "New Folder" in FTP view
- 📝 Files automatically open in editor

## Keyboard Shortcuts
- `Ctrl+Alt+U` - Upload file
- `Ctrl+Alt+D` - Download file
- `Ctrl+Alt+C` - Configure FTP settings

## Detailed Documentation
For detailed configuration instructions, see [FTP-SETTINGS-README.md](FTP-SETTINGS-README.md).

## Security Notes
- ⚠️ Don't store sensitive data in version control
- 🚫 Add `ftp-settings.json` to your `.gitignore`
- 🔒 Use FTPS when possible
- 👤 Use an FTP user with minimal required permissions

## Troubleshooting
If you encounter issues:
1. Check the debug output in VS Code
2. Consult the [FTP-SETTINGS-README.md](FTP-SETTINGS-README.md)
3. Create an issue in the GitHub repository

## License
MIT

## Developer
- AlfMueller
- [GitHub](https://github.com/AlfMueller/ftp-plugin-vscode)