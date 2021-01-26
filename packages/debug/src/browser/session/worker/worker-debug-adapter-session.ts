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

import { CommunicationProvider } from '../../../common/debug-model';
import { BaseDebugAdapterSession } from '../base-debug-adapter-session';

export class WorkerDebugAdapterSession extends BaseDebugAdapterSession {

    protected worker: Worker;

    constructor(communicationProvider: CommunicationProvider, worker: string | Worker) {
        super(communicationProvider);

        this.worker = typeof worker === 'string'
            ? new Worker(worker)
            : worker;

        this.worker.onmessage = this.workerMessage.bind(this);
        // this.worker.onerror = this.workerError.bind(this);
    }

    protected workerMessage(ev: MessageEvent): void {
        const message = ev.data.data;
        this.write(message);
    }

    protected doSend(message: string): void {
        this.worker.postMessage(message);
    }
}
