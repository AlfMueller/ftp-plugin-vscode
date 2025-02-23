// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

let outputChannel;
let ftpClient = null;
let treeDataProvider = null;
let treeView;

let settings = {
	language: 'en',
	ui: {
		dateFormat: 'EU',
		remoteOnlyColor: '#ff6b6b'
	}
};

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

function formatDate(date, format = 'EU') {
	if (format === 'US') {
		return date.toLocaleDateString('en-US') + ' ' + 
			   date.toLocaleTimeString('en-US');
	}
	return date.toLocaleDateString('de-DE') + ' ' + 
		   date.toLocaleTimeString('de-DE');
}

function t(key) {
	const translations = {
		'en': {
			'connection_error': 'No FTP connection active',
			'workspace_error': 'Please open a workspace to use the FTP plugin',
			'settings_error': 'Error loading FTP settings. Please check ftp-settings.json',
			'connection_established': 'FTP connection established to',
			'connection_closed': 'FTP connection closed',
			'upload_success': 'Upload successful',
			'download_success': 'Download successful',
			'file_opened': 'File opened',
			'directory_created': 'Directory created',
			'refresh_complete': 'FTP Explorer has been refreshed',
			'delete_confirm': 'Do you really want to delete the remote',
			'yes_delete': 'Yes, delete',
			'cancel': 'Cancel',
			'remote_only_delete': 'Only remote-only files and folders can be deleted',
			'create_settings': 'No FTP settings found. Would you like to create an example configuration file?',
			'settings_created': 'FTP settings have been created. Please adjust the values in ftp-settings.json',
			'progress_complete': 'complete'
		},
		'de': {
			'connection_error': 'Keine FTP-Verbindung aktiv',
			'workspace_error': 'Bitte öffnen Sie einen Workspace, um das FTP Plugin zu nutzen',
			'settings_error': 'Fehler beim Laden der FTP-Einstellungen. Bitte überprüfen Sie die ftp-settings.json',
			'connection_established': 'FTP-Verbindung hergestellt zu',
			'connection_closed': 'FTP-Verbindung getrennt',
			'upload_success': 'Upload erfolgreich',
			'download_success': 'Download erfolgreich',
			'file_opened': 'Datei geöffnet',
			'directory_created': 'Verzeichnis erstellt',
			'refresh_complete': 'FTP Explorer wurde aktualisiert',
			'delete_confirm': 'Möchten Sie wirklich löschen',
			'yes_delete': 'Ja, löschen',
			'cancel': 'Abbrechen',
			'remote_only_delete': 'Nur Remote-Only Dateien und Ordner können gelöscht werden',
			'create_settings': 'Keine FTP-Einstellungen gefunden. Möchten Sie eine Beispiel-Konfigurationsdatei erstellen?',
			'settings_created': 'FTP-Einstellungen wurden erstellt. Bitte passen Sie die Werte in der ftp-settings.json an',
			'progress_complete': 'abgeschlossen'
		}
	};
	return translations[settings.language][key] || key;
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
		this.compareTimestamps = true; // Standardwert für Zeitstempelvergleich
		this.settings = {
			language: 'en',
			ui: {
				dateFormat: 'EU',
				remoteOnlyColor: '#ff6b6b'
			}
		};
		
		// Logging der Initialisierung
		log(`FTP TreeDataProvider initialized with localRoot: ${this.localRoot}`);
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
							const dateStr = formatDate(modifiedDate, this.settings.ui.dateFormat);
							
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
							const dateStr = formatDate(modifiedDate, this.settings.ui.dateFormat);
							
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

		try {
			const items = [];
			
			// Prüfe ob der Ordner existiert, ohne ihn zu erstellen
			if (!fs.existsSync(localPath)) {
				log(`Lokaler Pfad existiert nicht: ${localPath}`);
				return [];
			}
			
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
					// Überspringe ftp-settings.json
					if (file.name === 'ftp-settings.json') {
						continue;
					}

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
					const dateStr = formatDate(modifiedDate, this.settings.ui.dateFormat);
					
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
				// Überspringe . und .. Einträge und ftp-settings.json
				if (item.name === '.' || item.name === '..' || item.name === 'ftp-settings.json') {
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
					// Datei oder Ordner existiert nicht lokal
					if (!item.isDirectory) {
						treeItem.resourceUri = vscode.Uri.file(localFullPath).with({ 
							scheme: 'ftpExplorer-missing' 
						});
						log(`Markiere fehlende lokale Datei: ${item.name}`);
					} else {
						treeItem.resourceUri = vscode.Uri.file(localFullPath).with({ 
							scheme: 'ftpExplorer-remoteDirectory' 
						});
						log(`Markiere remote-only Ordner: ${item.name}`);
					}
				}
				
				treeItem.contextValue = item.isDirectory 
					? (localExists ? 'directory' : 'remoteDirectory')
					: (localExists ? 'file' : 'remoteOnly');
				
				const modifiedDate = item.modifiedAt ? new Date(item.modifiedAt) : new Date();
				const dateStr = formatDate(modifiedDate, this.settings.ui.dateFormat);
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
		const allItems = new Map();
		
		// Remote Items verarbeiten
		for (const remoteItem of remoteItems) {
			const localPath = remoteItem.localPath;
			let localExists = false;
			
			try {
				localExists = fs.existsSync(localPath);
			} catch {
				localExists = false;
			}
			
			if (!localExists) {
				// Setze Remote-Only Status
				if (remoteItem.isLocalFolder) {
					remoteItem.resourceUri = vscode.Uri.file(localPath).with({ 
						scheme: 'ftpExplorer-remoteDirectory' 
					});
					remoteItem.contextValue = 'remoteDirectory';
					remoteItem.description = `${remoteItem.description || ''} [Remote-Only]`;
				} else {
					remoteItem.resourceUri = vscode.Uri.file(localPath).with({ 
						scheme: 'ftpExplorer-missing' 
					});
					remoteItem.contextValue = 'remoteOnly';
					remoteItem.description = `${remoteItem.description || ''} [Remote-Only]`;
				}
			}
			
			allItems.set(remoteItem.label, remoteItem);
		}
		
		// Lokale Items verarbeiten
		for (const localItem of localItems) {
			if (!allItems.has(localItem.label)) {
				if (localItem.contextValue !== 'directory') {
					localItem.resourceUri = vscode.Uri.file(localItem.localPath).with({ 
						scheme: 'ftpExplorer' 
					});
				}
				allItems.set(localItem.label, localItem);
			} else {
				const existingItem = allItems.get(localItem.label);
				existingItem.localPath = localItem.localPath;
				
				if (localItem.contextValue !== 'directory') {
					try {
						const localStats = fs.statSync(localItem.localPath);
						const localDate = new Date(localStats.mtime);
						const remoteDate = existingItem.remoteModifiedTime ? 
							new Date(existingItem.remoteModifiedTime) : new Date(0);
						
						// Berücksichtige die compareTimestamps-Einstellung
						if (this.compareTimestamps) {
							const timeDiff = Math.abs(localDate.getTime() - remoteDate.getTime());
							if (timeDiff > 1000 && localDate > remoteDate) {
								existingItem.resourceUri = vscode.Uri.file(localItem.localPath).with({ 
									scheme: 'ftpExplorer' 
								});
							} else {
								existingItem.resourceUri = undefined;
							}
						}
					} catch (err) {
						log(`Fehler beim Zeitstempelvergleich für ${localItem.label}: ${err.message}`, 'error');
					}
				}
			}
		}
		
		// Alle Items in ein Array umwandeln
		const mergedItems = Array.from(allItems.values());
		
		// Debug-Logging für die Sortierung
		log('Vor der Sortierung:');
		mergedItems.forEach(item => {
			log(`Item: ${item.label}, Type: ${item.contextValue}`);
		});
		
		// Sortiere erst nach Typ (Ordner vor Dateien) und dann alphabetisch
		const sortedItems = mergedItems.sort((a, b) => {
			const aIsDir = a.isLocalFolder || a.contextValue === 'directory' || a.contextValue === 'remoteDirectory';
			const bIsDir = b.isLocalFolder || b.contextValue === 'directory' || b.contextValue === 'remoteDirectory';
			
			// Wenn einer ein Ordner ist und der andere nicht
			if (aIsDir !== bIsDir) {
				return aIsDir ? -1 : 1;
			}
			
			// Wenn beide gleichen Typ haben, alphabetisch sortieren
			return String(a.label).localeCompare(String(b.label));
		});
		
		// Debug-Logging nach der Sortierung
		log('Nach der Sortierung:');
		sortedItems.forEach(item => {
			log(`Item: ${item.label}, Type: ${item.contextValue}`);
		});
		
		return sortedItems;
	}
}

