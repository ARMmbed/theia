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

import { injectable, unmanaged } from 'inversify';
import { IWebSocket } from 'vscode-ws-jsonrpc';
import { WorkerSocket } from './worker-socket';
import { FrontendDebugAdapterContribution } from '../debug-adapter-contribution-registry';
import { BaseDebugAdapterContribution } from '../../../common/vscode/base-debug-adapter-contribution';

@injectable()
export abstract class WorkerDebugAdapterContribution extends BaseDebugAdapterContribution implements FrontendDebugAdapterContribution {

    constructor(
        @unmanaged() readonly type: string
    ) {
        super(type);
    }

    protected abstract getWorker(): Worker;

    public async createDebugAdapterSession(_sessionId: string): Promise<IWebSocket> {
        const worker = this.getWorker();
        return new WorkerSocket(worker);
    }
}
