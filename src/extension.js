const vscode = require('vscode');
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

class FTPTreeDataProvider {
    constructor(workspaceRoot) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.workspaceRoot = workspaceRoot;
        this.client = new ftp.Client(30000); // Timeout auf 30 Sekunden setzen
        this.isConnected = false;
        
        // Debug-Logging aktivieren
        this.client.ftp.verbose = true;
    }

    async connect() {
        try {
            const settingsPath = path.join(this.workspaceRoot, 'ftp-settings.json');
            console.log('Loading settings from:', settingsPath);
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            
            console.log('Connecting to FTP server...');
            await this.client.access({
                host: settings.host,
                user: settings.user,
                password: settings.password,
                port: settings.port,
                secure: settings.secure,
                secureOptions: {
                    rejectUnauthorized: false // Zertifikatsprüfung deaktivieren
                }
            });
            
            this.isConnected = true;
            console.log('FTP connection established');
            this.refresh();
            vscode.window.showInformationMessage('FTP: Verbindung hergestellt');
        } catch (error) {
            console.error('FTP connection error:', error);
            vscode.window.showErrorMessage(`FTP-Verbindungsfehler: ${error.message}`);
        }
    }

    async getLocalModTime(localPath) {
        try {
            const stats = fs.statSync(localPath);
            return stats.mtime;
        } catch {
            return new Date(0);
        }
    }

    async getFTPItems(remotePath) {
        if (!this.isConnected) {
            console.log('Not connected, returning empty list');
            return [];
        }

        try {
            // Verwende den root-Pfad aus den Einstellungen
            const settingsPath = path.join(this.workspaceRoot, 'ftp-settings.json');
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const rootPath = settings.root || '/';

            // Kombiniere root mit remotePath
            const fullPath = path.posix.join(rootPath, remotePath === '/' ? '' : remotePath);
            console.log('Listing FTP directory:', fullPath);

            const list = await this.client.list(fullPath);
            console.log('FTP directory contents:', list);

            const items = await Promise.all(list.map(async item => {
                // Konstruiere den lokalen Pfad relativ zum Workspace
                const relativePath = remotePath === '/' ? item.name : path.posix.join(remotePath, item.name);
                const localPath = path.join(this.workspaceRoot, relativePath);
                
                const remoteModTime = item.modifiedAt || new Date(0);
                const localModTime = await this.getLocalModTime(localPath);
                const isNewerLocally = localModTime > remoteModTime;

                console.log(`File: ${item.name}
                    Local path: ${localPath}
                    Local time: ${localModTime}
                    Remote time: ${remoteModTime}
                    Newer locally: ${isNewerLocally}`);

                return {
                    name: item.name,
                    isDirectory: item.type === ftp.FileType.Directory,
                    path: relativePath,
                    isNewerLocally,
                    localModTime,
                    remoteModTime
                };
            }));

            return items;
        } catch (error) {
            console.error('Error listing FTP directory:', error);
            vscode.window.showErrorMessage(`FTP Error: ${error.message}`);
            return [];
        }
    }

    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(
            element.name,
            element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        // Basis-Icon setzen
        treeItem.iconPath = element.isDirectory ? 
            new vscode.ThemeIcon('folder') : 
            new vscode.ThemeIcon('file');

        if (!element.isDirectory) {
            treeItem.contextValue = 'file-actions';
        }

        // Styling für neuere lokale Dateien
        if (element.isNewerLocally) {
            treeItem.description = '(Lokal neuer)';
            treeItem.tooltip = `Lokal: ${element.localModTime.toLocaleString()}\nRemote: ${element.remoteModTime.toLocaleString()}`;
            treeItem.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.blue'));
        }

        return treeItem;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    async getChildren(element) {
        if (!this.isConnected) {
            return []; // Keine Elemente anzeigen, wenn keine Verbindung besteht
        }

        try {
            if (!element) {
                // Root-Verzeichnis
                return this.getFTPItems('/');
            }
            // Unterverzeichnisse
            return this.getFTPItems(element.path);
        } catch (error) {
            console.error('Error getting children:', error);
            return [];
        }
    }
}

function activate(context) {
    console.log('Activating FTP extension...');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    console.log('Workspace root:', workspaceRoot);
    
    const ftpTreeDataProvider = new FTPTreeDataProvider(workspaceRoot);
    vscode.window.registerTreeDataProvider('ftpExplorer', ftpTreeDataProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('alfsftpplugin2.connect', () => {
            console.log('Connect command triggered');
            ftpTreeDataProvider.connect();
        }),

        vscode.commands.registerCommand('ftpExplorer.downloadFile', (item) => {
            console.log('Downloading:', item);
            vscode.window.showInformationMessage(`Downloading ${item.name}`);
        }),

        vscode.commands.registerCommand('ftpExplorer.uploadFile', (item) => {
            console.log('Uploading:', item);
            vscode.window.showInformationMessage(`Uploading ${item.name}`);
        })
    );

    // Automatisch verbinden beim Start
    ftpTreeDataProvider.connect();
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}; 