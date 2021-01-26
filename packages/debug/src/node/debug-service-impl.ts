/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { DebugConfiguration } from '../common/debug-configuration';
import { BaseDebugAdapterSessionManager } from '../common/base-debug-adapter-session-manager';
import { DebugAdapterSession } from '../common/debug-model';
import { RegistryDebugService } from '../common/registry-debug-service';

/**
 * DebugService implementation.
 */
@injectable()
export class DebugServiceImpl extends RegistryDebugService {

    @inject(BaseDebugAdapterSessionManager)
    protected readonly sessionManager: BaseDebugAdapterSessionManager<DebugAdapterSession>;

    async createDebugSession(config: DebugConfiguration): Promise<string> {
        const sessionId = await this.sessionManager.create(config, this.registry);
        this.sessions.add(sessionId);
        return sessionId;
    }

    protected async doStop(sessionId: string): Promise<void> {
        const debugSession = this.sessionManager.find(sessionId);
        if (debugSession) {
            this.sessionManager.remove(sessionId);
            this.sessions.delete(sessionId);
            await debugSession.stop();
        }
    }
}
