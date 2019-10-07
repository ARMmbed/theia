/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { Container, interfaces } from 'inversify';
import { Hg } from '../../common/hg';
import { DugiteHg } from '../dugite-hg';
import { bindHg, HgBindingOptions } from '../hg-backend-module';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { NoSyncRepositoryManager } from '.././test/no-sync-repository-manager';
import { HgEnvProvider, DefaultHgEnvProvider } from '../env/hg-env-provider';
import { HgInit, DefaultHgInit } from '../init/hg-init';
import { MessageService, LogLevel } from '@theia/core/lib/common';
import { MessageClient } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';

// tslint:disable-next-line:no-any
export function initializeBindings(): { container: Container, bind: interfaces.Bind } {
    const container = new Container();
    const bind = container.bind.bind(container);
    bind(DefaultHgEnvProvider).toSelf().inRequestScope();
    bind(HgEnvProvider).toService(DefaultHgEnvProvider);
    bind(DefaultHgInit).toSelf();
    bind(HgInit).toService(DefaultHgInit);
    bind(MessageService).toSelf();
    bind(MessageClient).toSelf();
    bind(DugiteHg).toSelf();
    bind(Hg).toService(DugiteHg);
    bindLogger(bind);
    return { container, bind };
}

/**
 * For testing only.
 */
export async function createHg(bindingOptions: HgBindingOptions = HgBindingOptions.Default): Promise<Hg> {
    const { container, bind } = initializeBindings();
    bindHg(bind, {
        bindManager(binding: interfaces.BindingToSyntax<{}>): interfaces.BindingWhenOnSyntax<{}> {
            return binding.to(NoSyncRepositoryManager).inSingletonScope();
        }
    });
    (container.get(ILogger) as ILogger).setLogLevel(LogLevel.ERROR);
    const hg = container.get(DugiteHg);
    await hg.exec({ localUri: '' }, ['--version']); // Enforces eager Hg initialization by setting the `LOCAL_HG_DIRECTORY` and `HG_EXEC_PATH` env variables.
    return hg;
}
