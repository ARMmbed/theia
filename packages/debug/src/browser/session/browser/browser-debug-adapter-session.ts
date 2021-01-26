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
import { BaseDebugAdapterSession } from '../base-debug-adapter-session';

export class BrowserDebugAdapterSession extends BaseDebugAdapterSession implements IWebSocket {

    protected socketMessage: ((data: string) => void) | undefined;

    protected doSend(message: string): void {
        if (this.socketMessage) {
            this.socketMessage(message);
        }
    }

    public send(content: string): void {
        this.write(content);
    }

    public onMessage(cb: (data: string) => void): void {
        this.socketMessage = cb;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public onError(cb: (reason: any) => void): void {
        this.communicationProvider.input.on('error', cb);
    }

    public onClose(cb: (code: number, reason: string) => void): void {
        this.communicationProvider.input.on('close', cb);
    }
}
