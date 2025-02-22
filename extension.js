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
		this.remoteModifiedTime = null;
	}
}

class FtpTreeDataProvider {
	constructor(workspaceRoot) {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.items = [];
		this.localRoot = workspaceRoot || '';
		this.remoteRoot = '/';
		this.connectionStatus = 'disconnected';
		this.fileFilter = null;
		this._items = new Map();
		
		// Logging der Initialisierung
		log(`FtpTreeDataProvider initialisiert mit localRoot: ${this.localRoot}`);
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element) {
		return element;
	}

	async getChildren(element) {
		let items = [];
		try {
			if (!element) {
				// Im Root-Verzeichnis
				if (ftpClient) {
					const remoteItems = await this.getFtpItems(this.remoteRoot);
					const localItems = await this.getLocalItems(this.localRoot, remoteItems);
					items = await this.mergeItems(localItems, remoteItems);
				} else {
					// Offline-Modus: Nur Dateien des Root-Verzeichnisses laden
					log(`Lade lokales Root-Verzeichnis: ${this.localRoot}`);
					try {
						const files = await fs.promises.readdir(this.localRoot, { withFileTypes: true });
						for (const file of files) {
							const fullPath = path.join(this.localRoot, file.name);
							const remotePath = path.posix.join(this.remoteRoot, file.name);
							
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
							treeItem.isLocalFolder = file.isDirectory();
							
							const sizeStr = file.isDirectory() ? '' : this.formatFileSize(stats.size);
							treeItem.description = file.isDirectory() ? 
								`${dateStr}` : 
								`${sizeStr} - ${dateStr}`;
							
							treeItem.tooltip = `Lokal: ${fullPath}\nGeändert: ${dateStr}`;
							treeItem.localPath = fullPath;
							treeItem.remotePath = remotePath;
							
							items.push(treeItem);
						}
					} catch (err) {
						log(`Fehler beim Laden des Root-Verzeichnisses: ${err.message}`, 'error');
					}
				}
			} else if (element.isLocalFolder) {
				// In Unterverzeichnissen
				if (ftpClient) {
					const remotePath = element.remotePath.startsWith(this.remoteRoot) ? 
						element.remotePath : 
						path.posix.join(this.remoteRoot, element.remotePath);
					const remoteItems = await this.getFtpItems(remotePath, true);
					const localItems = await this.getLocalItems(element.localPath, remoteItems);
					items = await this.mergeItems(localItems, remoteItems);
				} else {
					// Offline-Modus: Nur Dateien des aktuellen Verzeichnisses laden
					log(`Lade lokales Verzeichnis: ${element.localPath}`);
					try {
						const files = await fs.promises.readdir(element.localPath, { withFileTypes: true });
						for (const file of files) {
							const fullPath = path.join(element.localPath, file.name);
							const remotePath = path.posix.join(element.remotePath, file.name);
							
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
							treeItem.isLocalFolder = file.isDirectory();
							
							const sizeStr = file.isDirectory() ? '' : this.formatFileSize(stats.size);
							treeItem.description = file.isDirectory() ? 
								`${dateStr}` : 
								`${sizeStr} - ${dateStr}`;
							
							treeItem.tooltip = `Lokal: ${fullPath}\nGeändert: ${dateStr}`;
							treeItem.localPath = fullPath;
							treeItem.remotePath = remotePath;
							
							items.push(treeItem);
						}
					} catch (err) {
						log(`Fehler beim Laden des Verzeichnisses ${element.localPath}: ${err.message}`, 'error');
					}
				}
			} else {
				const remotePath = element.remotePath.startsWith(this.remoteRoot) ? 
					element.remotePath : 
					path.posix.join(this.remoteRoot, element.remotePath);
				items = await this.getFtpItems(remotePath, true);
			}

			// Sortiere Items: Erst Ordner, dann Dateien alphabetisch
			items.sort((a, b) => {
				const aIsDir = a.contextValue === 'directory';
				const bIsDir = b.contextValue === 'directory';
				if (aIsDir && !bIsDir) return -1;
				if (!aIsDir && bIsDir) return 1;
				return String(a.label).localeCompare(String(b.label));
			});
			
			// Speichere alle Items in der Map
			items.forEach(item => this._setItem(item));
			
			if (this.fileFilter) {
				items = items.filter(item => 
					String(item.label).toLowerCase().includes(this.fileFilter.toLowerCase())
				);
			}
			
			log(`${items.length} Items geladen${element ? ` aus ${element.localPath}` : ''}`);
			return items;
		} catch (err) {
			log(`Fehler in getChildren: ${err.message}`, 'error');
			return [];
		}
	}

