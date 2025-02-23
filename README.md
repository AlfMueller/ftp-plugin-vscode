# Alfs FTP Plugin for Visual Studio Code

A powerful and user-friendly FTP plugin for Visual Studio Code with advanced features for file synchronization.

## Main Features

- 🔒 **Advanced SSL/TLS Support**
  - Configurable security settings
  - Certificate validation options
- 🌈 **Customizable User Interface**
  - Configurable colors for different file states
  - Selectable date formats (EU/US)
  - Optional icon display
- 🌍 **Multilingual Support**
  - English and German available
  - Easy language selection in settings
- 🔄 **Intelligent Synchronization**
  - Timestamp comparison for precise updates
  - Visual highlighting of file differences
- 🛠️ **Automatic Configuration Updates**
  - Seamless update of existing settings
  - Preservation of custom values

## Installation

1. Open Visual Studio Code
2. Go to Extension Marketplace (Ctrl+Shift+X)
3. Search for "Alfs FTP Plugin"
4. Click Install

## Configuration

Create an `ftp-settings.json` file in your workspace with the following options:

```json
{
  "host": "ftp.example.com",
  "user": "username",
  "password": "password",
  "port": 21,
  "secure": false,
  "root": "/",
  "name": "FTP Server",
  "ignoreCertificateErrors": true,
  "rejectUnauthorized": false,
  "showFileActions": true,
  "compareTimestamps": true,
  "language": "en",
  "ui": {
    "newerLocalColor": "#0066cc",
    "remoteOnlyColor": "#ff6b6b",
    "showIcons": true,
    "dateFormat": "EU"
  }
}
```

### Settings Explanation

- **Basic Settings**
  - `host`: FTP server address
  - `user`: Username
  - `password`: Password
  - `port`: FTP port (default: 21)
  - `secure`: Enable FTPS (true/false)
  - `root`: Remote root directory

- **Advanced Settings**
  - `name`: Display name for the server
  - `ignoreCertificateErrors`: Ignore SSL certificate errors
  - `rejectUnauthorized`: SSL certificate validation
  - `showFileActions`: Show file actions in UI
  - `compareTimestamps`: Enable timestamp comparison

- **UI Settings**
  - `newerLocalColor`: Color for newer local files
  - `remoteOnlyColor`: Color for remote-only files
  - `showIcons`: Show icons in tree view
  - `dateFormat`: Date format (EU/US)

- **Language Settings**
  - `language`: Language (en/de)

## Usage

1. Open the FTP Explorer in the sidebar
2. Connect to the FTP server
3. Navigate through the directory structure
4. Use context menus for upload/download
5. Observe changes through color highlighting

## Keyboard Shortcuts

- `Ctrl+Alt+U`: Upload file
- `Ctrl+Alt+D`: Download file
- `Ctrl+Alt+C`: Open settings

## Support

