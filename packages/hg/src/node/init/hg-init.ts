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

import { injectable, inject } from 'inversify';
import findGit from 'find-git-exec';
import { dirname } from 'path';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { pathExists } from 'fs-extra';
import { ILogger } from '@theia/core/lib/common/logger';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core';

/**
 * Initializer hook for Hg.
 */
export const HgInit = Symbol('HgInit');
export interface HgInit extends Disposable {

    /**
     * Called before `Hg` is ready to be used in Theia. Hg operations cannot be executed before the returning promise is not resolved or rejected.
     */
    init(): Promise<void>;

    /**
     * Called before `Hg` is first used for a given Hg repository.
     *
     * Note that the child process may be killed for inactive repositories.  In such cases this function will
     * be called again if further Mercurial commands are to be executed against the repository.
     */
    startCommandServer(repositoryPath: string): ChildProcess;

}

/**
 * The default initializer. It is used in the browser.
 *
 * Configures the Hg extension to use the Hg executable from the `PATH`.
 */
@injectable()
export class DefaultHgInit implements HgInit {

    protected readonly toDispose = new DisposableCollection();

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected envPath: string;

    async init(): Promise<void> {
        const { env } = process;
        this.envPath = env.Path || 'C:\\Program Files\\Mercurial\\hg.exe';
        try {
            const { execPath, path, version } = await findGit();
            if (!!execPath && !!path && !!version) {
                // https://hghub.com/desktop/dugite/issues/111#issuecomment-323222834
                // Instead of the executable path, we need the root directory of Hg.
                const dir = dirname(dirname(path));
                const [execPathOk, pathOk, dirOk] = await Promise.all([pathExists(execPath), pathExists(path), pathExists(dir)]);
                if (execPathOk && pathOk && dirOk) {
                    if (typeof env.LOCAL_HG_DIRECTORY !== 'undefined' && env.LOCAL_HG_DIRECTORY !== dir) {
                        this.logger.error(`Misconfigured env.LOCAL_HG_DIRECTORY: ${env.LOCAL_HG_DIRECTORY}. dir was: ${dir}`);
                        this.messages.error('The LOCAL_HG_DIRECTORY env variable was already set to a different value.', { timeout: 0 });
                        return;
                    }
                    if (typeof env.HG_EXEC_PATH !== 'undefined' && env.HG_EXEC_PATH !== execPath) {
                        this.logger.error(`Misconfigured env.HG_EXEC_PATH: ${env.HG_EXEC_PATH}. execPath was: ${execPath}`);
                        this.messages.error('The HG_EXEC_PATH env variable was already set to a different value.', { timeout: 0 });
                        return;
                    }
                    process.env.LOCAL_HG_DIRECTORY = dir;
                    process.env.HG_EXEC_PATH = execPath;
                    this.logger.info(`Using Hg [${version}] from the PATH. (${path})`);
                    return;
                }
            }
            this.messages.error('Could not find Hg on the PATH.', { timeout: 0 });
        } catch (err) {
            this.logger.error(err);
            this.messages.error('An unexpected error occurred when locating the Hg executable.', { timeout: 0 });
        }
    }

    startCommandServer(repositoryPath: string): ChildProcess {
        const processEnv = {
            HGENCODING: 'UTF-8',
            path: this.envPath,
        };
        const spawnOpts: SpawnOptions = {
            env: processEnv,
        };
        const options = ['--config', 'ui.interactive=True', '--config', 'ui.merge=internal:fail', 'serve', '--cmdserver', 'pipe', '--cwd', repositoryPath];
        return spawn('hg', options, spawnOpts);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
