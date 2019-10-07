/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { inject, injectable } from 'inversify';
import { Hg } from '../../common';
import { ScmHistorySupport } from '@theia/scm/lib/browser/history/scm-history-widget';
import { ScmCommit, HistoryWidgetOptions } from '@theia/scm/lib/browser/scm-provider';
import { HgScmProvider } from '../hg-scm-provider';

@injectable()
export class HgHistorySupport implements ScmHistorySupport {

    constructor(
        @inject(HgScmProvider) protected readonly provider: HgScmProvider,
        @inject(Hg) protected readonly hg: Hg
    ) {
    }

    async getCommitHistory(options?: HistoryWidgetOptions): Promise<ScmCommit[] | Error> {
        const repository = this.provider.repository;
        const range2 = { toRevision: '.', fromRevision: '.', ...((options || {}).range || {}) };
        const range3 = { toRevision: range2.toRevision, fromRevision: range2.fromRevision.toString() };
        const options2 = {
            range: range3
        };
        const commits = await this.hg.log(repository, options2);
        if (commits.length > 0) {
            return commits.map(commit => this.provider.createScmCommit(commit));
        } else {
            const pathIsUnderVersionControl = !options || !options.uri || await this.hg.lsFiles(repository, options.uri, { errorUnmatch: true });
            if (!pathIsUnderVersionControl) {
                return new Error('It is not under version control.');
            } else {
                return new Error('No commits have been committed.');
            }
        }
    }

}