For questions or issues, please visit our [GitHub page](https://github.com/AlfMueller/ftp-plugin-vscode).

## License

MIT - see [LICENSE](LICENSE) for details.

## Key Features

- 🚀 One-click connection with auto-connect option
- 📂 Easy file and folder upload/download with progress indication
- 🎨 Visual status indicators:
  - 🔵 Blue (#0066cc): Files that are newer locally and need to be uploaded
  - 🟠 Orange (#ff8c00): Files that exist only on the server
  - ⚪ Normal: Files that are in sync
- 🎯 Icon indicators in FTP Explorer:
  - 🔌 Connect: Establish FTP connection
  - ❌ Disconnect: Close FTP connection
  - ⬆️ Upload: Upload selected file/folder
  - ⬇️ Download: Download selected file/folder
  - 📝 Debug: Show debug log
  - ➡️ Toggle: Expand/collapse all folders
- ⏱️ Automatic timestamp synchronization
- 🔄 Bi-directional synchronization
- 🔍 Integrated debug view
- 📱 Clean and intuitive UI
- 🖱️ Double-click to open files directly
- 📊 Progress bars for all operations

## Security Notes
- ⚠️ Don't store sensitive data in version control
- 🚫 Add `ftp-settings.json` to your `.gitignore`
- 🔒 Use FTPS when possible
- 👤 Use an FTP user with minimal required permissions

## Getting Started

1. Open the FTP Explorer view in the sidebar
2. The extension will automatically detect that no configuration exists
3. Click "Yes" when prompted to create a sample configuration
4. The `ftp-settings.json` will be created and opened automatically
5. Adjust the settings according to your FTP server:

The generated configuration file will contain these default settings:

```json
{
    "host": "ftp.example.com",
    "user": "username",
    "password": "password",
    "port": 21,
    "secure": false,
    "root": "/",
    "name": "FTP Server",
    "ignoreCertificateErrors": true,
    "rejectUnauthorized": false,
    "showFileActions": true,
    "compareTimestamps": true,
    "language": "en",
    "ui": {
        "newerLocalColor": "#0066cc",
        "remoteOnlyColor": "#ff6b6b",
        "showIcons": true,
        "dateFormat": "EU"
    }
}
```

### Configuration Options

* `host`: FTP server hostname
* `user`: Username for authentication
* `password`: Password for authentication
* `port`: FTP port (default: 21)
* `secure`: Use FTPS (default: false)
* `root`: Root directory on server (default: "/")
* `name`: Display name for the connection
* `ignoreCertificateErrors`: Ignore SSL certificate errors (default: true)
* `rejectUnauthorized`: Reject unauthorized SSL certificates (default: false)
* `showFileActions`: Show upload/download icons in UI (default: true)
* `compareTimestamps`: Enable timestamp comparison (default: true)
* `language`: Interface language, "en" or "de" (default: "en")
* `ui.newerLocalColor`: Color for newer local files (default: "#0066cc")
* `ui.remoteOnlyColor`: Color for remote-only files (default: "#ff6b6b")
* `ui.showIcons`: Show file type icons (default: true)
* `ui.dateFormat`: Date format, "EU" or "US" (default: "EU")

### UI Customization
The extension provides several ways to customize the visual appearance:

1. **Color Settings**
   - `newerLocalColor`: Highlights files that are newer locally
   - `remoteOnlyColor`: Highlights files that only exist on the server

2. **Date Format**
   - `EU`: DD.MM.YYYY HH:mm:ss
   - `US`: MM/DD/YYYY HH:mm:ss AM/PM

3. **Language**
   - `en`: English interface
   - `de`: German interface

4. **Visual Indicators**
   - File status colors
   - File type icons
   - Progress bars for operations
   - Connection status indicators

2. Open the FTP Explorer view in the sidebar
3. Click the connect button or wait for auto-connect
4. Start working with your files!

## Features in Detail

### Visual File Status
- **Blue files**: Indicate local changes that need to be uploaded
- **Orange files**: Show server-only files that aren't downloaded yet
- **Normal files**: In sync between local and server

### File Operations
- **Upload**: Click the upload icon next to any local file
- **Download**: Click the download icon next to any server file
- **Open**: Double-click any file to open it in the editor
- **Bulk Operations**: Upload/download entire folders with progress tracking

### Navigation
- **Expand/Collapse All**: Toggle all folders with one click
- **Auto-refresh**: View updates automatically after operations
- **Debug Log**: Quick access to operation details

## Extension Settings

This extension contributes the following settings:

* `alfsftpplugin.autoConnect`: Enable/disable automatic connection on startup
* `alfsftpplugin.defaultPort`: Set the default FTP port (default: 21)

## Requirements

- Visual Studio Code 1.87.0 or newer
- Active FTP server connection
- Basic FTP server credentials

## Known Issues

Please report issues on our [GitHub repository](https://github.com/AlfMueller/ftp-plugin-vscode/issues)

## Release Notes

See our [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## Contributing

Found a bug or have a feature request? Please open an issue on our GitHub repository.

## License

This extension is licensed under the MIT License.

---

**Enjoy seamless FTP integration with Alfs FTP Plugin!**

## Keyboard Shortcuts
- `Ctrl+Alt+U` - Upload file
- `Ctrl+Alt+D` - Download file
- `Ctrl+Alt+C` - Configure FTP settings

## Troubleshooting
If you encounter issues:
1. Check the debug output (Debug icon in FTP Explorer)
2. Verify your ftp-settings.json configuration
3. Check your connection settings
4. Create an issue on GitHub if the problem persists
