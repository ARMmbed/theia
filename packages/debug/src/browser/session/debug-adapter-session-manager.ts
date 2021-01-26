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

import { UUID } from '@phosphor/coreutils';
import { injectable } from 'inversify';
import { IWebSocket } from 'vscode-ws-jsonrpc';
import { DebugAdapterContributionRegistry } from './debug-adapter-contribution-registry';
import { BaseDebugAdapterSessionManager } from '../../common/base-debug-adapter-session-manager';
import { DebugConfiguration } from '../../common/debug-configuration';

/**
 * Debug adapter session manager.
 */
@injectable()
export class DebugAdapterSessionManager extends BaseDebugAdapterSessionManager<IWebSocket> {
    /**
     * Creates a new [debug adapter session](#DebugAdapterSession).
     * @param config The [DebugConfiguration](#DebugConfiguration)
     * @returns The debug adapter session
     */
    public async create(config: DebugConfiguration, registry: DebugAdapterContributionRegistry): Promise<string> {
        const sessionId = UUID.uuid4();
        const session = await registry.createDebugAdapterSession(config, sessionId);
        this.sessions.set(sessionId, session);
        return sessionId;
    }
}
