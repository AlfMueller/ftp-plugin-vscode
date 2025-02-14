// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as ftp from 'basic-ftp';
import * as ssh2 from 'ssh2';
import * as path from 'path';
import * as fs from 'fs';

let ftpClient: ftp.Client | undefined;
let sftpClient: ssh2.Client | undefined;
let outputChannel: vscode.OutputChannel;

// Globale Variable für die Entscheidung "Für alle übernehmen"
let globalDownloadChoice: string | undefined;

interface FtpSettings {
	host: string;
	port?: number;
	username: string;
	password: string;
	remoteDirectory?: string;
	secure?: boolean;
	display?: {
		mode: 'timestamp' | 'bytes' | 'none';
		timestampFormat?: 'US' | 'EU';
	};
	autoActions?: {
		uploadOnClick: boolean;
		downloadOnClick: boolean;
	};
}

async function loadFtpSettings(): Promise<FtpSettings | undefined> {
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error('Kein Workspace-Ordner gefunden');
		}

		const settingsPath = path.join(workspaceFolder.uri.fsPath, 'ftp-settings.json');
		
		if (!fs.existsSync(settingsPath)) {
			vscode.window.showInformationMessage('Keine ftp-settings.json gefunden. Bitte erstellen Sie die Datei im Workspace-Root.');
			return undefined;
		}

		const settingsContent = fs.readFileSync(settingsPath, 'utf8');
		const settings: FtpSettings = JSON.parse(settingsContent);

		// Validiere die erforderlichen Felder
		if (!settings.host || !settings.username || !settings.password) {
			throw new Error('Fehlende erforderliche Felder in ftp-settings.json (host, username, password)');
		}

		return settings;
	} catch (error) {
		vscode.window.showErrorMessage(`Fehler beim Laden der FTP-Einstellungen: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

// Neue Interface-Definition für TreeItem
interface FtpItem {
	name: string;
	isDirectory: boolean;
	size?: number;
	path: string;
	isRoot?: boolean;
	modifiedTime?: Date;
	isNewer?: boolean;
}

class FtpExplorerProvider implements vscode.TreeDataProvider<FtpItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<FtpItem | undefined | null | void> = new vscode.EventEmitter<FtpItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<FtpItem | undefined | null | void> = this._onDidChangeTreeData.event;
	private lastRefreshTime: number = 0;
	private refreshDebounceTime: number = 1000; // 1 Sekunde Verzögerung

	constructor(private ftpClientProvider: () => Promise<ftp.Client>) {}

	dispose() {
		// Leere dispose-Methode für die Implementierung des Interface
	}

	refresh(): void {
		const now = Date.now();
		if (now - this.lastRefreshTime > this.refreshDebounceTime) {
			this.lastRefreshTime = now;
			this._onDidChangeTreeData.fire();
		}
	}

	async checkIfLocalNewer(localPath: string, remoteModTime: Date | undefined): Promise<boolean> {
		try {
			if (!fs.existsSync(localPath) || !remoteModTime) {
				return false;
			}

			const stats = await fs.promises.stat(localPath);
			return stats.mtime > remoteModTime;
		} catch (error) {
			console.error('Fehler beim Prüfen der Zeitstempel:', error);
			return false;
		}
	}

	private async getItemDescription(item: FtpItem, displayMode: string): Promise<string> {
		switch (displayMode) {
			case 'timestamp':
				if (item.modifiedTime) {
					const settings = await loadFtpSettings();
					const format = settings?.display?.timestampFormat || 'EU';
					
					if (format === 'US') {
						return item.modifiedTime.toLocaleString('en-US', {
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
							hour12: true
						});
					} else {
						return item.modifiedTime.toLocaleString('de-DE', {
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
							hour12: false
						});
					}
				}
				return '';
			case 'bytes':
				return item.size ? `${item.size} bytes` : '';
			case 'none':
				return '';
			default:
				return item.modifiedTime ? item.modifiedTime.toLocaleString() : '';
		}
	}

	async getTreeItem(element: FtpItem): Promise<vscode.TreeItem> {
		const treeItem = new vscode.TreeItem(
			element.name,
			element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
		);
		
		if (element.isRoot) {
			treeItem.iconPath = new vscode.ThemeIcon('server');
			treeItem.description = 'FTP Root';
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		} else {
			const themeIcon = element.isDirectory ? 'folder' : 'file';
			const settings = await loadFtpSettings();
			const displayMode = settings?.display?.mode || 'timestamp';

			if (element.isNewer) {
				treeItem.iconPath = new vscode.ThemeIcon(themeIcon, new vscode.ThemeColor('ftpPlugin.newerFile'));
				treeItem.description = await this.getItemDescription(element, displayMode) + ' (Lokal neuer)';
				if (settings?.autoActions?.uploadOnClick) {
					treeItem.command = {
						command: 'alfsftpplugin.uploadNewerFile',
						title: 'Upload',
						arguments: [element]
					};
				} else if (!element.isDirectory) {
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
					if (workspaceFolder) {
						const config = vscode.workspace.getConfiguration('alfsFtp');
						const remoteRoot = config.get<string>('remoteDirectory') || '/';
						const relativePath = element.path.startsWith(remoteRoot) 
							? element.path.slice(remoteRoot.length) 
							: element.path;
						const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);
						
						if (fs.existsSync(localPath)) {
							treeItem.command = {
								command: 'vscode.open',
								title: 'Open File',
								arguments: [vscode.Uri.file(localPath)]
							};
						}
					}
				}
			} else {
				treeItem.iconPath = new vscode.ThemeIcon(themeIcon);
				treeItem.description = await this.getItemDescription(element, displayMode);
				if (!element.isDirectory && settings?.autoActions?.downloadOnClick) {
					treeItem.command = {
						command: 'alfsftpplugin.downloadFileFromExplorer',
						title: 'Download',
						arguments: [element]
					};
				} else if (!element.isDirectory) {
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
					if (workspaceFolder) {
						const config = vscode.workspace.getConfiguration('alfsFtp');
						const remoteRoot = config.get<string>('remoteDirectory') || '/';
						const relativePath = element.path.startsWith(remoteRoot) 
							? element.path.slice(remoteRoot.length) 
							: element.path;
						const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);
						
						if (fs.existsSync(localPath)) {
							treeItem.command = {
								command: 'vscode.open',
								title: 'Open File',
								arguments: [vscode.Uri.file(localPath)]
							};
						}
					}
				}
			}
		}
			
		treeItem.contextValue = element.isDirectory ? 'directory' : 'file';
		treeItem.tooltip = `${element.path}\n${element.modifiedTime ? `Geändert: ${element.modifiedTime.toLocaleString()}` : ''}`;

		return treeItem;
	}

	async getChildren(element?: FtpItem): Promise<FtpItem[]> {
		try {
			// Wenn kein Element ausgewählt ist, zeige Root-Ordner
			if (!element) {
				return [{
					name: '/',
					isDirectory: true,
					path: '/',
					isRoot: true
				}];
			}

			// Hole den Client nur, wenn wir tatsächlich Dateien auflisten müssen
			const client = await this.ftpClientProvider();
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			let currentPath: string;
			if (element.isRoot) {
				currentPath = '/';
			} else {
				currentPath = element.path;
			}

			outputChannel.appendLine(`Liste Verzeichnis: ${currentPath}`);
			const list = await client.list(currentPath);
			outputChannel.appendLine(`${list.length} Einträge gefunden`);

			const items = await Promise.all(list.map(async item => {
				const remotePath = path.posix.join(currentPath, item.name);
				let localPath = '';
				
				if (workspaceFolder) {
					const remoteRoot = config.get<string>('remoteDirectory') || '/';
					const relativePath = remotePath.startsWith(remoteRoot) 
						? remotePath.slice(remoteRoot.length) 
						: remotePath;
					localPath = path.join(workspaceFolder.uri.fsPath, relativePath);
				}

				const isNewer = await this.checkIfLocalNewer(localPath, item.modifiedAt);

				return {
					name: item.name,
					isDirectory: item.type === 2,
					size: item.size,
					path: remotePath,
					modifiedTime: item.modifiedAt,
					isNewer
				};
			}));

			return items;
		} catch (error) {
			console.error('Fehler beim Laden der FTP-Struktur:', error);
			vscode.window.showErrorMessage(`Fehler beim Laden der FTP-Struktur: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}
}

