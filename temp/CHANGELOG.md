# Change Log

All notable changes to the "alfsftpplugin" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.9] - 2024-02-13

### Added
- Support for configurable timestamp formats (EU/US)
- Enhanced SFTP connection handling
- Improved remote directory path handling

### Changed
- Fixed infinite loop in connection handling
- Optimized client reuse
- Enhanced debug output for connection status

## [0.0.8] - 2024-02-12

### Added
- Support for custom port configuration
- Default ports for different protocols (FTP: 21, SFTP: 22, FTPS: 990)

### Changed
- Updated documentation with port configuration examples
- Enhanced connection handling for different protocols

## [0.0.7] - 2024-02-11

### Changed
- Updated extension categories to use officially supported VS Code Marketplace categories
- Removed invalid "FTP" category

## [0.0.6] - 2024-02-11

### Changed
- Fixed repository URL in package.json
- Updated documentation links

## [0.0.5] - 2024-02-11

### Changed
- Improved documentation readability
- Enhanced JSON configuration examples
- Added detailed settings explanations
- Fixed JSON formatting in documentation

## [0.0.4] - 2024-02-11

### Added
- Initial release with core FTP functionality
- FTP Explorer view in sidebar
- Automatic file synchronization
- Support for secure FTP connections (FTPS)
- Configurable display modes
- Automatic actions on click
- File and folder creation directly on server

### Changed
- Improved documentation with English translations
- Removed comments from example JSON for better compatibility