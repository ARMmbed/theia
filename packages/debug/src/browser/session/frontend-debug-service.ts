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

// Modified from @theia/debug/lib/node/debug-service-impl.ts

import { injectable, inject } from 'inversify';
import { IWebSocket } from 'vscode-ws-jsonrpc';
import { DebugConfiguration } from '../../common/debug-configuration';
import { DebugAdapterSessionManager } from './debug-adapter-session-manager';
import { RegistryDebugService } from '../../common/registry-debug-service';
import { BaseDebugAdapterSessionManager } from '../../common/base-debug-adapter-session-manager';

@injectable()
export class FrontendDebugService extends RegistryDebugService {

    @inject(DebugAdapterSessionManager) protected readonly sessionManager!: BaseDebugAdapterSessionManager<IWebSocket>;

    public async createDebugSession(config: DebugConfiguration): Promise<string> {
        const sessionId = await this.sessionManager.create(config, this.registry);
        this.sessions.add(sessionId);
        return sessionId;
    }

    protected async doStop(sessionId: string): Promise<void> {
        const debugSession = this.sessionManager.find(sessionId);
        if (debugSession) {
            this.sessionManager.remove(sessionId);
            this.sessions.delete(sessionId);
            debugSession.dispose();
        }
    }

    public dispose(): void {
        this.terminateDebugSession();
    }
}