	async getLocalItems(localPath, remoteItems = []) {
		// Zusätzliche Validierung des localRoot
		if (!this.localRoot) {
			log('Kein Workspace-Root definiert', 'error');
			return [];
		}

		// Prüfe ob der Pfad existiert und gültig ist
		if (!localPath || typeof localPath !== 'string') {
			log(`Ungültiger lokaler Pfad: ${localPath}`, 'error');
			return [];
		}
		
		// Normalisiere den Pfad und stelle sicher, dass er innerhalb des Workspace liegt
		localPath = path.normalize(localPath);
		if (!localPath.startsWith(this.localRoot)) {
			log(`Pfad liegt außerhalb des Workspace: ${localPath}`, 'error');
			return [];
		}
		
		// Erstelle den Ordner falls er nicht existiert
		try {
			await fs.promises.mkdir(localPath, { recursive: true });
		} catch (err) {
			log(`Fehler beim Erstellen des lokalen Verzeichnisses: ${err.message}`, 'error');
			return [];
		}

		try {
			const items = [];
			
			// Lese nur die aktuelle Verzeichnisebene
			let files;
			try {
				files = await fs.promises.readdir(localPath, { withFileTypes: true });
			} catch (err) {
				log(`Fehler beim Lesen des Verzeichnisses ${localPath}: ${err.message}`, 'error');
				return [];
			}
			
			for (const file of files) {
				try {
					const fullPath = path.join(localPath, file.name);
					const itemRelativePath = path.relative(this.localRoot, fullPath);
					const remotePath = path.posix.join(this.remoteRoot, itemRelativePath).replace(/\\/g, '/');
					
					log(`Verarbeite lokale Datei: ${file.name}, Remote-Pfad: ${remotePath}`);
					
					let stats;
					try {
						stats = await fs.promises.stat(fullPath);
					} catch (err) {
						log(`Fehler beim Lesen der Dateistatistiken für ${fullPath}: ${err.message}`, 'error');
						continue;
					}

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
					treeItem.isLocalFolder = file.isDirectory();
					
					if (!file.isDirectory() && Array.isArray(remoteItems)) {
						// Prüfe ob die Datei im aktuellen Remote-Verzeichnis existiert
						const remoteParentPath = path.dirname(remotePath);
						const remoteFile = remoteItems.find(r => {
							if (!r || !r.name) return false;
							return path.posix.join(remoteParentPath, r.name) === remotePath;
						});
						
						if (!remoteFile) {
							// Datei existiert nicht auf dem Server
							treeItem.resourceUri = vscode.Uri.file(fullPath).with({ scheme: 'ftpExplorer' });
							log(`Markiere lokale Datei blau: ${file.name}`);
						}
					}

					items.push(treeItem);
				} catch (err) {
					log(`Fehler bei der Verarbeitung von ${file.name}: ${err.message}`, 'error');
					continue;
				}
			}
			
			log(`Lokale Items geladen aus ${localPath}: ${items.length} Items gefunden`);
			return items;
		} catch (err) {
			log(`Fehler beim Laden der lokalen Dateien aus ${localPath}: ${err.message}`, 'error');
			return [];
		}
	}

