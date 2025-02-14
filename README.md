# Alfs FTP Plugin - VS Code FTP Extension

A user-friendly FTP plugin for Visual Studio Code that provides seamless FTP integration with visual feedback and automatic synchronization features.

![Screenshot](images/screenshot.png)

## Key Features

- 🚀 One-click connection with auto-connect option
- 📂 Easy file and folder upload/download with progress indication
- 🎨 Visual status indicators:
  - Blue: Files that are newer locally
  - Orange: Files that exist only on the server
- ⏱️ Automatic timestamp synchronization
- 🔄 Bi-directional synchronization
- 🔍 Integrated debug view
- 📱 Clean and intuitive UI
- 🖱️ Double-click to open files directly
- 📊 Progress bars for all operations

## Getting Started

1. Create an `ftp-settings.json` in your project root:
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
    "ui": {
        "newerLocalColor": "#0066cc",
        "showIcons": true
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
* `ignoreCertificateErrors`: Ignore SSL certificate errors
* `rejectUnauthorized`: Reject unauthorized SSL certificates
* `showFileActions`: Show upload/download icons
* `compareTimestamps`: Enable timestamp comparison
* `ui.newerLocalColor`: Color for newer local files
* `ui.showIcons`: Show file type icons

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

### 0.0.1
- Initial release
- Basic FTP functionality
- Visual file status indicators
- Auto-connect feature
- Timestamp synchronization
- Debug view
- Folder expansion toggle

## Contributing

Found a bug or have a feature request? Please open an issue on our GitHub repository.

## License

This extension is licensed under the MIT License.

---

**Enjoy seamless FTP integration with Alfs FTP Plugin!**
