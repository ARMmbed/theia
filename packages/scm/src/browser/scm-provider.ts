/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

// tslint:disable:no-any

import { Disposable, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';

export interface ScmProvider extends Disposable {
    readonly id: string;
    readonly label: string;
    readonly rootUri: string;

    readonly acceptInputCommand?: ScmCommand;

    readonly groups: ScmResourceGroup[];
    readonly onDidChange: Event<void>;

    readonly statusBarCommands?: ScmCommand[];
    readonly onDidChangeStatusBarCommands?: Event<ScmCommand[] | undefined>;

    readonly amendSupport?: ScmAmendSupport;
}

/**
 * Range that is used for representing to individual commitish when calculating either `git log` or `git diff`.
 */
export interface Range {

    /**
     * The last revision that should be included among the result running this query. Here, the revision can be a tag, a commitish,
     * or even an expression (`HEAD~3`). For more details to specify the revision, see [here](https://git-scm.com/docs/gitrevisions#_specifying_revisions).
     */
    readonly toRevision?: string;

    /**
     * Either the from revision (`string`) or a positive integer that is equivalent to the `~` suffix, which means the commit object that is the `fromRevision`<sup>th</sup>
     * generation ancestor of the named, `toRevision` commit object, following only the first parents. If not specified, equivalent to `origin..toRevision`.
     */
    readonly fromRevision?: number | string;

}

// TODO is this the right place for this? - Nigel
// and range is SCM specific???
export interface HistoryWidgetOptions {
    /**
     * The Git revision range that will be used when calculating the diff.
     */
    readonly range?: Range;

    /**
     * The URI of the resource in the repository to get the diff. Can be an individual file or a directory.
     */
    readonly uri?: string;

    /**
     * Limits the number of commits. Also known as `-n` or `--number. If not specified, or not a positive integer, then will be ignored, and the returning list
     * of commits will not be limited.
     */
    readonly maxCount?: number;
}

export interface ScmResourceGroup extends Disposable {
    readonly id: string;
    readonly label: string;
    readonly resources: ScmResource[];
    readonly hideWhenEmpty?: boolean;

    readonly provider: ScmProvider;
}

export interface ScmResource {
    /** The uri of the underlying resource inside the workspace. */
    readonly sourceUri: URI;
    readonly decorations?: ScmResourceDecorations;
    open(): Promise<void>;

    readonly group: ScmResourceGroup;
}

export interface ScmResourceDecorations {
    icon?: string;
    tooltip?: string;
    source?: string;
    letter?: string;
    color?: string;
}

export interface ScmCommand {
    title: string;
    tooltip?: string;
    command?: string;
}

export interface ScmCommit {
    id: string;  // eg Git sha or Mercurial revision number
    commitDetailUri: URI;
    summary: string;
    messageBody?: string;
    authorName: string;
    authorEmail: string;
    /**
     * The date of the commit in ISO format.
     */
    authorTimestamp: string;
    authorDateRelative: string;
    fileChanges: ScmFileChange[];
}

export interface ScmFileChange {
    uri: string;
    getCaption(): string;
    getStatusCaption(): string;
    getStatusCaptionAsThoughStaged(): string;
    getStatusAbbreviation(): string;
    getClassNameForStatus(): string;
    getUriToOpen(): URI;
}

export interface ScmAmendSupport {
    getInitialAmendingCommits(amendingHeadCommitSha: string, latestCommitSha: string): Promise<ScmCommit[]>
    getMessage(commit: string): Promise<string>;
    reset(commit: string): Promise<void>;
    getLastCommit(): Promise<ScmCommit | undefined>;
}