	async getFtpItems(remotePath = '/', isNormalized = false) {
		if (!ftpClient) return [];
		
		try {
			const normalizedPath = isNormalized ? remotePath : 
				(remotePath === this.remoteRoot ? remotePath : path.posix.join(this.remoteRoot, remotePath));
			
			log(`Lade Remote-Verzeichnis: ${normalizedPath}`);
			const list = await ftpClient.list(normalizedPath);
			const items = [];
			
			for (const item of list) {
				// Überspringe . und .. Einträge
				if (item.name === '.' || item.name === '..') {
					continue;
				}

				const treeItem = new FtpItem(
					item.name,
					item.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
				);
				
				const remoteFullPath = path.posix.join(normalizedPath, item.name);
				// Berechne den lokalen Pfad relativ zum Workspace
				const relativePath = remoteFullPath.startsWith(this.remoteRoot) ? 
					remoteFullPath.slice(this.remoteRoot.length) : 
					remoteFullPath;
				const localFullPath = path.join(this.localRoot, relativePath.replace(/^\//, ''));
				
				log(`Verarbeite Remote-Item: ${item.name}, Local-Pfad: ${localFullPath}`);
				
				treeItem.remoteModifiedTime = item.modifiedAt;
				
				treeItem.iconPath = item.isDirectory 
					? new vscode.ThemeIcon('folder')
					: new vscode.ThemeIcon('file');
				
				let localExists = false;
				try {
					await fs.promises.access(localFullPath);
					localExists = true;
				} catch {
					// Datei existiert nicht lokal
					if (!item.isDirectory) {
						treeItem.resourceUri = vscode.Uri.file(localFullPath).with({ 
							scheme: 'ftpExplorer-missing' 
						});
						log(`Markiere fehlende lokale Datei: ${item.name}`);
					}
				}
				
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
				treeItem.isLocalFolder = item.isDirectory;
				
				items.push(treeItem);
			}
			
			log(`Remote Items geladen aus ${normalizedPath}: ${items.length} Items gefunden`);
			return items;
		} catch (err) {
			log(`Fehler beim Laden der Remote-Dateien aus ${remotePath}: ${err.message}`, 'error');
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

	// Neue mergeItems-Methode in der Klasse
	async mergeItems(localItems, remoteItems) {
		const folders = new Map();
		const files = new Map();
		
		// Zuerst Remote-Items verarbeiten
		remoteItems.forEach(remoteItem => {
			const target = remoteItem.contextValue === 'directory' ? folders : files;
			target.set(remoteItem.label, {
				item: remoteItem,
				exists: { local: false, remote: true }
			});
		});
		
		// Dann lokale Items verarbeiten
		localItems.forEach(item => {
			const target = item.contextValue === 'directory' ? folders : files;
			if (target.has(item.label)) {
				// Item existiert bereits (von Remote)
				const existingEntry = target.get(item.label);
				existingEntry.exists.local = true;
				
				const remoteItem = existingEntry.item;
				remoteItem.localPath = item.localPath;
				
				// Zeitstempelvergleich für Dateien
				if (item.contextValue !== 'directory') {
					try {
						const localStats = fs.statSync(item.localPath);
						const localDate = new Date(localStats.mtime);
						const remoteDate = remoteItem.remoteModifiedTime ? 
							new Date(remoteItem.remoteModifiedTime) : new Date(0);
						
						// Vergleiche Zeitstempel mit 1 Sekunde Toleranz
						const timeDiff = Math.abs(localDate.getTime() - remoteDate.getTime());
						log(`Zeitstempelvergleich für ${item.label}: Lokal ${localDate.toISOString()}, Remote ${remoteDate.toISOString()}, Diff: ${timeDiff}ms`);
						
						if (timeDiff > 1000 && localDate > remoteDate) {
							log(`Datei ist lokal neuer: ${item.label}`);
							remoteItem.resourceUri = vscode.Uri.file(item.localPath).with({ 
								scheme: 'ftpExplorer' 
							});
						} else {
							remoteItem.resourceUri = undefined;
						}
					} catch (err) {
						log(`Fehler beim Zeitstempelvergleich für ${item.label}: ${err.message}`, 'error');
					}
				}
			} else {
				// Neues lokales Item
				target.set(item.label, {
					item,
					exists: { local: true, remote: false }
				});
				
				// Markiere lokale Dateien blau
				if (item.contextValue !== 'directory') {
					log(`Neue lokale Datei gefunden: ${item.label}`);
					item.resourceUri = vscode.Uri.file(item.localPath).with({ 
						scheme: 'ftpExplorer' 
					});
				}
			}
		});
		
		// Sortierte Arrays erstellen
		const sortedFolders = Array.from(folders.values())
			.sort((a, b) => String(a.item.label).localeCompare(String(b.item.label)))
			.map(entry => entry.item);
			
		const sortedFiles = Array.from(files.values())
			.sort((a, b) => String(a.item.label).localeCompare(String(b.item.label)))
			.map(entry => entry.item);
		
		// Erst Ordner, dann Dateien
		return [...sortedFolders, ...sortedFiles];
	}
}

let ftpClient = null;
let treeDataProvider = null;

// TreeView-Referenz global verfügbar machen
let treeView;

async function activate(context) {
	console.log('FTP Plugin wird aktiviert');
	log('FTP Plugin wird aktiviert');

	// Prüfe ob ein Workspace geöffnet ist
	if (!vscode.workspace.workspaceFolders || !vscode.workspace.workspaceFolders[0]) {
		log('Kein Workspace geöffnet', 'error');
		vscode.window.showErrorMessage('Bitte öffnen Sie einen Workspace, um das FTP Plugin zu nutzen.');
		return;
	}

	const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
	log(`Workspace Root: ${workspaceRoot}`);

	// Initialisiere den TreeDataProvider mit dem Workspace-Pfad
	treeDataProvider = new FtpTreeDataProvider(workspaceRoot);

	// TreeView erstellen
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
			treeDataProvider.remoteRoot = settings.root || '/';

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
			const remoteItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
			
			// Lokale Items nur für Ordner laden, die nicht remote existieren
			const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, remoteItems);
			const mergedItems = await treeDataProvider.mergeItems(localItems, remoteItems);
			
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
		
		// Prüfe, ob die FTP-Verbindung noch aktiv ist
		if (!ftpClient) {
			throw new Error('Keine FTP-Verbindung aktiv');
		}
		
		if (item.contextValue === 'directory') {
			log(`Downloading directory: ${item.remotePath}`);
			await fs.promises.mkdir(item.localPath, { recursive: true });
			
			const normalizedPath = item.remotePath;
			let list;
			try {
				list = await ftpClient.list(normalizedPath);
			} catch (err) {
				log(`Fehler beim Auflisten von ${normalizedPath}: ${err.message}`, 'error');
				throw err;
			}
			
			// Sammle alle Download-Aufgaben
			const downloadTasks = [];
			
			for (const subItem of list) {
				const localSubPath = path.join(item.localPath, subItem.name);
				const remoteSubPath = path.posix.join(normalizedPath, subItem.name);
				
				const subTreeItem = new FtpItem(
					subItem.name,
					subItem.isDirectory ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None
				);
				subTreeItem.remotePath = remoteSubPath;
				subTreeItem.localPath = localSubPath;
				subTreeItem.contextValue = subItem.isDirectory ? 'directory' : 'file';
				subTreeItem.remoteModifiedTime = subItem.modifiedAt;
				
				// Füge Download-Task zur Liste hinzu
				downloadTasks.push(async () => {
					try {
						await downloadItem(subTreeItem);
					} catch (err) {
						log(`Fehler beim Download von ${subTreeItem.remotePath}: ${err.message}`, 'error');
						throw err;
					}
				});
			}
			
			// Führe Downloads sequentiell aus
			for (const task of downloadTasks) {
				await task();
			}
		} else {
			// Normaler Datei-Download
			const remotePath = item.remotePath;
			try {
				await ftpClient.downloadTo(item.localPath, remotePath);
			} catch (err) {
				log(`Fehler beim Download von ${remotePath}: ${err.message}`, 'error');
				throw err;
			}
			
			// Zeitstempel aktualisieren
			const remoteTime = new Date(item.remoteModifiedTime || Date.now());
			await fs.promises.utimes(item.localPath, remoteTime, remoteTime);
			log(`Zeitstempel aktualisiert für ${item.label}: ${remoteTime.toISOString()}`);
		}
		
		log(`Download erfolgreich: ${item.localPath}`, 'success');
		
		// Komplette Aktualisierung nach jedem Download
		const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
		const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
		treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
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
				const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
				const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
				treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
				
				// Öffne die heruntergeladene Datei erst nach der Aktualisierung
				treeDataProvider.refresh();
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
			if (err.message.includes('Client is closed')) {
				log('Verbindung verloren, versuche Neuverbindung...');
				await vscode.commands.executeCommand('alfsftpplugin.connect');
			} else {
				log(`Fehler beim Öffnen der Datei: ${err.message}`, 'error');
				vscode.window.showErrorMessage(`Fehler beim Öffnen der Datei: ${err.message}`);
			}
		}
	});

