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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Modified from @theia/debug/lib/node/debug-adapter-session.ts
// Some entities copied and modified from https://github.com/Microsoft/vscode-debugadapter-node/blob/master/adapter/src/protocol.ts

import { DebugProtocol } from 'vscode-debugprotocol';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { CommunicationProvider } from '../../common/debug-model';

const CRLF = '\r\n';
const TWO_CRLF = `${CRLF}${CRLF}`;
const CONTENT_LENGTH = 'Content-Length';

export abstract class BaseDebugAdapterSession {

    protected readonly toDispose = new DisposableCollection();
    private contentLength = -1;
    private buffer = Buffer.alloc(0);

    constructor(protected communicationProvider: CommunicationProvider) {
        this.communicationProvider.output.on('data', (data: Buffer) => this.handleData(data));
        this.communicationProvider.output.on('close', () => this.onDebugAdapterExit(1, undefined)); // FIXME pass a proper exit code
        this.communicationProvider.output.on('error', error => this.onDebugAdapterError(error));
        this.communicationProvider.input.on('error', error => this.onDebugAdapterError(error));

        this.toDispose.pushAll([
            this.communicationProvider,
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'disconnect' }))),
            Disposable.create(() => this.write(JSON.stringify({ seq: -1, type: 'request', command: 'terminate' })))
        ]);
    }

    protected onDebugAdapterExit(exitCode: number, _signal: string | undefined): void {
        const event: DebugProtocol.ExitedEvent = {
            type: 'event',
            event: 'exited',
            seq: -1,
            body: {
                exitCode
            }
        };
        this.doSend(JSON.stringify(event));
    }

    protected onDebugAdapterError(error: Error): void {
        const event: DebugProtocol.Event = {
            type: 'event',
            event: 'error',
            seq: -1,
            body: error
        };
        this.doSend(JSON.stringify(event));
    }

    protected handleData(data: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (true) {
            if (this.contentLength >= 0) {
                if (this.buffer.length >= this.contentLength) {
                    const message = this.buffer.toString('utf8', 0, this.contentLength);
                    this.buffer = this.buffer.slice(this.contentLength);
                    this.contentLength = -1;

                    if (message.length > 0) {
                        this.doSend(message);
                    }
                    continue; // there may be more complete messages to process
                }
            } else {
                let idx = this.buffer.indexOf(CONTENT_LENGTH);
                if (idx > 0) {
                    // log unrecognized output
                    // const output = this.buffer.slice(0, idx);
                    // console.log(output.toString('utf-8'));

                    this.buffer = this.buffer.slice(idx);
                }

                idx = this.buffer.indexOf(TWO_CRLF);
                if (idx !== -1) {
                    const header = this.buffer.toString('utf8', 0, idx);
                    const lines = header.split(CRLF);
                    for (const line of lines) {
                        const pair = line.split(/: +/);
                        if (pair[0] === CONTENT_LENGTH) {
                            this.contentLength = +pair[1];
                        }
                    }
                    this.buffer = this.buffer.slice(idx + TWO_CRLF.length);
                    continue;
                }
            }
            break;
        }
    }

    protected write(message: string): void {
        const content = `${CONTENT_LENGTH}: ${Buffer.byteLength(message, 'utf8')}${TWO_CRLF}${message}`;
        this.communicationProvider.input.write(content, 'utf8');
    }

    protected abstract doSend(message: string): void;

    public async dispose(): Promise<void> {
        this.toDispose.dispose();
    }
}
