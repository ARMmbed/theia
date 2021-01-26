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
import { injectable } from 'inversify';
import { DebugConfiguration } from '../../common/debug-configuration';
import { DebugError } from '../../common/debug-service';
import { DebugAdapterContribution } from '../../common/debug-model';
import { BaseDebugAdapterContributionRegistry } from '../../common/base-debug-adapter-contribution-registry';

export interface FrontendDebugAdapterContribution extends DebugAdapterContribution {
    createDebugAdapterSession(sessionId: string): Promise<IWebSocket>;
}

/**
 * Contributions registry.
 */
@injectable()
export class DebugAdapterContributionRegistry extends BaseDebugAdapterContributionRegistry<FrontendDebugAdapterContribution> {

    public async createDebugAdapterSession(config: DebugConfiguration, sessionId: string): Promise<IWebSocket> {
        for (const contribution of this.getContributions(config.type)) {
            if (contribution.createDebugAdapterSession) {
                return contribution.createDebugAdapterSession(sessionId);
            }
        }
        throw DebugError.NotFound(config.type);
    }
}
