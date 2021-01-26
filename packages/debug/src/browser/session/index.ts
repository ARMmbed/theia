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

import { ContainerModule } from 'inversify';
import { DebugService } from '../../common/debug-service';
import { bindContributionProvider } from '@theia/core';
import { DebugAdapterContribution } from '../../common/debug-model';
import { FrontendDebugService } from './frontend-debug-service';
import { DebugAdapterContributionRegistry } from './debug-adapter-contribution-registry';
import { DebugAdapterSessionManager } from './debug-adapter-session-manager';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bindContributionProvider(bind, DebugAdapterContribution);
    bind(DebugAdapterContributionRegistry).toSelf().inSingletonScope();
    bind(DebugAdapterSessionManager).toSelf().inSingletonScope();

    // Adapter entry point
    if (isBound(DebugService)) {
        rebind(DebugService).to(FrontendDebugService).inSingletonScope();
    }
});
