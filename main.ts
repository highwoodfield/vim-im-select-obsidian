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

const INSERTION_MODE_PREVIOUS = "_PREVIOUS_";

interface Settings {
	normalModeOnFocus: boolean;
	defaultPlatformSettings: PlatformSettings;
	windowsPlatformSettings: PlatformSettings;
}

interface PlatformSettings {
	normalIM: string;
	insertionIM: string;
	obtainCmd: string;
	switchCmd: string;
}

/**
 * Settings for (de)serialization
 */
interface RawSettings {
	defaultIM: string;
	insertionIM: string;
	obtainCmd: string;
	switchCmd: string;
	windowsDefaultIM: string;
	windowsInsertionIM: string;
	windowsObtainCmd: string;
	windowsSwitchCmd: string;
	normalModeOnFocus: boolean;
}

const DEFAULT_SETTINGS: RawSettings = {
	defaultIM: '',
	insertionIM: INSERTION_MODE_PREVIOUS,
	obtainCmd: '',
	switchCmd: '',
	windowsDefaultIM: '',
	windowsInsertionIM: INSERTION_MODE_PREVIOUS,
	windowsObtainCmd: '',
	windowsSwitchCmd: '',
	normalModeOnFocus: false,
}

function isEmpty(obj : any) {
  return obj && typeof obj === "object" && Object.keys(obj).length === 0;
}

export default class VimImPlugin extends Plugin {
	settings: Settings;
	private previousIMEMode: string | null = null;
	private previousVimMode = '';
	private isWinPlatform = false;

	getPlatformSettings(windows: boolean = this.isWinPlatform): PlatformSettings {
		return windows ? this.settings.windowsPlatformSettings : this.settings.defaultPlatformSettings;
	}

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
			await this.onNormal();
		}));

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// console.debug("VimIm::OS type: " + os.type());
		this.isWinPlatform = os.type() == 'Windows_NT';

		this.previousIMEMode = this.getPlatformSettings().normalIM;

		if (this.isWinPlatform) {
			console.info("VimIm Use Windows config");
		}

		if (this.settings.normalModeOnFocus) {
			this.registerDomEvent(window, "focus", () => {
				// console.debug("focus evt");
				if (this.previousVimMode !== "insert") {
					this.onNormal();
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

	async onInsert() {
		let mode = this.getPlatformSettings().insertionIM;
		if (mode === INSERTION_MODE_PREVIOUS) {
			mode = this.previousIMEMode;
		}
		if (mode === null) {
			return;
		}
		await this.execSwitch(mode);
	}

	async execSwitch(im: string) {
		const cmd = this.getPlatformSettings().switchCmd.replace(/{im}/, im);
		try {
			await exec(cmd);
		} catch (err) {
			this.showError("An error has occurred while switching IME mode", err);
		}
	}

	showError(msg: string, err: any) {
		console.error(msg, err);
		new Notice("Error: " + msg + ` (${err})`);
	}

	async onNormal() {
		const obtainCmd = this.getPlatformSettings().obtainCmd;
		try {
			this.previousIMEMode = (await exec(obtainCmd)).stdout;
		} catch (err) {
			this.showError("An error occcurred while switching IME mode", err);
		}
		await this.execSwitch(this.getPlatformSettings().normalIM);
	}

	onVimModeChanged = async (modeObj: any) => {
		if (isEmpty(modeObj)) {
			return;
		}
		switch (modeObj.mode) {
			case "insert":
				await this.onInsert();
				break;
			default:
				if (this.previousVimMode == "insert") {
					// When Vim mode is from INSERT to another
					await this.onNormal();
					break;
				}
				break;
		}
		this.previousVimMode = modeObj.mode;
	};

	onunload() {
		console.debug("onunload");
	}

	async loadSettings(): Promise<Settings> {
		const s: RawSettings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		return {
			normalModeOnFocus: s.normalModeOnFocus,
			windowsPlatformSettings: {
					normalIM: s.windowsDefaultIM,
					insertionIM: s.windowsInsertionIM,
					obtainCmd: s.windowsObtainCmd,
					switchCmd: s.windowsSwitchCmd,
			},
			defaultPlatformSettings: {
				normalIM: s.defaultIM,
				insertionIM: s.insertionIM,
				obtainCmd: s.obtainCmd,
				switchCmd: s.switchCmd,
			}
		}
	}

	async saveSettings() {
		const s = this.settings;
		const rawSettings: RawSettings = {
			normalModeOnFocus: s.normalModeOnFocus,
			defaultIM: s.defaultPlatformSettings.normalIM,
			insertionIM: s.defaultPlatformSettings.insertionIM,
			obtainCmd: s.defaultPlatformSettings.obtainCmd,
			switchCmd: s.defaultPlatformSettings.switchCmd,
			windowsDefaultIM: s.windowsPlatformSettings.normalIM,
			windowsInsertionIM: s.windowsPlatformSettings.insertionIM,
			windowsObtainCmd: s.windowsPlatformSettings.obtainCmd,
			windowsSwitchCmd: s.windowsPlatformSettings.switchCmd,
		};
		await this.saveData(rawSettings);
	}

}

class SampleSettingTab extends PluginSettingTab {
	plugin: VimImPlugin;

	constructor(app: App, plugin: VimImPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private createPlatformSettingView(ps: PlatformSettings) {
		const { containerEl } = this;
		new Setting(containerEl)
			.setName("IME mode on insertion. You can set mode to the previous mode by setting this value to " + INSERTION_MODE_PREVIOUS)
			.addText(text => text
				.setValue(ps.insertionIM)
				.onChange(async (value) => {
					ps.insertionIM = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Default IM')
			.setDesc('IM for normal mode')
			.addText(text => text
				.setPlaceholder('Default IM')
				.setValue(ps.normalIM)
				.onChange(async (value) => {
					// console.debug('Default IM: ' + value);
					ps.normalIM = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Obtaining Command')
			.setDesc('Command for obtaining current IM(must be excutable)')
			.addText(text => text
				.setPlaceholder('Obtaining Command')
				.setValue(ps.obtainCmd)
				.onChange(async (value) => {
					// console.debug('Obtain Cmd: ' + value);
					ps.obtainCmd = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Switching Command')
			.setDesc('Command for switching to specific IM(must be excutable)')
			.addText(text => text
				.setPlaceholder('Use {im} as placeholder of IM')
				.setValue(ps.switchCmd)
				.onChange(async (value) => {
					// console.debug('Switch Cmd: ' + value);
					ps.switchCmd = value;
					await this.plugin.saveSettings();
				}));
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Vim IM Select Settings.' });

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
		this.createPlatformSettingView(this.plugin.settings.defaultPlatformSettings)
		containerEl.createEl('h3', { text: 'Settings for Windows platform.' });
		this.createPlatformSettingView(this.plugin.settings.windowsPlatformSettings);
	}
}