	// Aktualisierung bei Fokus auf FTP Explorer
	vscode.window.onDidChangeActiveTextEditor(async () => {
		if (treeView.visible) {
			if (ftpClient) {
				try {
					log('Starte Tree-Aktualisierung nach Fokus...');
					const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
					log('Remote Items geladen');
					const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
					log('Lokale Items geladen');
					treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
					log('Items zusammengeführt');
					treeDataProvider.refresh();
				} catch (err) {
					if (err.message.includes('Client is closed')) {
						log('Verbindung verloren, versuche Neuverbindung...');
						await vscode.commands.executeCommand('alfsftpplugin.connect');
					} else {
						log(`Fehler bei der Tree-Aktualisierung: ${err.message}`, 'error');
					}
				}
			}
		}
	});

	// Aktualisierung wenn eine Datei gespeichert wird
	vscode.workspace.onDidSaveTextDocument(async (document) => {
		// Prüfe ob die gespeicherte Datei im Workspace-Verzeichnis liegt
		if (ftpClient && document.uri.scheme === 'file' && 
			document.uri.fsPath.startsWith(treeDataProvider.localRoot)) {
			
			try {
				// Warte kurz, bis die Datei geschrieben wurde
				await new Promise(resolve => setTimeout(resolve, 100));
				
				// Komplette Aktualisierung des Trees
				log(`Datei gespeichert, aktualisiere Tree: ${document.uri.fsPath}`);
				
				// Lade zuerst lokale Items
				const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot);
				log(`Lokale Items geladen: ${localItems.length} Items`);
				
				// Dann Remote Items
				const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
				log(`Remote Items geladen: ${rootItems.length} Items`);
				
				// Merge und Aktualisierung
				treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
				log(`Items zusammengeführt: ${treeDataProvider.items.length} Items total`);
				
				treeDataProvider.refresh();
				
				log(`Datei gespeichert und Tree aktualisiert: ${document.uri.fsPath}`);
			} catch (err) {
				if (err.message.includes('Client is closed')) {
					// Versuche die Verbindung wiederherzustellen
					log('Verbindung verloren, versuche Neuverbindung...');
					await vscode.commands.executeCommand('alfsftpplugin.connect');
				} else {
					log(`Fehler bei der Tree-Aktualisierung: ${err.message}`, 'error');
				}
			}
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