class SftpWrapper extends ftp.Client {
	private sftp: ssh2.SFTPWrapper;
	private currentPath: string = '/';
	private remoteRoot: string;

	constructor(sftp: ssh2.SFTPWrapper, initialPath: string = '/') {
		super();
		this.sftp = sftp;
		this.remoteRoot = initialPath.endsWith('/') ? initialPath : `${initialPath}/`;
		this.currentPath = this.remoteRoot;
		outputChannel.appendLine(`SftpWrapper initialisiert mit Root-Pfad: ${this.remoteRoot}`);
		outputChannel.appendLine(`Aktueller Pfad: ${this.currentPath}`);
	}

	async list(path: string = '.'): Promise<ftp.FileInfo[]> {
		return new Promise((resolve, reject) => {
			// Normalisiere den Pfad
			let fullPath: string;
			if (path === '.' || path === './') {
				fullPath = this.currentPath;
			} else if (path === '/') {
				fullPath = this.remoteRoot;
			} else if (path.startsWith('/')) {
				// Wenn der Pfad absolut ist, füge den Remote-Root hinzu
				const relativePath = path.startsWith(this.remoteRoot) ? 
					path : 
					path.replace(/^\//, '');
				fullPath = path.startsWith(this.remoteRoot) ? 
					path : 
					`${this.remoteRoot}${relativePath}`;
			} else {
				// Relativer Pfad, füge zum aktuellen Pfad hinzu
				fullPath = path.startsWith('./') ? 
					`${this.currentPath}${path.slice(2)}` : 
					`${this.currentPath}${path}`;
			}

			// Entferne doppelte Slashes und normalisiere den Pfad
			fullPath = fullPath.replace(/\/+/g, '/');
			outputChannel.appendLine(`Liste Verzeichnis (normalisiert): ${fullPath}`);
			outputChannel.appendLine(`Remote Root: ${this.remoteRoot}`);
			outputChannel.appendLine(`Aktueller Pfad: ${this.currentPath}`);
			
			this.sftp.readdir(fullPath, (err, list) => {
				if (err) {
					outputChannel.appendLine(`Fehler beim Lesen des Verzeichnisses: ${err.message}`);
					reject(err);
					return;
				}
				resolve(list.map(item => {
					const isDirectory = item.attrs.isDirectory();
					const modDate = new Date(item.attrs.mtime * 1000);
					return {
						name: item.filename,
						type: isDirectory ? 2 : 1,
						size: item.attrs.size,
						modifiedAt: modDate,
						rawModifiedAt: modDate.toISOString(),
						isDirectory: isDirectory,
						isSymbolicLink: false,
						isFile: !isDirectory,
						date: modDate.toISOString()
					} as ftp.FileInfo;
				}));
			});
		});
	}

	async cd(path: string): Promise<ftp.FTPResponse> {
		return new Promise((resolve, reject) => {
			// Normalisiere den Pfad
			if (path.startsWith('/')) {
				// Wenn der Pfad absolut ist, füge den Remote-Root hinzu
				const relativePath = path.startsWith(this.remoteRoot) ? 
					path : 
					path.replace(/^\//, '');
				this.currentPath = path.startsWith(this.remoteRoot) ? 
					path : 
					`${this.remoteRoot}${relativePath}`;
			} else {
				// Relativer Pfad, füge zum aktuellen Pfad hinzu
				this.currentPath = `${this.currentPath}${path}/`.replace(/\/+/g, '/');
			}
			
			// Stelle sicher, dass der Pfad mit / endet
			this.currentPath = this.currentPath.endsWith('/') ? this.currentPath : `${this.currentPath}/`;
			
			outputChannel.appendLine(`Wechsle zu Verzeichnis: ${this.currentPath}`);
			outputChannel.appendLine(`Remote Root: ${this.remoteRoot}`);
			
			// Prüfe, ob das Verzeichnis existiert
			this.sftp.realpath(this.currentPath, (err, resolvedPath) => {
				if (err) {
					outputChannel.appendLine(`Fehler beim Wechseln des Verzeichnisses: ${err.message}`);
					reject(err);
					return;
				}
				outputChannel.appendLine(`Verzeichnis aufgelöst zu: ${resolvedPath}`);
				this.currentPath = resolvedPath.endsWith('/') ? resolvedPath : `${resolvedPath}/`;
				resolve({ code: 250, message: "Directory changed successfully" });
			});
		});
	}

	async uploadFrom(source: string | NodeJS.ReadableStream, toRemotePath: string, options?: ftp.UploadOptions): Promise<ftp.FTPResponse> {
		return new Promise((resolve, reject) => {
			try {
				const readStream = typeof source === 'string' ? fs.createReadStream(source) : source;
				const writeStream = this.sftp.createWriteStream(toRemotePath);
				
				writeStream.on('close', () => {
					resolve({ code: 226, message: "Transfer complete" });
				});
				
				writeStream.on('error', (err: Error) => {
					reject(err);
				});
				
				readStream.pipe(writeStream);
			} catch (err) {
				reject(err);
			}
		});
	}

	async downloadTo(destination: string | NodeJS.WritableStream, fromRemotePath: string, startAt?: number): Promise<ftp.FTPResponse> {
		return new Promise((resolve, reject) => {
			try {
				const readStream = this.sftp.createReadStream(fromRemotePath, startAt ? { start: startAt } : undefined);
				const writeStream = typeof destination === 'string' ? fs.createWriteStream(destination) : destination;
				
				writeStream.on('close', () => {
					resolve({ code: 226, message: "Transfer complete" });
				});
				
				writeStream.on('error', (err: Error) => {
					reject(err);
				});
				
				readStream.pipe(writeStream);
			} catch (err) {
				reject(err);
			}
		});
	}

	async ensureDir(remotePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.sftp.mkdir(remotePath, (err) => {
				if (err) {
					// Ignoriere EEXIST Fehler
					if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
						resolve();
						return;
					}
					reject(err);
					return;
				}
				resolve();
			});
		});
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Erstelle Output Channel
	outputChannel = vscode.window.createOutputChannel('Alfs FTP Plugin');
	outputChannel.show();
	
