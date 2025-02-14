# Welcome to Alfs FTP Plugin

## Getting Started
1. Install dependencies: `npm install`
2. Create `ftp-settings.json` in your workspace
3. Press F5 to start debugging

## Build
* Run `vsce package` to create VSIX
* Run `vsce publish` to publish to marketplace

## What's in the folder

* This folder contains all of the files necessary for your extension.
* `package.json` - this is the manifest file in which you declare your extension and command.
  * The sample plugin registers a command and defines its title and command name. With this information VS Code can show the command in the command palette. It doesn't yet need to load the plugin.
* `extension.js` - Main extension file containing all FTP functionality

## Configuration

The `ftp-settings.json` supports the following options:
* `host`: FTP server hostname
* `user`: Username for authentication
* `password`: Password for authentication
* `port`: FTP port (default: 21)
* `secure`: Use FTPS (default: false)
* `ignoreCertificateErrors`: Ignore SSL certificate errors
* `showFileActions`: Show upload/download icons
* `compareTimestamps`: Enable timestamp comparison
* `ui`: Visual customization options

## Development

### Debug Features
* Use the integrated debug console to view FTP operations
* Set breakpoints in extension.js to debug specific functionality
* Check the Output panel (FTP Debug) for detailed logs

### Testing
* Test FTP operations with different server configurations
* Verify file synchronization with various file types
* Check error handling with network interruptions

### Common Issues
* Certificate errors with FTPS connections
* Timestamp mismatches between server and local
* Permission issues with certain directories

### Best Practices
* Always handle FTP connection errors
* Implement proper cleanup on deactivation
* Use progress indicators for long operations
* Maintain consistent error messages

### Publishing
1. Update version in package.json
2. Update CHANGELOG.md
3. Run tests: `npm test`
4. Create VSIX: `vsce package`
5. Test the packaged extension
6. Publish: `vsce publish`