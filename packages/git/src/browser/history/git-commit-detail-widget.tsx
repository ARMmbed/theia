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
import { Widget } from '@phosphor/widgets';
import { LabelProvider } from '@theia/core/lib/browser';
import { GitFileChange } from '../../common';
import { GitDiffWidget } from '../diff/git-diff-widget';
import { GitRepositoryProvider } from '../git-repository-provider';
import { ScmCommit } from '@theia/scm/lib/browser/scm-provider';
import * as React from 'react';

export const GitCommitDetailWidgetOptions = Symbol('GitCommitDetailWidgetOptions');
export interface GitCommitDetailWidgetOptions {
    commitDetails: ScmCommit;
    sha: string;
    authorAvatar: string;
}

@injectable()
export class GitCommitDetailWidget extends GitDiffWidget {

    constructor(
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(GitCommitDetailWidgetOptions) protected readonly commitDetailOptions: GitCommitDetailWidgetOptions
    ) {
        super();
        this.id = 'commit' + commitDetailOptions.commitDetails.id;
        this.title.label = commitDetailOptions.commitDetails.id;  // Should be something different? - Nigel
        this.options = {
            range: {
                fromRevision: commitDetailOptions.sha + '~1',
                toRevision: commitDetailOptions.sha
            }
        };
        this.title.closable = true;
        this.title.iconClass = 'icon-git-commit tab-git-icon';
    }

    protected renderDiffListHeader(): React.ReactNode {
        const authorEMail = this.commitDetailOptions.commitDetails.authorEmail;
        const subject = <div className='subject'>{this.commitDetailOptions.commitDetails.summary}</div>;
        const body = <div className='body'>{this.commitDetailOptions.commitDetails.messageBody || ''}</div>;
        const subjectRow = <div className='header-row'><div className='subjectContainer'>{subject}{body}</div></div>;
        const author = <div className='author header-value noWrapInfo'>{this.commitDetailOptions.commitDetails.authorName}</div>;
        const mail = <div className='mail header-value noWrapInfo'>{`<${authorEMail}>`}</div>;
        const authorRow = <div className='header-row noWrapInfo'><div className='theia-header'>author: </div>{author}</div>;
        const mailRow = <div className='header-row noWrapInfo'><div className='theia-header'>e-mail: </div>{mail}</div>;
        const authorDate = new Date(this.commitDetailOptions.commitDetails.authorTimestamp);
        const dateStr = authorDate.toLocaleDateString('en', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour12: true,
            hour: 'numeric',
            minute: 'numeric'
        });
        const date = <div className='date header-value noWrapInfo'>{dateStr}</div>;
        const dateRow = <div className='header-row noWrapInfo'><div className='theia-header'>date: </div>{date}</div>;
        const revisionRow = <div className='header-row noWrapInfo'>
            <div className='theia-header'>revision: </div>
            <div className='header-value noWrapInfo'>{this.commitDetailOptions.commitDetails.id}</div>  // need displayed field? - Nigel
        </div>;
        const gravatar = <div className='image-container'>
            <img className='gravatar' src={this.commitDetailOptions.authorAvatar}></img></div>;
        const commitInfo = <div className='header-row commit-info-row'>{gravatar}<div className='commit-info'>{authorRow}{mailRow}{dateRow}{revisionRow}</div></div>;
        const header = <div className='theia-header'>Files changed</div>;

        return <div className='diff-header'>{subjectRow}{commitInfo}{header}</div>;
    }

    protected ref: Widget | undefined;
    protected async revealChange(change: GitFileChange): Promise<void> {
        const ref = this.ref;
        const widget = await this.openChange(change, {
            mode: 'reveal',
            widgetOptions: ref ?
                { area: 'main', mode: 'tab-after', ref } :
                { area: 'main', mode: 'split-right', ref: this }
        });
        this.ref = widget instanceof Widget ? widget : undefined;
        if (this.ref) {
            this.ref.disposed.connect(() => {
                if (this.ref === widget) {
                    this.ref = undefined;
                }
            });
        }
    }

}
