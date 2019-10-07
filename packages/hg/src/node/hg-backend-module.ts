/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule, Container, interfaces } from 'inversify';
import { Hg, HgPath } from '../common/hg';
import { HgWatcherPath, HgWatcherClient, HgWatcherServer } from '../common/hg-watcher';
import { DugiteHg, OutputParser, NameStatusParser, HgBlameParser } from './dugite-hg';
import { DugiteHgWatcherServer } from './dugite-hg-watcher';
import { ConnectionHandler, JsonRpcConnectionHandler, ILogger } from '@theia/core/lib/common';
import { HgRepositoryManager } from './hg-repository-manager';
import { HgRepositoryWatcherFactory, HgRepositoryWatcherOptions, HgRepositoryWatcher } from './hg-repository-watcher';
import { HgLocator } from './hg-locator/hg-locator-protocol';
import { HgLocatorClient } from './hg-locator/hg-locator-client';
import { HgLocatorImpl } from './hg-locator/hg-locator-impl';
import { HgExecProvider } from './hg-exec-provider';
import { HgPromptServer, HgPromptClient, HgPrompt } from '../common/hg-prompt';
import { DugiteHgPromptServer } from './dugite-hg-prompt';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { DefaultHgInit, HgInit } from './init/hg-init';

const SINGLE_THREADED = process.argv.indexOf('--no-cluster') !== -1;

export interface HgBindingOptions {
    readonly bindManager: (binding: interfaces.BindingToSyntax<{}>) => interfaces.BindingWhenOnSyntax<{}>;
}

export namespace HgBindingOptions {
    export const Default: HgBindingOptions = {
        bindManager(binding: interfaces.BindingToSyntax<{}>): interfaces.BindingWhenOnSyntax<{}> {
            return binding.to(HgRepositoryManager).inSingletonScope();
        }
    };
}

export function bindHg(bind: interfaces.Bind, bindingOptions: HgBindingOptions = HgBindingOptions.Default): void {
    bindingOptions.bindManager(bind(HgRepositoryManager));
    bind(HgRepositoryWatcherFactory).toFactory(ctx => (options: HgRepositoryWatcherOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(HgRepositoryWatcher).toSelf();
        child.bind(HgRepositoryWatcherOptions).toConstantValue(options);
        return child.get(HgRepositoryWatcher);
    });
    if (SINGLE_THREADED) {
        bind(HgLocator).toDynamicValue(ctx => {
            const logger = ctx.container.get<ILogger>(ILogger);
            return new HgLocatorImpl({
                info: (message, ...args) => logger.info(message, ...args),
                error: (message, ...args) => logger.error(message, ...args)
            });
        });
    } else {
        bind(HgLocator).to(HgLocatorClient);
    }
    bind(OutputParser).toSelf().inSingletonScope();
    bind(NameStatusParser).toSelf().inSingletonScope();
    bind(HgBlameParser).toSelf().inSingletonScope();
    bind(HgExecProvider).toSelf().inSingletonScope();
    bind(ConnectionContainerModule).toConstantValue(hgConnectionModule);
}

const hgConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(DugiteHg).toSelf().inSingletonScope();
    bind(Hg).toService(DugiteHg);
    bindBackendService(HgPath, Hg);
});

export function bindRepositoryWatcher(bind: interfaces.Bind): void {
    bind(DugiteHgWatcherServer).toSelf();
    bind(HgWatcherServer).toService(DugiteHgWatcherServer);
}

export function bindPrompt(bind: interfaces.Bind): void {
    bind(DugiteHgPromptServer).toSelf().inSingletonScope();
    bind(HgPromptServer).toDynamicValue(context => context.container.get(DugiteHgPromptServer));
}

export default new ContainerModule(bind => {
    bindHg(bind);

    bind(DefaultHgInit).toSelf();
    bind(HgInit).toService(DefaultHgInit);

    bindRepositoryWatcher(bind);
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler<HgWatcherClient>(HgWatcherPath, client => {
            const server = context.container.get<HgWatcherServer>(HgWatcherServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bindPrompt(bind);
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler<HgPromptClient>(HgPrompt.WS_PATH, client => {
            const server = context.container.get<HgPromptServer>(HgPromptServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
