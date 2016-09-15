import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as services from './jupyter-js-services-shim';
import {Kernel} from './kernel';
import {KernelspecMetadata} from './contracts';

export class WSKernel extends Kernel {
    constructor(kernelSpec: KernelspecMetadata, language: string, private session: any) {
        super(kernelSpec, language);

        this.session.statusChanged.connect(this._onStatusChange.bind(this));
        this._onStatusChange();
    }

    public interrupt() {
        return this.session.kernel.interrupt();
    };

    public shutdown() {
        return this.session.kernel.shutdown();
    };

    public restart() {
        return this.session.kernel.restart();
    };

    public _onStatusChange() {
        // return this.statusView.setStatus(this.session.status);
        this.statusBar.text = `Sesion Status = ${this.session.status}`;
    };

    public _execute(code, onResults, callWatches) {
        const future = this.session.kernel.execute({
            code: code
        });
        future.onIOPub = (message) => {
            if (callWatches && message.header.msg_type === 'status' && message.content.execution_state === 'idle') {
                this._callWatchCallbacks();
            }
            if (onResults != null) {
                console.log('WSKernel: _execute:', message);
                const result = this._parseIOMessage(message);
                if (result != null) {
                    return onResults(result);
                }
            }
        };
        future.onReply = (message) => {
            if (message.content.status === 'error') {
                return;
            }
            const result = {
                data: 'ok',
                type: 'text',
                stream: 'status'
            };
            return typeof onResults === 'function' ? onResults(result) : void 0;
        };
        return future.onStdin = (message) => {
            if (message.header.msg_type !== 'input_request') {
                return;
            }
            const prompt = message.content.prompt;
            vscode.window.showInputBox({ prompt: prompt }).then(reply => {
                this.session.kernel.sendInputReply({ value: reply });
            });
        };
    };

    public execute(code, onResults) {
        return this._execute(code, onResults, true);
    };

    public executeWatch(code, onResults) {
        return this._execute(code, onResults, false);
    };

    public complete(code, onResults) {
        return this.session.kernel.complete({
            code: code,
            cursor_pos: code.length
        }).then(function (message) {
            return typeof onResults === 'function' ? onResults(message.content) : void 0;
        });
    };

    public inspect(code, cursor_pos, onResults) {
        return this.session.kernel.inspect({
            code: code,
            cursor_pos: cursor_pos,
            detail_level: 0
        }).then(function (message) {
            return typeof onResults === 'function' ? onResults({
                data: message.content.data,
                found: message.content.found
            }) : void 0;
        });
    };

    public promptRename() {
        vscode.window.showInputBox({ prompt: 'Name your current session', value: this.session.path }).then(reply => {
            this.session.rename(reply);
        });
    };

    public destroy() {
        console.log('WSKernel: destroying jupyter-js-services Session');
        this.session.dispose();
        return super.destroy();
    };
}