# FTP Settings Guide

## Overview
This guide describes how to configure the FTP settings for the Alfs FTP Plugin.

## Quick Start
1. Copy `ftp-settings.example.json` to `ftp-settings.json`
2. Edit `ftp-settings.json` with your FTP credentials
3. Add `ftp-settings.json` to your `.gitignore`

## Detailed Instructions

### 1. Creating the Configuration File
```bash
# Windows
copy ftp-settings.example.json ftp-settings.json

# Linux/Mac
cp ftp-settings.example.json ftp-settings.json
```

### 2. Configuring ftp-settings.json
Open `ftp-settings.json` and adjust the following settings:

```json
{
    "host": "ftp.your-domain.com",
    "port": 21,
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

The settings explained:
- `host`: Your FTP server address
- `port`: Server port (default: 21 for FTP, 22 for SFTP, 990 for FTPS)
- `username`: Your FTP username
- `password`: Your FTP password
- `remoteDirectory`: Default directory on server (optional)
- `secure`: Enable FTPS (optional, default: false)
- `display.mode`: View mode ("timestamp", "bytes", or "none")
- `autoActions`: Configure automatic actions on click

### 3. Security Notes

#### Setting up .gitignore
Add the following line to your `.gitignore` file:
```
ftp-settings.json
```

This prevents your FTP credentials from accidentally being added to version control.

#### Recommended Security Practices
- Never use `ftp-settings.example.json` for real credentials
- Store `ftp-settings.json` locally only
- Use FTPS when possible (set `"secure": true`)
- Use an FTP user with minimal required permissions
- Change FTP password regularly

## Available Settings

| Setting | Required | Description |
|---------|----------|-------------|
| host | Yes | FTP server address |
| port | No | Server port (default: 21 for FTP, 22 for SFTP, 990 for FTPS) |
| username | Yes | FTP username |
| password | Yes | FTP password |
| remoteDirectory | No | Default directory on server |
| secure | No | Enable FTPS (default: false) |
| display.mode | No | View mode (timestamp/bytes/none) |
| autoActions.uploadOnClick | No | Auto-upload newer files |
| autoActions.downloadOnClick | No | Auto-download files |

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify host, username, and password
   - Ensure FTP server is accessible
   - Check your firewall settings

2. **File Not Found**
   - Check the `remoteDirectory` path
   - Ensure user has access to the directory

3. **Upload Failed**
   - Check write permissions in target directory
   - Ensure sufficient disk space

## Support
If you encounter problems:
1. Check the debug output in VS Code
2. Test FTP connection with an FTP client
3. Create an issue in the GitHub repository 