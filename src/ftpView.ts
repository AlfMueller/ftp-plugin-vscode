import * as vscode from 'vscode';
import * as ftp from 'basic-ftp';
import * as path from 'path';

interface FTPItem {
    name: string;
    isDirectory: boolean;
    path: string;
    isNewerLocally: boolean;
    localModTime?: Date;
    remoteModTime?: Date;
}

export class FTPTreeDataProvider implements vscode.TreeDataProvider<FTPItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FTPItem | undefined | null | void> = new vscode.EventEmitter<FTPItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FTPItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private client: ftp.Client;

    constructor(private workspaceRoot: string) {
        this.client = new ftp.Client();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FTPItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.name,
            element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        // Basis-Icons für Dateien und Ordner
        if (element.isDirectory) {
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'directory';
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('file');
            treeItem.contextValue = 'file';
            
            // Aktions-Buttons für alle Dateien aktivieren
            treeItem.contextValue += '-actions';
        }

        // Spezielle Darstellung für neuere lokale Dateien
        if (element.isNewerLocally) {
            // Label mit blauer Farbe
            treeItem.label = {
                label: element.name,
                highlights: [[0, element.name.length]] // Markiert den gesamten Namen
            };
            
            // Status-Badge und Tooltip
            treeItem.description = '(Lokal neuer)';
            treeItem.tooltip = `Lokal: ${element.localModTime}\nRemote: ${element.remoteModTime}`;
            
            // Blaues Icon
            treeItem.iconPath = new vscode.ThemeIcon(
                'arrow-up',
                new vscode.ThemeColor('charts.blue') // Verwendet VSCode's eingebaute blaue Farbe
            );
        }

        return treeItem;
    }

    async getChildren(element?: FTPItem): Promise<FTPItem[]> {
        if (!element) {
            // Root-Verzeichnis
            return this.getFTPItems('/');
        }
        return this.getFTPItems(element.path);
    }

    private async getFTPItems(remotePath: string): Promise<FTPItem[]> {
        try {
            const list = await this.client.list(remotePath);
            const items: FTPItem[] = [];

            for (const item of list) {
                const remoteModTime = item.modifiedAt;
                const localPath = path.join(this.workspaceRoot, item.name);
                const localModTime = await this.getLocalModTime(localPath);

                items.push({
                    name: item.name,
                    isDirectory: item.type === ftp.FileType.Directory,
                    path: path.join(remotePath, item.name),
                    isNewerLocally: localModTime > remoteModTime,
                    localModTime,
                    remoteModTime
                });
            }

            return items;
        } catch (error) {
            vscode.window.showErrorMessage(`Fehler beim Laden der FTP-Items: ${error}`);
            return [];
        }
    }

    private async getLocalModTime(localPath: string): Promise<Date> {
        try {
            const stats = await vscode.workspace.fs.stat(vscode.Uri.file(localPath));
            return new Date(stats.mtime);
        } catch {
            return new Date(0);
        }
    }
}

// Command-Handler registrieren
export function registerFTPCommands(context: vscode.ExtensionContext, provider: FTPTreeDataProvider) {
    context.subscriptions.push(
        vscode.commands.registerCommand('ftpExplorer.downloadFile', async (item: FTPItem) => {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Downloading ${item.name}...`,
                    cancellable: false
                }, async () => {
                    // Download-Logik hier implementieren
                    vscode.window.showInformationMessage(`Downloaded ${item.name}`);
                    provider.refresh();
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Download failed: ${error}`);
            }
        }),

        vscode.commands.registerCommand('ftpExplorer.uploadFile', async (item: FTPItem) => {
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Uploading ${item.name}...`,
                    cancellable: false
                }, async () => {
                    // Upload-Logik hier implementieren
                    vscode.window.showInformationMessage(`Uploaded ${item.name}`);
                    provider.refresh();
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Upload failed: ${error}`);
            }
        })
    );
} 