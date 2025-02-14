// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

let outputChannel;

function log(message, type = 'info') {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('FTP Debug');
	}
	const timestamp = new Date().toISOString();
	const prefix = type === 'error' ? '❌ ERROR' : type === 'success' ? '✅ SUCCESS' : 'ℹ️ INFO';
	outputChannel.appendLine(`[${timestamp}] ${prefix}: ${message}`);
	if (type === 'error') {
		outputChannel.show(true);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
class FtpItem extends vscode.TreeItem {
	constructor(label, collapsibleState) {
		super(label, collapsibleState);
		this.localPath = '';
		this.remotePath = '';
		this.isLocalFolder = false;
	}
}

class FtpTreeDataProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.items = [];
		this.localRoot = '';
		this.connectionStatus = 'disconnected';
		this.fileFilter = null;
		this._items = new Map(); // Speichere alle Items mit ihren Pfaden
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element) {
		return element;
	}

	async getChildren(element) {
		let items;
		if (!element) {
			items = this.items;
		} else if (element.isLocalFolder) {
			items = await this.getLocalItems(element.localPath);
		} else {
			items = await this.getFtpItems(element.remotePath);
		}
		
		// Speichere alle Items in der Map
		items.forEach(item => this._setItem(item));
		
		if (this.fileFilter) {
			items = items.filter(item => 
				item.label.toLowerCase().includes(this.fileFilter.toLowerCase())
			);
		}
		
		return items;
	}

	async getLocalItems(localPath) {
		try {
			const files = await fs.promises.readdir(localPath, { withFileTypes: true });
			const items = [];
			
			for (const file of files) {
				const fullPath = path.join(localPath, file.name);
				const remotePath = path.join('/', path.relative(this.localRoot, fullPath)).replace(/\\/g, '/');
				
				const stats = await fs.promises.stat(fullPath);
				const modifiedDate = new Date(stats.mtime);
				const dateStr = modifiedDate.toLocaleDateString('de-DE') + ' ' + 
							  modifiedDate.toLocaleTimeString('de-DE');
				
				const treeItem = new FtpItem(
					file.name,
					file.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
				);
				
				treeItem.iconPath = file.isDirectory() 
					? new vscode.ThemeIcon('folder')
					: new vscode.ThemeIcon('file');

				treeItem.contextValue = file.isDirectory() ? 'directory' : 'file';
				
				const sizeStr = file.isDirectory() ? '' : this.formatFileSize(stats.size);
				treeItem.description = file.isDirectory() ? 
					`${dateStr}` : 
					`${sizeStr} - ${dateStr}`;
				
				treeItem.tooltip = `Lokal: ${fullPath}\nRemote: ${remotePath}\nGeändert: ${dateStr}`;
				treeItem.localPath = fullPath;
				treeItem.remotePath = remotePath;
				treeItem.isLocalFolder = true;

				// Prüfe, ob die Datei auf dem Server existiert und vergleiche die Zeitstempel
				if (!file.isDirectory() && ftpClient) {
					try {
						const remoteFiles = await ftpClient.list(remotePath);
						if (remoteFiles.length > 0) {
							const remoteFile = remoteFiles[0];
							const remoteDate = remoteFile.modifiedAt ? new Date(remoteFile.modifiedAt) : new Date(0);
							if (modifiedDate > remoteDate) {
								treeItem.resourceUri = vscode.Uri.file(fullPath).with({ scheme: 'ftpExplorer' });
							}
						}
					} catch (err) {
						// Ignoriere Fehler beim Vergleichen
					}
				}

				items.push(treeItem);
			}
			
			return items;
		} catch (err) {
			vscode.window.showErrorMessage(`Fehler beim Laden der lokalen Dateien: ${err.message}`);
			return [];
		}
	}

	async getFtpItems(remotePath = '/') {
		if (!ftpClient) return [];
		
		try {
			const list = await ftpClient.list(remotePath);
			const items = [];
			
			for (const item of list) {
				const treeItem = new FtpItem(
					item.name,
					item.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
				);
				
				const remoteFullPath = path.posix.join(remotePath, item.name);
				const localFullPath = path.join(this.localRoot, remoteFullPath);
				
				treeItem.iconPath = item.isDirectory 
					? new vscode.ThemeIcon('folder')
					: new vscode.ThemeIcon('file');
				
				let localExists = false;
				try {
					await fs.promises.access(localFullPath);
					localExists = true;
				} catch {
					// Datei existiert nicht lokal
					treeItem.resourceUri = vscode.Uri.file(localFullPath).with({ 
						scheme: 'ftpExplorer-missing' 
					});
				}
				
				// Wichtig: Bei Ordnern kein remoteOnly setzen, damit sie expandierbar bleiben
				treeItem.contextValue = item.isDirectory ? 'directory' : (localExists ? 'file' : 'remoteOnly');
				
				const modifiedDate = item.modifiedAt ? new Date(item.modifiedAt) : new Date();
				const dateStr = modifiedDate.toLocaleDateString('de-DE') + ' ' + 
							  modifiedDate.toLocaleTimeString('de-DE');
				const sizeStr = item.isDirectory ? '' : this.formatFileSize(item.size);
				
				treeItem.description = item.isDirectory ? 
					`${dateStr}` : 
					`${sizeStr} - ${dateStr}`;
				
				treeItem.tooltip = `Remote: ${remoteFullPath}\nLokal: ${localFullPath}\nGeändert: ${dateStr}`;
				treeItem.remotePath = remoteFullPath;
				treeItem.localPath = localFullPath;
				
				// Zeitstempelvergleich nur wenn die Datei lokal existiert
				if (!item.isDirectory && localExists) {
					try {
						const localStats = await fs.promises.stat(localFullPath);
						const localDate = new Date(localStats.mtime);
						const remoteDate = item.modifiedAt ? new Date(item.modifiedAt) : new Date(0);
						if (localDate > remoteDate) {
							treeItem.resourceUri = vscode.Uri.file(localFullPath).with({ 
								scheme: 'ftpExplorer' 
							});
						}
					} catch (err) {
						// Ignoriere Fehler beim Vergleichen
					}
				}
				
				// Speichere den Remote-Zeitstempel im TreeItem
				treeItem.remoteModifiedTime = item.modifiedAt;
				
				items.push(treeItem);
			}
			
			return items;
		} catch (err) {
			vscode.window.showErrorMessage(`Fehler beim Laden der FTP-Dateien: ${err.message}`);
			return [];
		}
	}

	// Hilfsfunktion zum Formatieren der Dateigröße
	formatFileSize(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	updateConnectionStatus(status) {
		this.connectionStatus = status;
		this.refresh();
	}

	setFileFilter(pattern) {
		this.fileFilter = pattern;
		this.refresh();
	}

	// Neue getParent-Methode hinzufügen
	async getParent(element) {
		if (!element) return null;
		
		const parentPath = path.dirname(element.remotePath || element.localPath);
		if (parentPath === '/' || parentPath === '.') return null;
		
		return this._getItem(parentPath);
	}

	// Helper-Methode zum Speichern von Items
	_setItem(item) {
		const key = item.remotePath || item.localPath;
		this._items.set(key, item);
		return item;
	}

	// Helper-Methode zum Abrufen von Items
	_getItem(path) {
		return this._items.get(path);
	}
}