async function createDummyFtpSettings(workspaceRoot) {
	const settingsPath = path.join(workspaceRoot, 'ftp-settings.json');
	const dummySettings = {
		"host": "ftp.example.com",
		"user": "username",
		"password": "password",
		"port": 21,
		"secure": false,
		"root": "/",
		"name": "FTP Server",
		"ignoreCertificateErrors": true,
		"rejectUnauthorized": false,
		"showFileActions": true,
		"compareTimestamps": true,
		"language": "en", // or "de" for German
		"ui": {
			"newerLocalColor": "#0066cc",
			"remoteOnlyColor": "#ff6b6b",
			"showIcons": true,
			"dateFormat": "EU" // or "US" for US date format
		}
	};
	
	try {
		await fs.promises.writeFile(settingsPath, JSON.stringify(dummySettings, null, 2));
		log('Dummy FTP settings created', 'success');
		
		// Open file directly in editor
		const document = await vscode.workspace.openTextDocument(settingsPath);
		await vscode.window.showTextDocument(document);
		
		return true;
	} catch (err) {
		log(`Error creating dummy settings: ${err.message}`, 'error');
		return false;
	}
}

async function updateFtpSettings(existingSettings, workspaceFolder) {
	const defaultSettings = {
		"ignoreCertificateErrors": true,
		"rejectUnauthorized": false,
		"showFileActions": true,
		"compareTimestamps": true,
		"language": "en",
		"ui": {
			"newerLocalColor": "#0066cc",
			"remoteOnlyColor": "#ff6b6b",
			"showIcons": true,
			"dateFormat": "EU"
		}
	};

	let hasChanges = false;
	
	// Überprüfe und ergänze fehlende Haupteinstellungen
	for (const [key, value] of Object.entries(defaultSettings)) {
		if (key === 'ui') continue; // UI-Einstellungen separat behandeln
		if (existingSettings[key] === undefined) {
			existingSettings[key] = value;
			hasChanges = true;
			log(`Neue Einstellung hinzugefügt: ${key}`);
		}
	}

	// Überprüfe und ergänze UI-Einstellungen
	if (!existingSettings.ui) {
		existingSettings.ui = defaultSettings.ui;
		hasChanges = true;
		log('UI-Einstellungen hinzugefügt');
	} else {
		for (const [key, value] of Object.entries(defaultSettings.ui)) {
			if (existingSettings.ui[key] === undefined) {
				existingSettings.ui[key] = value;
				hasChanges = true;
				log(`Neue UI-Einstellung hinzugefügt: ${key}`);
			}
		}
	}

	// Speichere aktualisierte Einstellungen, wenn Änderungen vorgenommen wurden
	if (hasChanges) {
		const settingsPath = path.join(workspaceFolder.uri.fsPath, 'ftp-settings.json');
		try {
			await fs.promises.writeFile(
				settingsPath, 
				JSON.stringify(existingSettings, null, 2)
			);
			log('FTP-Einstellungen wurden aktualisiert', 'success');
		} catch (err) {
			log(`Fehler beim Speichern der aktualisierten Einstellungen: ${err.message}`, 'error');
		}
	}

	return existingSettings;
}

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
		showCollapseAll: true,
		canSelectMany: false
	});

	// Event-Handler für das Öffnen des FTP-Explorers
	treeView.onDidChangeVisibility(async (event) => {
		if (event.visible) {
			const settingsPath = path.join(workspaceRoot, 'ftp-settings.json');
			try {
				await fs.promises.access(settingsPath);
			} catch {
				const answer = await vscode.window.showInformationMessage(
					t('create_settings'),
					t('yes_delete'),
					t('cancel')
				);
				
				if (answer === t('yes_delete')) {
					if (await createDummyFtpSettings(workspaceRoot)) {
						vscode.window.showInformationMessage(
							t('settings_created')
						);
					}
				}
			}
		}
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
			} else if (uri.scheme === 'ftpExplorer-remoteDirectory') {
				return {
					color: new vscode.ThemeColor('ftpExplorer.remoteDirectory')
				};
			}
		}
	});

	// Delete Remote Item Command
	let deleteRemoteCommand = vscode.commands.registerCommand('ftpExplorer.deleteRemote', async (item) => {
		if (!item || !item.remotePath) {
			return;
		}

		try {
			// Prüfe ob es sich um eine Remote-Only Datei oder einen Remote-Only Ordner handelt
			if (item.contextValue !== 'remoteOnly' && item.contextValue !== 'remoteDirectory') {
				vscode.window.showInformationMessage(t('remote_only_delete'));
				return;
			}

			// Sicherheitsabfrage
			const itemType = item.contextValue === 'remoteDirectory' ? 'Ordner' : 'Datei';
			const answer = await vscode.window.showWarningMessage(
				`Möchten Sie wirklich ${itemType === 'Ordner' ? 'den' : 'die'} Remote-${itemType} "${item.label}" löschen?`,
				{ modal: true },
				t('yes_delete'),
				t('cancel')
			);

			if (answer !== t('yes_delete')) {
				return;
			}

			if (!await ensureFtpConnection()) {
				vscode.window.showErrorMessage('Keine FTP-Verbindung möglich');
				return;
			}

			log(`Lösche Remote-Item: ${item.remotePath}`);
			
			if (item.contextValue === 'remoteDirectory') {
				// Rekursives Löschen des Ordners
				await ftpClient.removeDir(item.remotePath);
				log(`Ordner gelöscht: ${item.remotePath}`, 'success');
			} else {
				// Einzelne Datei löschen
				await ftpClient.remove(item.remotePath);
				log(`Datei gelöscht: ${item.remotePath}`, 'success');
			}

			// Aktualisiere die Ansicht
			if (await ensureFtpConnection()) {
				const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
				const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
				treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
				treeDataProvider.refresh();
			}

			vscode.window.showInformationMessage(`${itemType} "${item.label}" wurde erfolgreich gelöscht.`);
		} catch (err) {
			log(`Fehler beim Löschen: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Fehler beim Löschen: ${err.message}`);
		}
	});

	async function loadFtpSettings() {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders[0];
			const settingsPath = path.join(workspaceFolder.uri.fsPath, 'ftp-settings.json');
			
			// Prüfe zuerst, ob die Datei existiert
			try {
				await fs.promises.access(settingsPath);
			} catch {
				log('Keine FTP-Einstellungen gefunden');
				return null;
			}
			
			const settingsContent = await fs.promises.readFile(settingsPath, 'utf8');
			log(`Lade FTP-Einstellungen aus: ${settingsPath}`);
			let settings = JSON.parse(settingsContent);
			
			// Aktualisiere die Einstellungen mit fehlenden Werten
			settings = await updateFtpSettings(settings, workspaceFolder);
			
			return settings;
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
			// Prüfe zuerst, ob die Einstellungsdatei existiert
			const workspaceFolder = vscode.workspace.workspaceFolders[0];
			const settingsPath = path.join(workspaceFolder.uri.fsPath, 'ftp-settings.json');
			
			try {
				await fs.promises.access(settingsPath);
				// Datei existiert, versuche Verbindung
				setTimeout(async () => {
					await vscode.commands.executeCommand('alfsftpplugin.connect');
				}, 1000);
			} catch {
				// Datei existiert nicht - keine Aktion
				log('Keine FTP-Einstellungen für Auto-Connect gefunden');
			}
		} catch (err) {
			log('Automatischer Verbindungsaufbau fehlgeschlagen', 'error');
		}
	}

	let connectCommand = vscode.commands.registerCommand('alfsftpplugin.connect', async () => {
		try {
			const settings = await loadFtpSettings();
			if (!settings) return;

			// Globale Einstellungen aktualisieren
			treeDataProvider.settings = settings;
			treeDataProvider.settings.language = settings.language || 'en';
			treeDataProvider.settings.ui = settings.ui || {};
			treeDataProvider.settings.ui.dateFormat = settings.ui.dateFormat || 'EU';

			log(`Connecting to FTP server: ${settings.host}`);
			treeDataProvider.remoteRoot = settings.root || '/';

			ftpClient = new ftp.Client();
			ftpClient.ftp.verbose = true;
			
			// FTP-Client Debug-Events
			ftpClient.ftp.log = msg => log(`FTP: ${msg}`);

			// Berücksichtige die erweiterten SSL/TLS-Einstellungen
			const accessConfig = {
				host: settings.host,
				user: settings.user,
				password: settings.password,
				port: settings.port || 21,
				secure: settings.secure || false,
				rejectUnauthorized: settings.rejectUnauthorized === false ? false : true
			};

			if (settings.ignoreCertificateErrors) {
				process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
			}

			await ftpClient.access(accessConfig);

			// UI-Einstellungen anwenden
			if (settings.ui) {
				// Color Provider für lokale und Remote-Dateien
				const colorProvider = vscode.window.registerFileDecorationProvider({
					provideFileDecoration: (uri) => {
						if (uri.scheme === 'ftpExplorer') {
							return {
								color: new vscode.ThemeColor(settings.ui.newerLocalColor || 'ftpExplorer.modifiedFile')
							};
						} else if (uri.scheme === 'ftpExplorer-missing') {
							return {
								color: new vscode.ThemeColor(settings.ui.remoteOnlyColor || 'ftpExplorer.missingLocalFile')
							};
						}
					}
				});
				context.subscriptions.push(colorProvider);
			}

			// Zeitstempelvergleich-Einstellung speichern
			treeDataProvider.compareTimestamps = settings.compareTimestamps !== false;

			// Name des FTP-Servers im Log anzeigen
			const serverName = settings.name || settings.host;
			log(`${t('connection_established')} ${serverName}`, 'success');

			// Veränderte Logik für das Laden der Items
			log('Lade Verzeichnisstruktur...');
			const remoteItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
			
			// Lokale Items nur für Ordner laden, die nicht remote existieren
			const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, remoteItems);
			const mergedItems = await treeDataProvider.mergeItems(localItems, remoteItems);
			
			treeDataProvider.items = mergedItems;
			treeDataProvider.refresh();
			
			log('Verzeichnisstruktur geladen', 'success');

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
			vscode.window.showInformationMessage(t('upload_success') + `: ${item.remotePath}`);
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
			vscode.window.showInformationMessage(t('download_success') + `: ${item.localPath}`);
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
						message: `${Math.round(completed)}% ${t('progress_complete')}` 
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
						message: `${Math.round(completed)}% ${t('progress_complete')}` 
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
			vscode.window.showInformationMessage(t('connection_closed'));

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
		
		if (item.contextValue === 'directory' || item.contextValue === 'remoteDirectory') {
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

	// Neue Funktion zur Verbindungsprüfung
	async function ensureFtpConnection() {
		if (!ftpClient) {
			log('Keine FTP-Verbindung vorhanden, versuche Verbindungsaufbau...', 'info');
			return await reconnectFtp();
		}
		
		try {
			// Teste die Verbindung mit einem einfachen Befehl
			await ftpClient.pwd();
			return true;
		} catch (err) {
			log('FTP-Verbindung unterbrochen, versuche Reconnect...', 'info');
			return await reconnectFtp();
		}
	}

	async function reconnectFtp() {
		try {
			// Wenn es einen alten Client gibt, diesen erst schließen
			if (ftpClient) {
				try {
					ftpClient.close();
				} catch (err) {
					log(`Fehler beim Schließen der alten Verbindung: ${err.message}`, 'error');
				}
			}

			log('Stelle neue FTP-Verbindung her...');
			const settings = await loadFtpSettings();
			if (!settings) return false;

			ftpClient = new ftp.Client(30000); // Timeout auf 30 Sekunden setzen
			ftpClient.ftp.verbose = true;
			ftpClient.ftp.log = msg => log(`FTP: ${msg}`);

			await ftpClient.access({
				host: settings.host,
				user: settings.user,
				password: settings.password,
				port: settings.port || 21,
				secure: settings.secure || false
			});

			log('FTP-Verbindung hergestellt', 'success');
			return true;
		} catch (err) {
			log(`Reconnect fehlgeschlagen: ${err.message}`, 'error');
			ftpClient = null;
			return false;
		}
	}

	// Click-Handler für TreeView-Items
	treeView.onDidChangeSelection(async (event) => {
		const item = event.selection[0];
		if (!item || item.contextValue === 'directory' || item.contextValue === 'remoteDirectory') return;

		try {
			if (item.contextValue === 'remoteOnly') {
				if (!await ensureFtpConnection()) {
					vscode.window.showErrorMessage('Keine FTP-Verbindung möglich');
					return;
				}

				log(`Öffne Remote-Datei: ${item.remotePath}`);
				await fs.promises.mkdir(path.dirname(item.localPath), { recursive: true });
				await ftpClient.downloadTo(item.localPath, item.remotePath);
				
				if (item.remoteModifiedTime) {
					const remoteTime = new Date(item.remoteModifiedTime);
					await fs.promises.utimes(item.localPath, remoteTime, remoteTime);
				}
				
				item.contextValue = 'file';
				item.resourceUri = undefined;
			}
			
			// Öffne die Datei
			const doc = await vscode.workspace.openTextDocument(item.localPath);
			await vscode.window.showTextDocument(doc);
			log(`Datei geöffnet: ${item.localPath}`);
			
			// Aktualisiere die Ansicht nur wenn nötig
			if (item.contextValue === 'remoteOnly') {
				if (await ensureFtpConnection()) {
					const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
					const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
					treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
					treeDataProvider.refresh();
				}
			}
		} catch (err) {
			log(`Fehler beim Öffnen der Datei: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Fehler beim Öffnen der Datei: ${err.message}`);
		}
	});

	// Aktualisierung bei Fokus auf FTP Explorer
	vscode.window.onDidChangeActiveTextEditor(async () => {
		if (treeView.visible) {
			try {
				if (await ensureFtpConnection()) {
					log('Starte Tree-Aktualisierung nach Fokus...');
					const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
					const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
					treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
					treeDataProvider.refresh();
					log('Tree-Aktualisierung abgeschlossen');
				}
			} catch (err) {
				log(`Fehler bei der Tree-Aktualisierung: ${err.message}`, 'error');
			}
		}
	});

	// Aktualisierung wenn eine Datei gespeichert wird
	vscode.workspace.onDidSaveTextDocument(async (document) => {
		// Prüfe ob die gespeicherte Datei im Workspace-Verzeichnis liegt
		if (document.uri.scheme === 'file' && 
			document.uri.fsPath.startsWith(treeDataProvider.localRoot)) {
			
			if (!ftpClient || ftpClient.closed) {
				const reconnected = await reconnectFtp();
				if (!reconnected) {
					log('Keine FTP-Verbindung möglich', 'error');
					return;
				}
			}
			
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
					const reconnected = await reconnectFtp();
					if (!reconnected) {
						log('Verbindung konnte nicht wiederhergestellt werden', 'error');
					}
				} else {
					log(`Fehler bei der Tree-Aktualisierung: ${err.message}`, 'error');
				}
			}
		}
	});

	let uploadFileCommand = vscode.commands.registerCommand('ftpExplorer.uploadFile', async (item) => {
		try {
			if (!await ensureFtpConnection()) {
				vscode.window.showErrorMessage('Keine FTP-Verbindung möglich');
				return;
			}

			log(`Starte Upload: ${item.localPath} -> ${item.remotePath}`);
			if (fs.statSync(item.localPath).isDirectory()) {
				await uploadDirectory(item.localPath, item.remotePath);
			} else {
				await ftpClient.uploadFrom(item.localPath, item.remotePath);
			}
			
			// Aktualisiere die Ansicht
			if (await ensureFtpConnection()) {
				const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
				const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
				treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
				treeDataProvider.refresh();
			}
			
			log(`Upload erfolgreich: ${item.remotePath}`, 'success');
			vscode.window.showInformationMessage(t('upload_success') + `: ${item.remotePath}`);
		} catch (err) {
			log(`Upload-Fehler: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Upload-Fehler: ${err.message}`);
		}
	});

	let refreshCommand = vscode.commands.registerCommand('ftpExplorer.refresh', async () => {
		try {
			log('Starte manuelle Aktualisierung...');
			
			if (!await ensureFtpConnection()) {
				vscode.window.showErrorMessage('Keine FTP-Verbindung möglich');
				return;
			}

			const rootItems = await treeDataProvider.getFtpItems(treeDataProvider.remoteRoot);
			const localItems = await treeDataProvider.getLocalItems(treeDataProvider.localRoot, rootItems);
			treeDataProvider.items = await treeDataProvider.mergeItems(localItems, rootItems);
			treeDataProvider.refresh();
			
			log('Manuelle Aktualisierung abgeschlossen', 'success');
			vscode.window.showInformationMessage(t('refresh_complete'));
		} catch (err) {
			log(`Fehler bei der Aktualisierung: ${err.message}`, 'error');
			vscode.window.showErrorMessage(`Aktualisierungsfehler: ${err.message}`);
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
	context.subscriptions.push(deleteRemoteCommand);
	context.subscriptions.push(refreshCommand);
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

