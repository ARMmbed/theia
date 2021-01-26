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

import * as fs from 'fs-extra';
import * as path from 'path';
import { injectable, unmanaged } from 'inversify';
import { DebugAdapterExecutable } from '../../common/debug-model';
import { BaseDebugAdapterContribution, VSCodeDebuggerContribution, VSCodeExtensionPackage } from '../../common/vscode/base-debug-adapter-contribution';

@injectable()
export abstract class AbstractVSCodeDebugAdapterContribution extends BaseDebugAdapterContribution {

    constructor(
        @unmanaged() readonly type: string,
        @unmanaged() readonly extensionPath: string
    ) {
        super(type);
    }

    protected async parse(): Promise<VSCodeExtensionPackage> {
        const pckPath = path.join(this.extensionPath, 'package.json');
        let text = (await fs.readFile(pckPath)).toString();

        const nlsPath = path.join(this.extensionPath, 'package.nls.json');
        if (fs.existsSync(nlsPath)) {
            const nlsMap: {
                [key: string]: string
            } = require(nlsPath);
            for (const key of Object.keys(nlsMap)) {
                const value = nlsMap[key].replace(/\"/g, '\\"');
                text = text.split('%' + key + '%').join(value);
            }
        }

        return JSON.parse(text);
    }

    async provideDebugAdapterExecutable(): Promise<DebugAdapterExecutable | undefined> {
        const contribution = await this.debuggerContribution;
        const info = VSCodeDebuggerContribution.toPlatformInfo(contribution);
        let program = (info && info.program || contribution.program);
        if (!program) {
            return undefined;
        }
        program = path.join(this.extensionPath, program);
        const programArgs = info && info.args || contribution.args || [];
        let runtime = info && info.runtime || contribution.runtime;
        if (runtime && runtime.indexOf('./') === 0) {
            runtime = path.join(this.extensionPath, runtime);
        }

        const runtimeArgs = info && info.runtimeArgs || contribution.runtimeArgs || [];
        if (runtime === 'node') {
            const modulePath = program;
            return {
                modulePath: modulePath,
                execArgv: runtimeArgs,
                args: programArgs
            };
        } else {
            const command = runtime ? runtime : program;
            const args = runtime ? [...runtimeArgs, program, ...programArgs] : programArgs;
            return {
                command,
                args
            };
        }
    }
}