	outputChannel.appendLine('Aktiviere Alfs FTP Plugin...');
	
	// Debug-Logging
	console.log('Activating Alfs FTP Plugin...');
	
	// Registriere die Befehle sofort
	vscode.commands.executeCommand('setContext', 'alfsftpplugin.enabled', true);

	async function getFtpClient(): Promise<ftp.Client> {
		// Wenn bereits ein Client existiert und verbunden ist, verwende diesen
		if (ftpClient) {
			outputChannel.appendLine('Verwende existierenden FTP-Client...');
			return ftpClient;
		}

		outputChannel.appendLine('Versuche FTP-Client zu erstellen...');
		
		// Versuche zuerst die JSON-Einstellungen zu laden
		const jsonSettings = await loadFtpSettings();
		
		outputChannel.appendLine(`Verbindungseinstellungen: 
			Host: ${jsonSettings?.host}
			Port: ${jsonSettings?.port || 21}
			Secure: ${jsonSettings?.secure}
			Username: ${jsonSettings?.username}
			Remote Directory: ${jsonSettings?.remoteDirectory}
		`);
		
		let host: string, port: number, username: string, password: string, remoteDirectory: string | undefined;
		
		if (jsonSettings) {
			// Verwende die JSON-Einstellungen
			host = jsonSettings.host;
			port = jsonSettings.port || 21;
			username = jsonSettings.username;
			password = jsonSettings.password;
			remoteDirectory = jsonSettings.remoteDirectory;
			
			console.log('Using JSON settings with host:', host, 'port:', port);
			
			// Aktualisiere auch die VS Code-Einstellungen für die Kompatibilität
			const config = vscode.workspace.getConfiguration('alfsFtp');
			await config.update('host', host, true);
			await config.update('port', port, true);
			await config.update('username', username, true);
			await config.update('password', password, true);
			if (remoteDirectory) {
				await config.update('remoteDirectory', remoteDirectory, true);
			}
		} else {
			// Fallback auf VS Code-Einstellungen
			const config = vscode.workspace.getConfiguration('alfsFtp');
			host = config.get<string>('host') || '';
			port = config.get<number>('port') || 21;
			username = config.get<string>('username') || '';
			password = config.get<string>('password') || '';
			remoteDirectory = config.get<string>('remoteDirectory');
			
			if (!host || !username || !password) {
				throw new Error('FTP-Konfiguration ist unvollständig. Bitte erstellen Sie eine ftp-settings.json oder konfigurieren Sie die FTP-Einstellungen.');
			}
		}

		// Prüfe, ob SFTP verwendet werden soll (Port 22)
		if (port === 22) {
			outputChannel.appendLine('SFTP-Verbindung wird verwendet (Port 22)...');
			
			// Schließe vorhandene Verbindungen
			if (sftpClient) {
				sftpClient.end();
				sftpClient = undefined;
			}
			if (ftpClient) {
				(ftpClient as ftp.Client).close();
				ftpClient = undefined;
			}
			
			return new Promise((resolve, reject) => {
				outputChannel.appendLine('Erstelle neue SFTP-Verbindung...');
				sftpClient = new ssh2.Client();
				sftpClient
					.on('ready', () => {
						outputChannel.appendLine('SSH-Verbindung hergestellt, fordere SFTP an...');
						sftpClient!.sftp((err, sftp) => {
							if (err) {
								outputChannel.appendLine(`SFTP-Anfrage fehlgeschlagen: ${err.message}`);
								reject(err);
								return;
							}
							outputChannel.appendLine('SFTP-Verbindung erfolgreich hergestellt');
							ftpClient = new SftpWrapper(sftp, remoteDirectory || '/');
							resolve(ftpClient);
						});
					})
					.on('error', (err) => {
						outputChannel.appendLine(`SSH-Verbindungsfehler: ${err.message}`);
						sftpClient = undefined;
						ftpClient = undefined;
						reject(err);
					})
					.on('end', () => {
						outputChannel.appendLine('SSH-Verbindung beendet');
						sftpClient = undefined;
						ftpClient = undefined;
					})
					.on('close', () => {
						outputChannel.appendLine('SSH-Verbindung geschlossen');
						sftpClient = undefined;
						ftpClient = undefined;
					})
					.connect({
						host,
						port,
						username,
						password,
						debug: (debug) => {
							outputChannel.appendLine(`SSH Debug: ${debug}`);
						}
					});
			});
		}

		// Standard FTP/FTPS Verbindung
		// Schließe vorhandene Verbindung
		if (ftpClient) {
			(ftpClient as ftp.Client).close();
			ftpClient = undefined;
		}
		
		ftpClient = new ftp.Client();
		ftpClient.ftp.verbose = true;
		await ftpClient.access({
			host,
			port,
			user: username,
			password,
			secure: jsonSettings?.secure ?? false
		});
		
		// Wechsle in das Remote-Verzeichnis, wenn angegeben
		if (remoteDirectory) {
			await ftpClient.cd(remoteDirectory);
		}

		return ftpClient;
	}

