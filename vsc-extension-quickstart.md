<<<<<<< HEAD
# Welcome to Alfs FTP Plugin

## Getting Started
1. Install dependencies: `npm install`
2. Create `ftp-settings.json` in your workspace
3. Press F5 to start debugging

## Build
* Run `vsce package` to create VSIX
* Run `vsce publish` to publish to marketplace
=======
# Welcome to your VS Code Extension
>>>>>>> 030dc8ff48000dbbbaa73b5f61eaf08715963d53

## What's in the folder

* This folder contains all of the files necessary for your extension.
* `package.json` - this is the manifest file in which you declare your extension and command.
<<<<<<< HEAD
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
=======
  * The sample plugin registers a command and defines its title and command name. With this information VS Code can show the command in the command palette. It doesn’t yet need to load the plugin.
* `src/extension.ts` - this is the main file where you will provide the implementation of your command.
  * The file exports one function, `activate`, which is called the very first time your extension is activated (in this case by executing the command). Inside the `activate` function we call `registerCommand`.
  * We pass the function containing the implementation of the command as the second parameter to `registerCommand`.

## Get up and running straight away

* Press `F5` to open a new window with your extension loaded.
* Run your command from the command palette by pressing (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and typing `Hello World`.
* Set breakpoints in your code inside `src/extension.ts` to debug your extension.
* Find output from your extension in the debug console.

## Make changes

* You can relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.

## Explore the API

* You can open the full set of our API when you open the file `node_modules/@types/vscode/index.d.ts`.

## Run tests

* Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
* Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
* See the output of the test result in the Test Results view.
* Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.

## Go further

* [Follow UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) to create extensions that seamlessly integrate with VS Code's native interface and patterns.
* Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code extension marketplace.
* Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
* Integrate to the [report issue](https://code.visualstudio.com/api/get-started/wrapping-up#issue-reporting) flow to get issue and feature requests reported by users.
>>>>>>> 030dc8ff48000dbbbaa73b5f61eaf08715963d53