let ftpClient = null;
let treeDataProvider = null;

// TreeView-Referenz global verfügbar machen
let treeView;

async function activate(context) {
	console.log('FTP Plugin wird aktiviert');
	log('FTP Plugin wird aktiviert');

	treeDataProvider = new FtpTreeDataProvider();
	// eslint-disable-next-line no-unused-vars
	treeView = vscode.window.createTreeView('ftpExplorer', {
		treeDataProvider: treeDataProvider,
		showCollapseAll: true
	});

	// Registriere den Color Provider
	const colorProvider = vscode.window.registerFileDecorationProvider({
		provideFileDecoration: (uri) => {
			if (uri.scheme === 'ftpExplorer') {
				return {
					color: new vscode.ThemeColor('ftpExplorer.modifiedFile')
				};
			} else if (uri.scheme === 'ftpExplorer-missing') {
				return {
					color: new vscode.ThemeColor('ftpExplorer.missingLocalFile')
				};
			}
		}
	});

	// Toggle Collapse/Expand Command
	let isExpanded = false;
	let toggleCollapseCommand = vscode.commands.registerCommand('alfsftpplugin.toggleCollapse', async () => {
		try {
			if (isExpanded) {
				// Collapse all
				await treeView.collapseAll();
			} else {
				// Expand all
				const expandItem = async (item) => {
					if (item.contextValue === 'directory') {
						await treeView.reveal(item, { expand: true });
						const children = await treeDataProvider.getChildren(item);
						for (const child of children) {
							await expandItem(child);
						}
					}
				};

				// Expandiere Root-Items
				const rootItems = await treeDataProvider.getChildren();
				for (const item of rootItems) {
					await expandItem(item);
				}
			}
			
			isExpanded = !isExpanded;
		} catch (err) {
			console.error('Toggle error:', err);
			log(`Toggle-Fehler: ${err.message}`, 'error');
		}
	});

	async function loadFtpSettings() {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders[0];
			const settingsPath = path.join(workspaceFolder.uri.fsPath, 'ftp-settings.json');
			const settingsContent = await fs.promises.readFile(settingsPath, 'utf8');
			log(`Lade FTP-Einstellungen aus: ${settingsPath}`);
			return JSON.parse(settingsContent);
		} catch (err) {
			log(`Fehler beim Laden der FTP-Einstellungen: ${err.message}`, 'error');
			vscode.window.showErrorMessage('Fehler beim Laden der FTP-Einstellungen. Bitte überprüfen Sie die ftp-settings.json');
			return null;
		}
	}

	// Automatischer Verbindungsaufbau beim Start
	const config = vscode.workspace.getConfiguration('alfsftpplugin');
	const autoConnect = config.get('autoConnect');
	
	if (autoConnect) {
		try {
			// Kurze Verzögerung, um sicherzustellen, dass die Extension vollständig geladen ist
			setTimeout(async () => {
				await vscode.commands.executeCommand('alfsftpplugin.connect');
			}, 1000);
		} catch (err) {
			log('Automatischer Verbindungsaufbau fehlgeschlagen', 'error');
		}
	}

	let connectCommand = vscode.commands.registerCommand('alfsftpplugin.connect', async () => {
		try {
			const settings = await loadFtpSettings();
			if (!settings) return;

			log(`Verbinde mit FTP-Server: ${settings.host}`);
			const workspaceFolder = vscode.workspace.workspaceFolders[0];
			treeDataProvider.localRoot = workspaceFolder.uri.fsPath;

			ftpClient = new ftp.Client();
			ftpClient.ftp.verbose = true;
			
			// FTP-Client Debug-Events
			ftpClient.ftp.log = msg => log(`FTP: ${msg}`);

			await ftpClient.access({
				host: settings.host,
				user: settings.user,
				password: settings.password,
				port: settings.port || 21,
				secure: settings.secure || false
			});

			log(`FTP-Verbindung hergestellt zu ${settings.host}`, 'success');

			// Veränderte Logik für das Laden der Items
			log('Lade Verzeichnisstruktur...');
			const remoteItems = await treeDataProvider.getFtpItems('/');
			
			// Lokale Items nur für Ordner laden, die nicht remote existieren
			const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot);
			const mergedItems = mergeItems(localItems, remoteItems);
			
			treeDataProvider.items = mergedItems;
			treeDataProvider.refresh();
			
			log('Verzeichnisstruktur geladen', 'success');
			vscode.window.showInformationMessage('FTP-Verbindung hergestellt!');

			treeDataProvider.updateConnectionStatus('connected');
		} catch (err) {
			log(`Verbindungsfehler: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`FTP-Fehler: ${err.message}`);
		}
	});

	let uploadCommand = vscode.commands.registerCommand('alfsftpplugin.upload', async (item) => {
		if (!ftpClient) {
			log('Upload fehlgeschlagen: Keine FTP-Verbindung aktiv', 'error');
			vscode.window.showErrorMessage('Keine FTP-Verbindung aktiv');
			return;
		}

		try {
			log(`Starte Upload: ${item.localPath} -> ${item.remotePath}`);
			if (fs.statSync(item.localPath).isDirectory()) {
				log(`Uploading directory: ${item.localPath}`);
				await uploadDirectory(item.localPath, item.remotePath);
			} else {
				await ftpClient.uploadFrom(item.localPath, item.remotePath);
			}
			treeDataProvider.refresh();
			log(`Upload erfolgreich: ${item.remotePath}`, 'success');
			vscode.window.showInformationMessage(`Upload erfolgreich: ${item.remotePath}`);
		} catch (err) {
			log(`Upload-Fehler: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Upload-Fehler: ${err.message}`);
		}
	});

	let downloadCommand = vscode.commands.registerCommand('alfsftpplugin.download', async (item) => {
		if (!ftpClient) {
			log('Download fehlgeschlagen: Keine FTP-Verbindung aktiv', 'error');
			vscode.window.showErrorMessage('Keine FTP-Verbindung aktiv');
			return;
		}

		try {
			log(`Starte Download: ${item.remotePath} -> ${item.localPath}`);
			await fs.promises.mkdir(path.dirname(item.localPath), { recursive: true });
			if (item.contextValue === 'remoteDirectory') {
				log(`Downloading directory: ${item.remotePath}`);
				await downloadDirectory(item.remotePath, item.localPath);
			} else {
				await ftpClient.downloadTo(item.localPath, item.remotePath);
				
				// Verwende die Zeitstempel-Information direkt aus dem TreeItem
				const remoteTime = new Date(item.remoteModifiedTime || Date.now());
				await fs.promises.utimes(item.localPath, remoteTime, remoteTime);
				log(`Zeitstempel aktualisiert: ${remoteTime.toISOString()}`);
			}
			treeDataProvider.refresh();
			log(`Download erfolgreich: ${item.localPath}`, 'success');
			vscode.window.showInformationMessage(`Download erfolgreich: ${item.localPath}`);
		} catch (err) {
			log(`Download-Fehler: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Download-Fehler: ${err.message}`);
		}
	});

	async function uploadDirectory(localPath, remotePath) {
		return vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Upload ${path.basename(localPath)}`,
			cancellable: false
		}, async (progress) => {
			try {
				log(`Erstelle Remote-Verzeichnis: ${remotePath}`);
				await ftpClient.ensureDir(remotePath);
				const files = await fs.promises.readdir(localPath);
				
				const increment = 100 / (files.length || 1);
				let completed = 0;
				
				for (const file of files) {
					const localFilePath = path.join(localPath, file);
					const remoteFilePath = path.posix.join(remotePath, file);
					const stats = await fs.promises.stat(localFilePath);
					
					if (stats.isDirectory()) {
						log(`Uploading subdirectory: ${localFilePath}`);
						await uploadDirectory(localFilePath, remoteFilePath);
					} else {
						log(`Uploading file: ${localFilePath}`);
						await ftpClient.uploadFrom(localFilePath, remoteFilePath);
					}
					
					completed += increment;
					progress.report({ 
						increment,
						message: `${Math.round(completed)}% abgeschlossen` 
					});
				}
			} catch (error) {
				throw error;
			}
		});
	}

	async function downloadDirectory(remotePath, localPath) {
		return vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Download ${path.basename(remotePath)}`,
			cancellable: false
		}, async (progress) => {
			try {
				log(`Erstelle lokales Verzeichnis: ${localPath}`);
				await fs.promises.mkdir(localPath, { recursive: true });
				const list = await ftpClient.list(remotePath);
				
				const increment = 100 / (list.length || 1);
				let completed = 0;
				
				for (const item of list) {
					const localFilePath = path.join(localPath, item.name);
					const remoteFilePath = path.posix.join(remotePath, item.name);
					
					if (item.isDirectory) {
						log(`Downloading subdirectory: ${remoteFilePath}`);
						await downloadDirectory(remoteFilePath, localFilePath);
					} else {
						log(`Downloading file: ${remoteFilePath}`);
						await ftpClient.downloadTo(localFilePath, remoteFilePath);
						
						// Setze den Zeitstempel direkt aus den Dateiinformationen
						if (item.modifiedAt) {
							const remoteTime = new Date(item.modifiedAt);
							await fs.promises.utimes(localFilePath, remoteTime, remoteTime);
							log(`Zeitstempel aktualisiert: ${remoteTime.toISOString()}`);
						}
					}
					
					completed += increment;
					progress.report({ 
						increment,
						message: `${Math.round(completed)}% abgeschlossen` 
					});
				}
			} catch (error) {
				throw error;
			}
		});
	}

	let disconnectCommand = vscode.commands.registerCommand('alfsftpplugin.disconnect', async () => {
		if (ftpClient) {
			log('Trenne FTP-Verbindung...');
			ftpClient.close();
			ftpClient = null;
			treeDataProvider.items = [];
			treeDataProvider.refresh();
			log('FTP-Verbindung getrennt', 'success');
			vscode.window.showInformationMessage('FTP-Verbindung getrennt');

			treeDataProvider.updateConnectionStatus('disconnected');
		}
	});

	// Debug-Panel anzeigen Command
	let showDebugCommand = vscode.commands.registerCommand('alfsftpplugin.showDebug', () => {
		if (outputChannel) {
			outputChannel.show();
		}
	});

	async function compareFiles(localPath, remotePath) {
		try {
			const localStats = await fs.promises.stat(localPath);
			const remoteList = await ftpClient.list(remotePath);
			const remoteFile = remoteList[0];
			
			if (localStats.size !== remoteFile.size) {
				return { different: true, reason: 'size' };
			}
			// Weitere Vergleiche möglich...
		} catch (err) {
			log(`Vergleichsfehler: ${err.message}`, 'error');
			return { different: true, reason: 'error' };
		}
	}

	// Registriere die Tree-View Download/Upload Commands
	let downloadFileCommand = vscode.commands.registerCommand('ftpExplorer.downloadFile', async (item) => {
		if (!ftpClient) {
			log('Download fehlgeschlagen: Keine FTP-Verbindung aktiv', 'error');
			vscode.window.showErrorMessage('Keine FTP-Verbindung aktiv');
			return;
		}

		try {
			await downloadItem(item);
			treeDataProvider.refresh();
		} catch (err) {
			log(`Download-Fehler: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Download-Fehler: ${err.message}`);
		}
	});

	// Neue Helper-Funktion für rekursives Herunterladen
	async function downloadItem(item) {
		log(`Starte Download: ${item.remotePath} -> ${item.localPath}`);
		await fs.promises.mkdir(path.dirname(item.localPath), { recursive: true });
		
		if (item.contextValue === 'directory') {
			log(`Downloading directory: ${item.remotePath}`);
			await fs.promises.mkdir(item.localPath, { recursive: true });
			
			const list = await ftpClient.list(item.remotePath);
			for (const subItem of list) {
				const localSubPath = path.join(item.localPath, subItem.name);
				const remoteSubPath = path.posix.join(item.remotePath, subItem.name);
				
				const subTreeItem = new FtpItem(
					subItem.name,
					subItem.isDirectory ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None
				);
				subTreeItem.remotePath = remoteSubPath;
				subTreeItem.localPath = localSubPath;
				subTreeItem.contextValue = subItem.isDirectory ? 'directory' : 'file';
				subTreeItem.remoteModifiedTime = subItem.modifiedAt;
				
				// Rekursiver Aufruf der Helper-Funktion statt Command
				await downloadItem(subTreeItem);
			}
		} else {
			// Normaler Datei-Download
			await ftpClient.downloadTo(item.localPath, item.remotePath);
			const remoteTime = new Date(item.remoteModifiedTime || Date.now());
			await fs.promises.utimes(item.localPath, remoteTime, remoteTime);
			log(`Zeitstempel aktualisiert für ${item.label}: ${remoteTime.toISOString()}`);
			
			// Komplette Aktualisierung der Ansicht
			const rootItems = await treeDataProvider.getFtpItems('/');
			const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot);
			treeDataProvider.items = await mergeItems(localItems, rootItems);
		}
		
		log(`Download erfolgreich: ${item.localPath}`, 'success');
		treeDataProvider.refresh();
	}

	let uploadFileCommand = vscode.commands.registerCommand('ftpExplorer.uploadFile', async (item) => {
		if (!ftpClient) {
			log('Upload fehlgeschlagen: Keine FTP-Verbindung aktiv', 'error');
			vscode.window.showErrorMessage('Keine FTP-Verbindung aktiv');
			return;
		}

		try {
			log(`Starte Upload: ${item.localPath} -> ${item.remotePath}`);
			if (fs.statSync(item.localPath).isDirectory()) {
				log(`Uploading directory: ${item.localPath}`);
				await uploadDirectory(item.localPath, item.remotePath);
			} else {
				await ftpClient.uploadFrom(item.localPath, item.remotePath);
			}
			treeDataProvider.refresh();
			log(`Upload erfolgreich: ${item.remotePath}`, 'success');
			vscode.window.showInformationMessage(`Upload erfolgreich: ${item.remotePath}`);
		} catch (err) {
			log(`Upload-Fehler: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Upload-Fehler: ${err.message}`);
		}
	});

	// Neue verbesserte Merge-Funktion
	function mergeItems(localItems, remoteItems) {
		const merged = new Map();
		
		// Alle lokalen Items hinzufügen
		localItems.forEach(item => {
			merged.set(item.label, {
				item,
				exists: { local: true, remote: false }
			});
		});
		
		// Remote Items verarbeiten
		remoteItems.forEach(remoteItem => {
			if (merged.has(remoteItem.label)) {
				// Item existiert lokal und remote
				const existingEntry = merged.get(remoteItem.label);
				existingEntry.exists.remote = true;
				
				// Remote-Informationen übernehmen
				const localItem = existingEntry.item;
				localItem.remotePath = remoteItem.remotePath;
				
				// Beschreibung und andere Infos vom Remote-Item übernehmen
				if (!localItem.isLocalFolder) {
					localItem.description = remoteItem.description;
					localItem.tooltip = remoteItem.tooltip;
					// Weitere Eigenschaften, die übernommen werden sollen...
				}
				
				// Wenn es ein Ordner ist, behalte die Remote-Struktur
				if (remoteItem.contextValue === 'directory') {
					localItem.isLocalFolder = false;
				}
			} else {
				// Nur remote existierendes Item
				merged.set(remoteItem.label, {
					item: remoteItem,
					exists: { local: false, remote: true }
				});
				// Orange markieren für remote-only
				remoteItem.resourceUri = vscode.Uri.file(remoteItem.localPath).with({ 
					scheme: 'ftpExplorer-missing' 
				});
			}
		});

		// Verarbeite die zusammengeführten Items
		const result = [];
		merged.forEach(({ item, exists }) => {
			if (exists.local && !exists.remote) {
				// Nur lokal existierende Items blau markieren
				item.resourceUri = vscode.Uri.file(item.localPath).with({ 
					scheme: 'ftpExplorer' 
				});
				// Upload-Icon anzeigen
				item.contextValue = item.contextValue === 'directory' ? 'directory' : 'file';
			} else if (!exists.local && exists.remote) {
				// Nur remote existierende Items sind bereits orange markiert
				// Nur Download-Icon anzeigen
				item.contextValue = item.contextValue === 'directory' ? 'directory' : 'remoteOnly';
			}
			result.push(item);
		});

		return result;
	}

	// Click-Handler für TreeView-Items
	treeView.onDidChangeSelection(async (event) => {
		const item = event.selection[0]; // Das ausgewählte Item
		if (!item || item.contextValue === 'directory') return; // Ignoriere Ordner

		try {
			if (item.contextValue === 'remoteOnly') {
				// Remote Datei: Erst herunterladen, dann öffnen
				log(`Öffne Remote-Datei: ${item.remotePath}`);
				await fs.promises.mkdir(path.dirname(item.localPath), { recursive: true });
				await ftpClient.downloadTo(item.localPath, item.remotePath);
				
				// Zeitstempel setzen
				if (item.remoteModifiedTime) {
					const remoteTime = new Date(item.remoteModifiedTime);
					await fs.promises.utimes(item.localPath, remoteTime, remoteTime);
				}
				
				// Status aktualisieren
				item.contextValue = 'file';
				item.resourceUri = undefined;
				
				// Komplette Aktualisierung der Ansicht
				const rootItems = await treeDataProvider.getFtpItems('/');
				const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot);
				treeDataProvider.items = await mergeItems(localItems, rootItems);
				treeDataProvider.refresh();
				
				// Öffne die heruntergeladene Datei
				const doc = await vscode.workspace.openTextDocument(item.localPath);
				await vscode.window.showTextDocument(doc);
				log(`Datei geöffnet: ${item.localPath}`);
			} else {
				// Lokale Datei: Direkt öffnen
				log(`Öffne lokale Datei: ${item.localPath}`);
				const doc = await vscode.workspace.openTextDocument(item.localPath);
				await vscode.window.showTextDocument(doc);
				log(`Datei geöffnet: ${item.localPath}`);
			}
		} catch (err) {
			log(`Fehler beim Öffnen der Datei: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Fehler beim Öffnen der Datei: ${err.message}`);
		}
	});

	context.subscriptions.push(connectCommand);
	context.subscriptions.push(disconnectCommand);
	context.subscriptions.push(uploadCommand);
	context.subscriptions.push(downloadCommand);
	context.subscriptions.push(showDebugCommand);
	context.subscriptions.push(downloadFileCommand);
	context.subscriptions.push(uploadFileCommand);
	context.subscriptions.push(colorProvider);
	context.subscriptions.push(toggleCollapseCommand);
}

// This method is called when your extension is deactivated
function deactivate() {
	if (ftpClient) {
		log('Plugin wird deaktiviert, trenne FTP-Verbindung...');
		ftpClient.close();
	}
	if (outputChannel) {
		outputChannel.dispose();
	}
}

module.exports = {
	activate,
	deactivate
}
