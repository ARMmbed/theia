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
import { DebugSession } from 'vscode-debugadapter';
import { WorkerDebugAdapterSession } from './worker-debug-adapter-session';

export class DebugAdapterWebWorker {
    constructor(protected worker: Worker) {
    }

    public start(sessionType: typeof DebugSession): void {
        const debugSession = new sessionType();

        const communicationProvider = {
            input: new PassThrough(),
            output: new PassThrough(),
            dispose: () => { }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new WorkerDebugAdapterSession(communicationProvider, self as any);
        debugSession.start(communicationProvider.input, communicationProvider.output);
    }
}
