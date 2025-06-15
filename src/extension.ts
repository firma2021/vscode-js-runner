import * as fs from 'fs';
import * as vscode from 'vscode';

interface ScriptArgs
{
    [filePath: string]: {
        args: string;
        lastUsed: number; // 时间戳
    };
}



class JsRunner
{
    private terminal: vscode.Terminal | undefined;
    private readonly terminalName = 'JS Runner';

    private runtime: string = 'node';

    private savedArgs: ScriptArgs = {};
    private static readonly max_saved_args = 6;

    private clearTerminal: boolean = true;

    private running: boolean = false;

    constructor(private context: vscode.ExtensionContext)
    {
        this.savedArgs = context.globalState.get('js-runner.savedArgs', {});
        this.runtime = context.globalState.get('js-runner.runtime', 'node');
        this.clearTerminal = context.globalState.get('js-runner.clearMode', true);

        context.subscriptions.push(
            vscode.window.onDidCloseTerminal((closedTerminal) =>
            {
                if (closedTerminal === this.terminal)
                {
                    this.terminal = undefined;
                    this.running = false;
                }
            })
        );
    }

    async setRuntime()
    {
        const runtime = await vscode.window.showInputBox({
            prompt: 'Specify runtime (e.g. node, bun, ts-node, deno)',
            value: this.runtime,
            placeHolder: 'node'
        });

        if (runtime && runtime.trim())
        {
            this.runtime = runtime.trim();
            await this.context.globalState.update('js-runner.runtime', this.runtime);
            vscode.window.showInformationMessage(`JS Runner: Runtime set to ${this.runtime}`);
        }
    }

    toggleClearTerminal()
    {
        this.clearTerminal = !this.clearTerminal;
        this.context.globalState.update('js-runner.clearMode', this.clearTerminal);

        const status = this.clearTerminal ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`JS Runner: Clear terminal ${status}`);
    }

    async runScript()
    {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
        {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const document = editor.document;
        if (document.isDirty)
        {
            await document.save();
        }

        const filePath = document.fileName;

        if (!fs.existsSync(filePath))
        {
            vscode.window.showErrorMessage('File does not exist');
            return;
        }

        if (this.running && this.terminal && this.terminal.exitStatus === undefined)
        {
            vscode.window.showWarningMessage('A command is already running in the terminal. Please wait for it to finish.');
            return;
        }

        this.terminal = this.getOrCreateTerminal();
        this.terminal.show();

        if (this.clearTerminal)
        {
            this.terminal.sendText('clear');
        }

        let command = `${this.runtime} "${filePath}"`;
        const currentFileArgs = this.savedArgs[filePath]?.args || '';
        if (currentFileArgs.trim())
        {
            command += ` ${currentFileArgs}`;
        }

        this.running = true;
        this.terminal.sendText(command);
    }

    async setArgs()
    {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const filePath = editor.document.fileName;
        const saved = this.savedArgs[filePath];
        const savedArgsForFile = saved ? saved.args : '';

        const args = await vscode.window.showInputBox({
            prompt: '为脚本输入参数',
            value: savedArgsForFile,
            placeHolder: '如 --verbose input.txt'
        });

        if (args !== undefined)
        {
            this.savedArgs[filePath] = {
                args,
                lastUsed: Date.now()
            };
            const keys = Object.keys(this.savedArgs);
            if (keys.length > JsRunner.max_saved_args)
            {
                const sorted = keys.sort((a, b) => (this.savedArgs[a].lastUsed - this.savedArgs[b].lastUsed));
                const toDelete = sorted.slice(0, keys.length - JsRunner.max_saved_args);
                for (const key of toDelete)
                {
                    delete this.savedArgs[key];
                }
            }

            await this.context.globalState.update('js-runner.savedArgs', this.savedArgs);

            const message = args.trim() ? `Arguments set: ${args}` : 'Arguments cleared';
            vscode.window.showInformationMessage(message);
        }
    }

    private getOrCreateTerminal(): vscode.Terminal
    {
        if (this.terminal && this.terminal.exitStatus === undefined)
        {
            return this.terminal;
        }

        this.terminal = vscode.window.createTerminal({
            name: this.terminalName
        });

        this.terminal.processId.then(() =>
        {
            this.running = false;
        });

        return this.terminal;
    }
}

export function activate(context: vscode.ExtensionContext)
{
    const jsRunner = new JsRunner(context);

    const commands = [
        vscode.commands.registerCommand('js-runner.run', () => jsRunner.runScript()),
        vscode.commands.registerCommand('js-runner.setArgs', () => jsRunner.setArgs()),
        vscode.commands.registerCommand('js-runner.setRuntime', () => jsRunner.setRuntime()),
        vscode.commands.registerCommand('js-runner.toggleClear', () => jsRunner.toggleClearTerminal())
    ];

    context.subscriptions.push(...commands);
}

export function deactivate() { }
// ...existing code...