	let uploadFileCommand = vscode.commands.registerCommand('alfsftpplugin.uploadFile', async (fileUri: vscode.Uri) => {
		try {
			const client = await getFtpClient();
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const remoteDirectory = config.get<string>('remoteDirectory') || '/';

			if (!fileUri && vscode.window.activeTextEditor) {
				fileUri = vscode.window.activeTextEditor.document.uri;
			}

			if (!fileUri) {
				throw new Error('No file selected');
			}

			const fileName = path.basename(fileUri.fsPath);
			const remotePath = path.posix.join(remoteDirectory, fileName);

			await client.uploadFrom(fileUri.fsPath, remotePath);
			vscode.window.showInformationMessage(`Successfully uploaded ${fileName}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	let downloadFileCommand = vscode.commands.registerCommand('alfsftpplugin.downloadFile', async () => {
		try {
			const client = await getFtpClient();
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const remoteDirectory = config.get<string>('remoteDirectory') || '/';
			
			console.log('Versuche Dateien zu listen von:', remoteDirectory);
			const files = await client.list(remoteDirectory);
			console.log('Gefundene Dateien:', files);
			
			if (files.length === 0) {
				throw new Error(`Keine Dateien im Verzeichnis ${remoteDirectory} gefunden`);
			}

			const fileItems = files.map(file => ({
				label: file.name || '',
				description: `Size: ${file.size || 0} bytes`
			}));

			console.log('Zeige Dateiauswahl:', fileItems);
			const selectedFile = await vscode.window.showQuickPick(fileItems, {
				placeHolder: 'Wählen Sie eine Datei zum Herunterladen'
			});

			if (!selectedFile) {
				return;
			}

			console.log('Ausgewählte Datei:', selectedFile);
			const saveDialog = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(selectedFile.label)
			});

			if (saveDialog) {
				const remotePath = path.posix.join(remoteDirectory, selectedFile.label);
				console.log('Lade herunter von:', remotePath, 'nach:', saveDialog.fsPath);
				await client.downloadTo(saveDialog.fsPath, remotePath);
				vscode.window.showInformationMessage(`Datei ${selectedFile.label} erfolgreich heruntergeladen`);
			}
		} catch (error) {
			console.error('Download-Fehler:', error);
			vscode.window.showErrorMessage(`Download fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	let configureCommand = vscode.commands.registerCommand('alfsftpplugin.configure', async () => {
		const config = vscode.workspace.getConfiguration('alfsFtp');
		
		const host = await vscode.window.showInputBox({
			prompt: 'Enter FTP host',
			value: config.get('host')
		});

		const username = await vscode.window.showInputBox({
			prompt: 'Enter FTP username',
			value: config.get('username')
		});

		const password = await vscode.window.showInputBox({
			prompt: 'Enter FTP password',
			password: true,
			value: config.get('password')
		});

		const remoteDirectory = await vscode.window.showInputBox({
			prompt: 'Enter remote directory (e.g., /public_html)',
			value: config.get('remoteDirectory')
		});

		if (host) {
			await config.update('host', host, true);
		}
		if (username) {
			await config.update('username', username, true);
		}
		if (password) {
			await config.update('password', password, true);
		}
		if (remoteDirectory) {
			await config.update('remoteDirectory', remoteDirectory, true);
		}

		vscode.window.showInformationMessage('FTP settings updated');
	});

	// Auto-upload on save
	let saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const config = vscode.workspace.getConfiguration('alfsFtp');
		if (config.get<boolean>('autoUploadOnSave')) {
			await vscode.commands.executeCommand('alfsftpplugin.uploadFile', document.uri);
		} else {
			// Aktualisiere die Ansicht nach dem Speichern, um den "Lokal neuer" Status zu aktualisieren
			ftpExplorerProvider.refresh();
		}
	});

	// FTP Explorer Provider registrieren
	const ftpExplorerProvider = new FtpExplorerProvider(getFtpClient);
	vscode.window.registerTreeDataProvider('ftpExplorer', ftpExplorerProvider);

	// TextDocument-Änderungen überwachen
	let textChangeListener = vscode.workspace.onDidChangeTextDocument(() => {
		ftpExplorerProvider.refresh();
	});

	// Füge den TextChangeListener zu den Subscriptions hinzu
	context.subscriptions.push(textChangeListener);

	// FileSystemWatcher für Workspace-Änderungen
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		const fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, '**/*'));
		
