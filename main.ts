/*
MIT License

Copyright (c) [2021] [Alonelur yinwenhan1998@gmail.com]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice } from 'obsidian';

import * as os from 'os';
import * as child_process from 'child_process';
import * as util from 'util';

const exec = util.promisify(child_process.exec)

interface VimImPluginSettings {
	defaultIM: string;
	obtainCmd: string;
	switchCmd: string;
	windowsDefaultIM: string;
	windowsObtainCmd: string;
	windowsSwitchCmd: string;
	switchOnInsert: boolean;
	normalModeOnFocus: boolean;
}

const DEFAULT_SETTINGS: VimImPluginSettings = {
	defaultIM: '',
	obtainCmd: '',
	switchCmd: '',
	windowsDefaultIM: '',
	windowsObtainCmd: '',
	windowsSwitchCmd: '',
	switchOnInsert: true,
	normalModeOnFocus: false,
}

function isEmpty(obj : any) {
  return obj && typeof obj === "object" && Object.keys(obj).length === 0;
}

export default class VimImPlugin extends Plugin {
	settings: VimImPluginSettings;
	private previousIMEMode: string | null = null;
	private previousVimMode = '';
	private isWinPlatform = false;

	async onload() {
		await this.loadSettings();

		// when open a file, to initialize current
		// editor type CodeMirror5 or CodeMirror6
		this.registerEvent(this.app.workspace.on('active-leaf-change', async () => {
			const view = this.getActiveView();
			if (view) {
				const editor = this.getCodeMirror(view);
				if (editor) {
					// TODO: suppress error
					editor.off('vim-mode-change', this.onVimModeChanged);
					editor.on('vim-mode-change', this.onVimModeChanged);
				}
			}
		}));
		
		this.registerEvent(this.app.workspace.on('file-open', async () => {
			await this.switchToNormalIME();
		}));

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// console.debug("VimIm::OS type: " + os.type());
		this.isWinPlatform = os.type() == 'Windows_NT';

		this.previousIMEMode = this.isWinPlatform ? this.settings.windowsDefaultIM : this.settings.defaultIM;

		if (this.isWinPlatform) {
			console.info("VimIm Use Windows config");
		}

		if (this.settings.normalModeOnFocus) {
			this.registerDomEvent(window, "focus", () => {
				// console.debug("focus evt");
				if (this.previousVimMode !== "insert") {
					this.switchToNormalIME();
				}
			});
		}
	}

	private getActiveView(): MarkdownView {
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	private getCodeMirror(view: MarkdownView): CodeMirror.Editor {
		// For CM6 this actually returns an instance of the object named CodeMirror from cm_adapter of codemirror_vim
		return (view as any).sourceMode?.cmEditor?.cm?.cm;
	}

	async onSwitchToInsert() {
		if (!this.settings.switchOnInsert) {
			return;
		}
		await this.switchToPreviousIME();
	}

	async switchToPreviousIME() {
		if (this.previousIMEMode === null) {
			return;
		}

		const switchCmd = this.isWinPlatform
			? this.settings.windowsSwitchCmd.replace(/{im}/, this.previousIMEMode)
			: this.settings.switchCmd.replace(/{im}/, this.previousIMEMode);

		try {
			await exec(switchCmd);
		} catch (err) {
			this.showError("An error has occurred while switching IME mode", err);
		}
	}

	showError(msg: string, err: any) {
		console.error(msg, err);
		new Notice("Error: " + msg + ` (${err})`);
	}

	async switchToNormalIME() {
		const switchCmd = this.isWinPlatform 
			? this.settings.windowsSwitchCmd.replace(/{im}/, this.settings.windowsDefaultIM) 
			: this.settings.switchCmd.replace(/{im}/, this.settings.defaultIM);
		const obtainCmd = this.isWinPlatform 
			? this.settings.windowsObtainCmd 
			: this.settings.obtainCmd;
		// console.debug("change to noInsert");
		try {
			this.previousIMEMode = (await exec(obtainCmd)).stdout;
			// console.debug(`Current IME mode: ${this.previousIMEMode}`);
			await exec(switchCmd);
		} catch (err) {
			this.showError("An error occcurred while switching IME mode", err);
		}
	}

	onVimModeChanged = async (modeObj: any) => {
		if (isEmpty(modeObj)) {
			return;
		}
		switch (modeObj.mode) {
			case "insert":
				this.onSwitchToInsert();
				break;
			default:
				if (this.previousVimMode == "insert") {
					// When Vim mode is from INSERT to another
					this.switchToNormalIME();
					break;
				}
				break;
		}
		this.previousVimMode = modeObj.mode;
	};

	onunload() {
		console.debug("onunload");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

class SampleSettingTab extends PluginSettingTab {
	plugin: VimImPlugin;

	constructor(app: App, plugin: VimImPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Vim IM Select Settings.' });

		new Setting(containerEl)
			.setName("Switch IME mode on insert")
			.addToggle(text => text
				.setValue(this.plugin.settings.switchOnInsert)
				.onChange(async (value) => {
					this.plugin.settings.switchOnInsert = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName("Switch Vim mode to normal on window focus")
			.setDesc("You have to reload/restart Obsidian to take effect")
			.addToggle(text => text
				.setValue(this.plugin.settings.normalModeOnFocus)
				.onChange(async (value) => {
					this.plugin.settings.normalModeOnFocus = value;
					await this.plugin.saveSettings();
				}));
		containerEl.createEl('h3', { text: 'Settings for default platform.' });
		new Setting(containerEl)
			.setName('Default IM')
			.setDesc('IM for normal mode')
			.addText(text => text
				.setPlaceholder('Default IM')
				.setValue(this.plugin.settings.defaultIM)
				.onChange(async (value) => {
					// console.debug('Default IM: ' + value);
					this.plugin.settings.defaultIM = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Obtaining Command')
			.setDesc('Command for obtaining current IM(must be excutable)')
			.addText(text => text
				.setPlaceholder('Obtaining Command')
				.setValue(this.plugin.settings.obtainCmd)
				.onChange(async (value) => {
					// console.debug('Obtain Cmd: ' + value);
					this.plugin.settings.obtainCmd = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Switching Command')
			.setDesc('Command for switching to specific IM(must be excutable)')
			.addText(text => text
				.setPlaceholder('Use {im} as placeholder of IM')
				.setValue(this.plugin.settings.switchCmd)
				.onChange(async (value) => {
					// console.debug('Switch Cmd: ' + value);
					this.plugin.settings.switchCmd = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Settings for Windows platform.' });
		new Setting(containerEl)
			.setName('Windows Default IM')
			.setDesc('IM for normal mode')
			.addText(text => text
				.setPlaceholder('Default IM')
				.setValue(this.plugin.settings.windowsDefaultIM)
				.onChange(async (value) => {
					// console.debug('Default IM: ' + value);
					this.plugin.settings.windowsDefaultIM = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Obtaining Command on Windows')
			.setDesc('Command for obtaining current IM(must be excutable)')
			.addText(text => text
				.setPlaceholder('Obtaining Command')
				.setValue(this.plugin.settings.windowsObtainCmd)
				.onChange(async (value) => {
					// console.debug('Obtain Cmd: ' + value);
					this.plugin.settings.windowsObtainCmd = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Switching Command on Windows')
			.setDesc('Command for switching to specific IM(must be excutable)')
			.addText(text => text
				.setPlaceholder('Use {im} as placeholder of IM')
				.setValue(this.plugin.settings.windowsSwitchCmd)
				.onChange(async (value) => {
					// console.debug('Switch Cmd: ' + value);
					this.plugin.settings.windowsSwitchCmd = value;
					await this.plugin.saveSettings();
				}));
	}
}
