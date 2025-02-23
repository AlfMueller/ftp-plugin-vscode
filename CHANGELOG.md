# Change Log

All notable changes to the "alfsftpplugin" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.0] - 2024-03-XX

### Added
- Enhanced SSL/TLS Support with advanced security options
  - `ignoreCertificateErrors`: Option to ignore SSL certificate errors
  - `rejectUnauthorized`: Option to control SSL certificate validation
- Improved UI customization
  - Configurable colors for local and remote files
  - Customizable date formats (EU/US)
  - Configurable icon display
- Multilingual support
  - English and German available
  - Configurable via `language` setting
- Advanced file comparison options
  - Timestamp comparison can be enabled/disabled
  - Improved visualization of file differences
- Automatic configuration file updates
  - Existing `ftp-settings.json` automatically extended with new options
  - User settings are preserved

### Changed
- Improved error handling for SSL/TLS connections
- Optimized user interface with configurable colors
- Enhanced logging functionality
- Improved handling of connection interruptions

### Fixed
- Various stability improvements
- Enhanced error handling for connection issues
- Optimized file comparison logic

## [0.1.3] - 2024-03-XX
- Initial version with basic FTP functionality

## [0.1.2] - 2024-02-21
### Added
- New offline functionality
- Improved error logging
- Automatic connection at startup (optional)

### Improved
- Better handling of FTP connections
- Optimized file processing

## [0.1.1] - 2024-02-20
### Added
- Initial public release
- Basic FTP functionality
- File upload and download
- Directory display

## [0.1.0] - 2024-02-14
### Added
- Complete rewrite with improved functionality
- Visual file status indicators (blue/orange)
- Auto-connect feature
- Timestamp synchronization
- Debug view with detailed logging
- Folder expansion toggle
- Double-click to open files
- Progress bars for all operations

### Changed
- Improved file synchronization logic
- Better error handling
- Enhanced visual feedback
- More intuitive UI

### Fixed
- Timestamp comparison for different timezones
- SSL certificate handling
- Directory creation during download

## [0.0.9] - 2024-02-13
- Support for configurable timestamp formats
- Enhanced SFTP connection handling
- Improved remote directory path handling
- Fixed infinite loop in connection handling

## [0.0.4-0.0.8]
- Initial versions with basic functionality
- Core FTP features implementation
- Bug fixes and improvements

## [Upcoming]
### Planned
- SFTP support
- Multiple server configurations
- File filtering options
- Improved progress indicators