		// Bei Dateiänderungen
		fileWatcher.onDidChange(() => {
			ftpExplorerProvider.refresh();
		});
		
		// Bei neuen Dateien
		fileWatcher.onDidCreate(() => {
			ftpExplorerProvider.refresh();
		});
		
		// Bei gelöschten Dateien
		fileWatcher.onDidDelete(() => {
			ftpExplorerProvider.refresh();
		});

		// Füge den Watcher zu den Subscriptions hinzu
		context.subscriptions.push(fileWatcher);
	}

	// Befehl zum Aktualisieren der Ansicht
	let refreshCommand = vscode.commands.registerCommand('alfsftpplugin.refreshFtpView', () => {
		ftpExplorerProvider.refresh();
	});

	async function ensureDirectoryExists(dirPath: string): Promise<void> {
		if (!fs.existsSync(dirPath)) {
			await fs.promises.mkdir(dirPath, { recursive: true });
		}
	}

	async function syncTimestamp(localPath: string, serverModTime: Date | undefined): Promise<void> {
		if (serverModTime) {
			try {
				await fs.promises.utimes(localPath, serverModTime, serverModTime);
			} catch (error) {
				console.error('Fehler beim Synchronisieren des Zeitstempels:', error);
			}
		}
	}

	async function downloadDirectory(client: ftp.Client, remotePath: string, localPath: string, progress?: vscode.Progress<{ message?: string; increment?: number }>, fileModTime?: Date): Promise<void> {
		try {
			// Stelle sicher, dass das lokale Verzeichnis existiert
			await ensureDirectoryExists(localPath);

			// Liste alle Dateien im Remote-Verzeichnis
			const files = await client.list(remotePath);
			
			// Verarbeite jede Datei/Ordner sequentiell
			for (const file of files) {
				const remoteFilePath = path.posix.join(remotePath, file.name);
				const localFilePath = path.join(localPath, file.name);

				if (progress) {
					progress.report({ message: `Verarbeite: ${remoteFilePath}` });
				}

				if (file.type === 2) { // Verzeichnis
					// Erstelle das lokale Verzeichnis, auch wenn es leer ist
					await ensureDirectoryExists(localFilePath);
					// Rekursiver Aufruf für Unterverzeichnisse
					await downloadDirectory(client, remoteFilePath, localFilePath, progress, file.modifiedAt);
					// Synchronisiere den Zeitstempel des Verzeichnisses
					await syncTimestamp(localFilePath, file.modifiedAt);
				} else { // Datei
					// Prüfe, ob die lokale Datei neuer ist
					if (fs.existsSync(localFilePath)) {
						const stats = await fs.promises.stat(localFilePath);
						if (stats.mtime > (file.modifiedAt || new Date(0))) {
							// Wenn keine globale Entscheidung vorliegt, frage den Benutzer
							if (!globalDownloadChoice) {
								const choice = await vscode.window.showWarningMessage(
									`Die Datei "${file.name}" ist lokal neuer. Was möchten Sie tun?`,
									'Überschreiben',
									'Überspringen',
									'Alle überschreiben',
									'Alle überspringen'
								);
								
								// Setze die globale Entscheidung, wenn "Für alle" gewählt wurde
								if (choice === 'Alle überschreiben') {
									globalDownloadChoice = 'Überschreiben';
								} else if (choice === 'Alle überspringen') {
									globalDownloadChoice = 'Überspringen';
								} else {
									// Einzelentscheidung
									if (choice === 'Überspringen') {
										console.log(`Überspringe neuere Datei: ${localFilePath}`);
										continue;
									} else if (!choice) {
										// Wenn der Dialog geschlossen wurde
										throw new Error('Download abgebrochen');
									}
								}
							}
							
							// Prüfe die globale Entscheidung
							if (globalDownloadChoice === 'Überspringen') {
								console.log(`Überspringe neuere Datei (global): ${localFilePath}`);
								continue;
							}
						}
					}
					
					console.log(`Lade herunter: ${remoteFilePath} -> ${localFilePath}`);
					await client.downloadTo(localFilePath, remoteFilePath);
					// Synchronisiere den Zeitstempel
					await syncTimestamp(localFilePath, file.modifiedAt);
				}
			}

			// Synchronisiere den Zeitstempel des aktuellen Verzeichnisses
			if (fileModTime) {
				await syncTimestamp(localPath, fileModTime);
			}

			// Aktualisiere die Ansicht nach jedem verarbeiteten Verzeichnis
			ftpExplorerProvider.refresh();
		} catch (error) {
			throw new Error(`Fehler beim Herunterladen des Verzeichnisses ${remotePath}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// Befehl zum Herunterladen aus dem Explorer
	let downloadFromExplorerCommand = vscode.commands.registerCommand('alfsftpplugin.downloadFileFromExplorer', async (item: FtpItem) => {
		try {
			// Setze die globale Entscheidung zurück
			globalDownloadChoice = undefined;

			const client = await getFtpClient();
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			if (!workspaceFolder) {
				throw new Error('Kein Workspace-Ordner gefunden');
			}

			// Bestimme den relativen Pfad vom Remote-Root
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const remoteRoot = config.get<string>('remoteDirectory') || '/';
			const relativePath = item.path.startsWith(remoteRoot) 
				? item.path.slice(remoteRoot.length) 
				: item.path;
			
			// Erstelle den lokalen Zielpfad
			const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);

			if (item.isDirectory) {
				// Für Verzeichnisse mit Fortschrittsanzeige
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: `Lade Verzeichnis ${item.name} herunter...`,
					cancellable: false
				}, async (progress) => {
					await downloadDirectory(client, item.path, localPath, progress, item.modifiedTime);
				});
				vscode.window.showInformationMessage(`Verzeichnis ${item.name} erfolgreich nach ${localPath} heruntergeladen`);
			} else {
				// Für einzelne Dateien
				// Stelle sicher, dass das Zielverzeichnis existiert
				const localDir = path.dirname(localPath);
				await ensureDirectoryExists(localDir);

				// Prüfe, ob die lokale Datei neuer ist
				if (fs.existsSync(localPath)) {
					const stats = await fs.promises.stat(localPath);
					if (item.modifiedTime && stats.mtime > item.modifiedTime) {
						const choice = await vscode.window.showWarningMessage(
							`Die Datei "${item.name}" ist lokal neuer. Was möchten Sie tun?`,
							'Überschreiben',
							'Überspringen'
						);
						
						if (choice === 'Überspringen') {
							console.log(`Überspringe neuere Datei: ${localPath}`);
							return;
						} else if (!choice) {
							// Wenn der Dialog geschlossen wurde
							return;
						}
					}
				}

				console.log('Lade herunter von:', item.path, 'nach:', localPath);
				await client.downloadTo(localPath, item.path);
				// Synchronisiere den Zeitstempel
				await syncTimestamp(localPath, item.modifiedTime);
				
				vscode.window.showInformationMessage(`Datei ${item.name} erfolgreich nach ${localPath} heruntergeladen`);
				
				// Prüfe die Dateiendung für bekannte Binärdateien
				const binaryExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dll', '.bin', '.iso', '.img', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
				const fileExtension = path.extname(localPath).toLowerCase();
				
				// Öffne die Datei nur, wenn es keine bekannte Binärdatei ist
				if (!binaryExtensions.includes(fileExtension)) {
					try {
						const doc = await vscode.workspace.openTextDocument(localPath);
						await vscode.window.showTextDocument(doc);
					} catch (error) {
						console.log('Datei konnte nicht als Text geöffnet werden:', error);
						// Kein Fehler anzeigen, da die Datei erfolgreich heruntergeladen wurde
					}
				}
			}

			// Aktualisiere die Ansicht nach dem Download
			ftpExplorerProvider.refresh();
		} catch (error) {
			console.error('Download-Fehler:', error);
			vscode.window.showErrorMessage(`Download fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Befehl zum Hochladen in den aktuellen Ordner
	let uploadToFolderCommand = vscode.commands.registerCommand('alfsftpplugin.uploadToFolder', async (folder: FtpItem) => {
		try {
			const client = await getFtpClient();
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			if (!workspaceFolder) {
				throw new Error('Kein Workspace-Ordner gefunden');
			}

			// Bestimme den relativen Pfad vom Remote-Root
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const remoteRoot = config.get<string>('remoteDirectory') || '/';
			const relativePath = folder.path.startsWith(remoteRoot) 
				? folder.path.slice(remoteRoot.length) 
				: folder.path;
			
			// Erstelle den lokalen Pfad
			const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);

			// Prüfe, ob der lokale Ordner existiert
			if (!fs.existsSync(localPath)) {
				await ensureDirectoryExists(localPath);
			}

			// Aktualisiere die Ansicht
			ftpExplorerProvider.refresh();
		} catch (error) {
			console.error('Upload-Fehler:', error);
			vscode.window.showErrorMessage(`Upload fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Befehl zum Hochladen neuerer Dateien
	let uploadNewerFileCommand = vscode.commands.registerCommand('alfsftpplugin.uploadNewerFile', async (item: FtpItem) => {
		try {
			const client = await getFtpClient();
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			if (!workspaceFolder) {
				throw new Error('Kein Workspace-Ordner gefunden');
			}

			// Bestimme den relativen Pfad vom Remote-Root
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const remoteRoot = config.get<string>('remoteDirectory') || '/';
			const relativePath = item.path.startsWith(remoteRoot) 
				? item.path.slice(remoteRoot.length) 
				: item.path;
			
			// Erstelle den lokalen Pfad
			const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);

			// Zeige Upload-Fortschritt
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Lade ${item.name} hoch...`,
				cancellable: false
			}, async (progress) => {
				// Hochladen der neueren Datei
				console.log('Lade hoch von:', localPath, 'nach:', item.path);
				await client.uploadFrom(localPath, item.path);
				vscode.window.showInformationMessage(`Datei ${item.name} erfolgreich hochgeladen`);
			});
			
			// Aktualisiere die Ansicht
			ftpExplorerProvider.refresh();
		} catch (error) {
			console.error('Upload-Fehler:', error);
			vscode.window.showErrorMessage(`Upload fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Befehl zum Erstellen einer neuen Datei
	let createFileCommand = vscode.commands.registerCommand('alfsftpplugin.createFile', async (parentItem?: FtpItem) => {
		try {
			const client = await getFtpClient();
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			if (!workspaceFolder) {
				throw new Error('Kein Workspace-Ordner gefunden');
			}

			// Bestimme den Basispfad basierend auf dem ausgewählten Ordner oder Root
			const remoteRoot = config.get<string>('remoteDirectory') || '/';
			const basePath = parentItem ? parentItem.path : remoteRoot;

			// Frage nach dem Dateinamen
			const fileName = await vscode.window.showInputBox({
				prompt: 'Geben Sie den Namen der neuen Datei ein',
				placeHolder: 'datei.txt'
			});

			if (!fileName) {
				return;
			}

			// Erstelle temporäre lokale Datei
			const remotePath = path.posix.join(basePath, fileName);
			const relativePath = remotePath.startsWith(remoteRoot) 
				? remotePath.slice(remoteRoot.length) 
				: remotePath;
			const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);

			// Stelle sicher, dass das Verzeichnis existiert
			await ensureDirectoryExists(path.dirname(localPath));

			// Erstelle leere Datei
			await fs.promises.writeFile(localPath, '');

			// Upload der leeren Datei
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Erstelle Datei ${fileName}...`,
				cancellable: false
			}, async (progress) => {
				await client.uploadFrom(localPath, remotePath);
				vscode.window.showInformationMessage(`Datei ${fileName} erfolgreich erstellt`);
			});

			// Öffne die Datei im Editor
			const doc = await vscode.workspace.openTextDocument(localPath);
			await vscode.window.showTextDocument(doc);

			// Aktualisiere die Ansicht
			ftpExplorerProvider.refresh();
		} catch (error) {
			console.error('Fehler beim Erstellen der Datei:', error);
			vscode.window.showErrorMessage(`Fehler beim Erstellen der Datei: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Befehl zum Erstellen eines neuen Ordners
	let createFolderCommand = vscode.commands.registerCommand('alfsftpplugin.createFolder', async (parentItem?: FtpItem) => {
		try {
			const client = await getFtpClient();
			const config = vscode.workspace.getConfiguration('alfsFtp');
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			if (!workspaceFolder) {
				throw new Error('Kein Workspace-Ordner gefunden');
			}

			// Bestimme den Basispfad basierend auf dem ausgewählten Ordner oder Root
			const remoteRoot = config.get<string>('remoteDirectory') || '/';
			const basePath = parentItem ? parentItem.path : remoteRoot;

			// Frage nach dem Ordnernamen
			const folderName = await vscode.window.showInputBox({
				prompt: 'Geben Sie den Namen des neuen Ordners ein',
				placeHolder: 'neuer_ordner'
			});

			if (!folderName) {
				return;
			}

			// Erstelle Ordner lokal und remote
			const remotePath = path.posix.join(basePath, folderName);
			const relativePath = remotePath.startsWith(remoteRoot) 
				? remotePath.slice(remoteRoot.length) 
				: remotePath;
			const localPath = path.join(workspaceFolder.uri.fsPath, relativePath);

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Erstelle Ordner ${folderName}...`,
				cancellable: false
			}, async (progress) => {
				// Erstelle lokalen Ordner
				await ensureDirectoryExists(localPath);
				
				// Erstelle Remote-Ordner
				await client.ensureDir(remotePath);
				vscode.window.showInformationMessage(`Ordner ${folderName} erfolgreich erstellt`);
			});

			// Aktualisiere die Ansicht
			ftpExplorerProvider.refresh();
		} catch (error) {
			console.error('Fehler beim Erstellen des Ordners:', error);
			vscode.window.showErrorMessage(`Fehler beim Erstellen des Ordners: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	console.log('Alfs FTP Plugin activated successfully!');

	context.subscriptions.push(
		uploadFileCommand,
		downloadFileCommand,
		configureCommand,
		saveListener,
		refreshCommand,
		downloadFromExplorerCommand,
		uploadToFolderCommand,
		uploadNewerFileCommand,
		createFileCommand,
		createFolderCommand,
		ftpExplorerProvider,
		outputChannel
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (ftpClient) {
		(ftpClient as ftp.Client).close();
	}
}
