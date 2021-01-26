/********************************************************************************
 * Copyright (C) 2021 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { IWebSocket } from 'vscode-ws-jsonrpc';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';

interface WorkerMessage {
    type: 'data' | 'control',
    data: string;
}

export class WorkerSocket implements IWebSocket {

    private readonly toDispose = new DisposableCollection();
    protected worker: Worker;
    protected socketMessage: ((data: string) => void) | undefined;

    constructor(worker: string | Worker) {
        this.worker = typeof worker === 'string'
            ? new Worker(worker)
            : worker;

        this.worker.onmessage = this.workerMessage.bind(this);
        this.toDispose.push(Disposable.create(() => this.worker.terminate()));
    }

    protected workerMessage(ev: MessageEvent): void {
        if (this.socketMessage) {
            this.socketMessage(ev.data);
        }
    }

    public send(data: string): void {
        const message: WorkerMessage = {
            type: 'data',
            data
        };

        this.worker.postMessage(message);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public onMessage(cb: (data: any) => void): void {
        this.socketMessage = cb;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public onError(_cb: (reason: any) => void): void {
    }

    public onClose(_cb: (code: number, reason: string) => void): void {
    }

    public dispose(): void {
        this.toDispose.dispose();
    }
}
