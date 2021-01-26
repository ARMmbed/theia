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

import { PassThrough } from 'stream';
import { injectable, unmanaged } from 'inversify';
import { IWebSocket } from 'vscode-ws-jsonrpc';
import { DebugSession } from 'vscode-debugadapter';
import { BrowserDebugAdapterSession } from './browser-debug-adapter-session';
import { FrontendDebugAdapterContribution } from '../debug-adapter-contribution-registry';
import { BaseDebugAdapterContribution } from '../../../common/vscode/base-debug-adapter-contribution';

@injectable()
export abstract class BrowserDebugAdapterContribution extends BaseDebugAdapterContribution implements FrontendDebugAdapterContribution {

    constructor(
        @unmanaged() readonly type: string
    ) {
        super(type);
    }

    protected abstract getSessionType(): typeof DebugSession;

    public async createDebugAdapterSession(_sessionId: string): Promise<IWebSocket> {
        const sessionType = this.getSessionType();
        const debugSession = new sessionType();

        const communicationProvider = {
            input: new PassThrough(),
            output: new PassThrough(),
            dispose: () => { }
        };

        const session = new BrowserDebugAdapterSession(communicationProvider);
        debugSession.start(communicationProvider.input, communicationProvider.output);

        return session;
    }
}
