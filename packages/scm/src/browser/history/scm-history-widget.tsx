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

import { injectable, inject, postConstruct } from 'inversify';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { OpenerService, open, StatefulWidget, SELECTED_CLASS, WidgetManager, ApplicationShell } from '@theia/core/lib/browser';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { Message } from '@phosphor/messaging';
import { AutoSizer, List, ListRowRenderer, ListRowProps, InfiniteLoader, IndexRange, ScrollParams, CellMeasurerCache, CellMeasurer } from 'react-virtualized';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from '../scm-service';
import { SCM_HISTORY_ID, SCM_HISTORY_MAX_COUNT, SCM_HISTORY_LABEL } from './scm-history-contribution';
import { ScmCommit, ScmFileChange, HistoryWidgetOptions } from '../scm-provider';
import { FileSystem } from '@theia/filesystem/lib/common';
import { ScmAvatarService } from '../scm-avatar-service';
import { ScmNavigableListWidget } from '../scm-navigable-list-widget';
import * as React from 'react';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';

export const ScmHistorySupport = Symbol('scm-history-support');
export interface ScmHistorySupport {
    getCommitHistory(options?: HistoryWidgetOptions): Promise<ScmCommit[] | Error>;
}

export interface ScmCommitNode {
    commitDetails: ScmCommit;
    authorAvatar: string;
    fileChangeNodes?: ScmFileChangeNode[];
    expanded: boolean;
    selected: boolean;
}
export interface ScmFileChangeNode {
    readonly fileChange: ScmFileChange;
    readonly icon: string;
    readonly label: string;
    readonly description: string;
    readonly caption?: string;
    readonly extraIconClassName?: string;
    readonly commitSha?: string;
    selected?: boolean;
}

export namespace ScmCommitNode {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is ScmCommitNode {
        return !!node && 'commitDetails' in node && 'expanded' in node && 'selected' in node;
    }
}

export namespace ScmFileChangeNode {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is ScmFileChangeNode {
        return !!node && 'fileChange' in node && 'icon' in node && 'label' in node && 'description' in node;
    }
}

export type ScmHistoryListNode = (ScmCommitNode | ScmFileChangeNode);

@injectable()
export class ScmHistoryWidget extends ScmNavigableListWidget<ScmHistoryListNode> implements StatefulWidget {
    protected options: HistoryWidgetOptions;
    protected singleFileMode: boolean;
    private cancelIndicator: CancellationTokenSource;
    protected listView: GitHistoryList | undefined;
    protected hasMoreCommits: boolean;
    protected allowScrollToSelected: boolean;

    protected status: {
        state: 'loading',
    } | {
        state: 'ready',
        commits: ScmCommitNode[];
    } | {
        state: 'error',
        errorMessage: React.ReactNode
    };

    constructor(
        @inject(ScmService) protected readonly scmService: ScmService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
    ) {
        super();
        this.id = SCM_HISTORY_ID;
        this.scrollContainer = 'git-history-list-container';
        this.title.label = SCM_HISTORY_LABEL;
        this.title.caption = SCM_HISTORY_LABEL;
        this.title.iconClass = 'fa git-history-tab-icon';
        this.title.closable = true;
        this.addClass('theia-git');
        this.resetState();
        this.cancelIndicator = new CancellationTokenSource();
    }

    @postConstruct()
    protected init(): void {
        this.refresh();
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.refresh()));

        // from contribution

        // this.repositoryTracker.onGitEvent(event => {
        //     const { source, status, oldStatus } = event || { source: undefined, status: undefined, oldStatus: undefined };
        //     let isBranchChanged = false;
        //     let isHeaderChanged = false;
        //     if (oldStatus) {
        //         isBranchChanged = !!status && status.branch !== oldStatus.branch;
        //         isHeaderChanged = !!status && status.currentHead !== oldStatus.currentHead;
        //     }
        //     if (isBranchChanged || isHeaderChanged || oldStatus === undefined) {
        //         this.refresh(source && source.localUri);
        //     }
        // });

    }

    // private refresh(uri: string) {
    // const options: Git.Options.Log = {
    //     uri,
    //     maxCount: GIT_HISTORY_MAX_COUNT,
    //     shortSha: true
    // };
    // await this.setContent(options);
    // }

    protected readonly toDisposeOnRefresh = new DisposableCollection();
    protected refresh(): void {
        this.toDisposeOnRefresh.dispose();
        this.toDispose.push(this.toDisposeOnRefresh);
        const repository = this.scmService.selectedRepository;
        this.title.label = SCM_HISTORY_LABEL;
        if (repository) {
            this.title.label += ': ' + repository.provider.label;
        }
        const area = this.shell.getAreaFor(this);
        if (area === 'left') {
            this.shell.leftPanelHandler.refresh();
        } else if (area === 'right') {
            this.shell.rightPanelHandler.refresh();
        }
        this.update();

        if (repository) {

        // This code was in the originial git-history-contribution.
        // Do we need to do this, or just refresh on any change? - Nigel

        // import { GitRepositoryTracker } from '../git-repository-tracker';

        // @inject(GitRepositoryTracker)
        // protected readonly repositoryTracker: GitRepositoryTracker;

        // this.repositoryTracker.onGitEvent(event => {
        //     const { source, status, oldStatus } = event || { source: undefined, status: undefined, oldStatus: undefined };
        //     let isBranchChanged = false;
        //     let isHeaderChanged = false;
        //     if (oldStatus) {
        //         isBranchChanged = !!status && status.branch !== oldStatus.branch;
        //         isHeaderChanged = !!status && status.currentHead !== oldStatus.currentHead;
        //     }
        //     if (isBranchChanged || isHeaderChanged || oldStatus === undefined) {
        //         this.refreshWidget(source && source.localUri);
        //     }
        // });

            this.toDisposeOnRefresh.push(repository.onDidChange(() => this.update()));
            // render synchronously to avoid cursor jumping
            // see https://stackoverflow.com/questions/28922275/in-reactjs-why-does-setstate-behave-differently-when-called-synchronously/28922465#28922465
            this.toDisposeOnRefresh.push(repository.input.onDidChange(() => this.setContent(this.options)));
            // TODO test if we need this - Nigel
            // this.toDisposeOnRefresh.push(repository.input.onDidFocus(() => this.focusInput()));
        }
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addListNavigationKeyListeners(this.node);
        // tslint:disable-next-line:no-any
        this.addEventListener<any>(this.node, 'ps-scroll-y', (e: Event & { target: { scrollTop: number } }) => {
            if (this.listView && this.listView.list && this.listView.list.Grid) {
                const { scrollTop } = e.target;
                this.listView.list.Grid.handleScrollEvent({ scrollTop });
            }
        });
    }

    update(): void {
        if (this.listView && this.listView.list) {
            this.listView.list.forceUpdateGrid();
        }
        super.update();
    }

    async setContent(options?: HistoryWidgetOptions) {
        this.resetState(options);
        if (options && options.uri) {
            const fileStat = await this.fileSystem.getFileStat(options.uri);
            this.singleFileMode = !!fileStat && !fileStat.isDirectory;
        }
        await this.addCommits(options);
        this.onDataReady();
        if (this.scmNodes.length > 0) {
            this.selectNode(this.scmNodes[0]);
        }
    }

    protected resetState(options?: HistoryWidgetOptions) {
        this.options = options || {};
        this.status = { state: 'loading' };
        this.scmNodes = [];
        this.hasMoreCommits = true;
        this.allowScrollToSelected = true;
    }

    protected async addCommits(options?: HistoryWidgetOptions): Promise<void> {
        const repository = this.scmService.selectedRepository;

        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;

        if (repository && repository) {
            const historySupport = repository.input.get<ScmHistorySupport>(ScmHistorySupport);
            if (historySupport) {
                try {
                    const currentCommits = this.status.state === 'ready' ? this.status.commits : [];

                    let history = await historySupport.getCommitHistory(options);
                    if (token.isCancellationRequested || !this.hasMoreCommits) {
                        return;
                    }
                    if (!(history instanceof Error)) {
                        if (options && ((options.maxCount && history.length < options.maxCount) || (!options.maxCount && currentCommits))) {
                            this.hasMoreCommits = false;
                        }
                        if (currentCommits.length > 0) {
                            history = history.slice(1);
                        }
                        const commits: ScmCommitNode[] = [];
                        for (const commit of history) {
                            const avatarUrl = await this.avatarService.getAvatar(commit.authorEmail);
                            commits.push({
                                commitDetails: commit,
                                authorAvatar: avatarUrl,
                                expanded: false,
                                selected: false
                            });
                        }
                        currentCommits.push(...commits);
                        this.status = { state: 'ready', commits: currentCommits };
                    } else if (options && options.uri && repository) {
                        this.hasMoreCommits = false;
                        this.status = { state: 'error', errorMessage: <React.Fragment> {history.message}</React.Fragment> };
                    }

                } catch (error) {
                    this.status = { state: 'error', errorMessage: error.message };
                }

            } else {
                this.status = { state: 'error', errorMessage: <React.Fragment>History is not supported for {repository.provider.label} source control.</React.Fragment> };
            }
        } else {
            this.status = { state: 'error', errorMessage: <React.Fragment>There is no repository selected in this workspace.</React.Fragment> };
        }
    }

    protected async addOrRemoveFileChangeNodes(commit: ScmCommitNode) {
        const id = this.scmNodes.findIndex(node => node === commit);
        if (commit.expanded) {
            this.removeFileChangeNodes(commit, id);
        } else {
            await this.addFileChangeNodes(commit, id);
        }
        commit.expanded = !commit.expanded;
        this.update();
    }

    protected async addFileChangeNodes(commit: ScmCommitNode, scmNodesArrayIndex: number) {
        this.scmNodes.splice(scmNodesArrayIndex + 1, 0, ...await this.getFileChangeNodes(commit));
    }

    protected removeFileChangeNodes(commit: ScmCommitNode, scmNodesArrayIndex: number) {
        if (commit.fileChangeNodes) {
            this.scmNodes.splice(scmNodesArrayIndex + 1, commit.fileChangeNodes.length);
        }
    }

    protected async getFileChangeNodes(commitNode: ScmCommitNode): Promise<ScmFileChangeNode[]> {
        if (!commitNode.fileChangeNodes) {
            const fileChangeNodes: ScmFileChangeNode[] = [];
            await Promise.all(commitNode.commitDetails.fileChanges.map(async fileChange => {
                const fileChangeUri = new URI(fileChange.uri);
                const icon = await this.labelProvider.getIcon(fileChangeUri);
                const label = this.labelProvider.getName(fileChangeUri);
                const description = this.relativePath(fileChangeUri.parent);
                const caption = this.computeCaption(fileChange);
                fileChangeNodes.push({
                    fileChange, icon, label, description, caption, commitSha: commitNode.commitDetails.id
                });
            }));
            commitNode.fileChangeNodes = fileChangeNodes;
        }
        return commitNode.fileChangeNodes;
    }

    storeState(): object {
        const { options, singleFileMode } = this;
        return {
            options,
            singleFileMode
        };
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.options = oldState['options'];
        this.singleFileMode = oldState['singleFileMode'];
        this.setContent(this.options);
    }

    protected onDataReady(): void {
        if (this.status.state === 'ready') {
            this.scmNodes = this.status.commits;
        }
        this.update();
    }

    protected render(): React.ReactNode {
        let content: React.ReactNode;
        switch (this.status.state) {
            case 'ready':
                content = < React.Fragment >
                    {this.renderHistoryHeader()}
                    {this.renderCommitList()}
                </React.Fragment>;
                break;

            case 'error':
                let path: React.ReactNode = '';
                let reason: React.ReactNode;
                reason = this.status.errorMessage;
                if (this.options.uri) {
                    const relPathEncoded = this.relativePath(this.options.uri);
                    const relPath = relPathEncoded ? `${decodeURIComponent(relPathEncoded)}` : '';

                    const repo = this.scmService.selectedRepository;
                    const repoName = repo ? `${new URI(repo.provider.rootUri).displayName}` : '';

                    const relPathAndRepo = [relPath, repoName].filter(Boolean).join(' in ');
                    path = ` for ${relPathAndRepo}`;
                }
                content = <AlertMessage
                    type='WARNING'
                    header={`There is no Git history available${path}.`}>
                    {reason}
                </AlertMessage>;
                break;

            case 'loading':
                content = <div className='spinnerContainer'>
                    <span className='fa fa-spinner fa-pulse fa-3x fa-fw'></span>
                </div>;
                break;
        }
        return <div className='git-diff-container'>
            {content}
        </div>;
    }

    protected renderHistoryHeader(): React.ReactNode {
        if (this.options.uri) {
            const path = this.relativePath(this.options.uri);
            const fileName = path.split('/').pop();
            return <div className='diff-header'>
                {
                    this.renderHeaderRow({ name: 'repository', value: this.getRepositoryLabel(this.options.uri) })
                }
                {
                    this.renderHeaderRow({ name: 'file', value: fileName, title: path })
                }
                <div className='theia-header'>
                    Commits
                </div>
            </div>;
        }
    }

    protected renderCommitList(): React.ReactNode {
        const list = <div className='listContainer' id={this.scrollContainer}>
            <GitHistoryList
                ref={listView => this.listView = (listView || undefined)}
                rows={this.scmNodes}
                hasMoreRows={this.hasMoreCommits}
                indexOfSelected={this.allowScrollToSelected ? this.indexOfSelected : -1}
                handleScroll={this.handleScroll}
                loadMoreRows={this.loadMoreRows}
                renderCommit={this.renderCommit}
                renderFileChangeList={this.renderFileChangeList}
            ></GitHistoryList>
        </div>;
        this.allowScrollToSelected = true;
        return list;
    }

    protected readonly handleScroll = (info: ScrollParams) => this.doHandleScroll(info);
    protected doHandleScroll(info: ScrollParams) {
        this.node.scrollTop = info.scrollTop;
    }

    protected readonly loadMoreRows = (params: IndexRange) => this.doLoadMoreRows(params);
    // tslint:disable-next-line:no-any
    protected doLoadMoreRows(params: IndexRange): Promise<any> {
        let resolver: () => void;
        const promise = new Promise(resolve => resolver = resolve);
        const lastRow = this.scmNodes[params.stopIndex - 1];
        if (ScmCommitNode.is(lastRow)) {
            const toRevision = lastRow.commitDetails.id;
            this.addCommits({
                range: { toRevision },
                maxCount: SCM_HISTORY_MAX_COUNT,
                uri: this.options.uri
            }).then(() => {
                this.allowScrollToSelected = false;
                this.onDataReady();
                resolver();
            });
        }
        return promise;
    }

    protected readonly renderCommit = (commit: ScmCommitNode) => this.doRenderCommit(commit);
    protected doRenderCommit(commit: ScmCommitNode): React.ReactNode {
        let expansionToggleIcon = 'caret-right';
        if (commit && commit.expanded) {
            expansionToggleIcon = 'caret-down';
        }
        return <div
            className={`containerHead${commit.selected ? ' ' + SELECTED_CLASS : ''}`}
            onClick={
                e => {
                    if (commit.selected && !this.singleFileMode) {
                        this.addOrRemoveFileChangeNodes(commit);
                    } else {
                        this.selectNode(commit);
                    }
                    e.preventDefault();
                }
            }
            onDoubleClick={
                e => {
                    if (this.singleFileMode && commit.fileChangeNodes && commit.fileChangeNodes.length > 0) {
                        this.openFile(commit.fileChangeNodes[0].fileChange);
                    }
                    e.preventDefault();
                }
            }>
            <div className='headContent'><div className='image-container'>
                <img className='gravatar' src={commit.authorAvatar}></img>
            </div>
                <div className={`headLabelContainer${this.singleFileMode ? ' singleFileMode' : ''}`}>
                    <div className='headLabel noWrapInfo noselect'>
                        {commit.commitDetails.summary}
                    </div>
                    <div className='commitTime noWrapInfo noselect'>
                        {commit.commitDetails.authorDateRelative + ' by ' + commit.commitDetails.authorName}
                    </div>
                </div>
                <div className='fa fa-eye detailButton' onClick={() => this.openDetailWidget(commit)}></div>
                {
                    !this.singleFileMode ? <div className='expansionToggle noselect'>
                        <div className='toggle'>
                            <div className='number'>{commit.commitDetails.fileChanges.length.toString()}</div>
                            <div className={'icon fa fa-' + expansionToggleIcon}></div>
                        </div>
                    </div>
                        : ''
                }
            </div>
        </div >;
    }

    protected async openDetailWidget(commitNode: ScmCommitNode) {
        // TODO create options in one go - Nigel
        // const commitDetailWidgetOptions = this.detailOpenHandler.getCommitDetailWidgetOptions(commit);
        const commit = commitNode.commitDetails;
        const commitWithoutFileChanges = { ...commit, fileChanges: [] };
        const options = {
            commitDetails: commitWithoutFileChanges,
            authorAvatar: commitNode.authorAvatar, // Rename, as this is URL - Nigel
        };

        open(
            this.openerService, commit.commitDetailUri,
            { ...options, mode: 'reveal' });

    }

    protected readonly renderFileChangeList = (fileChange: ScmFileChangeNode) => this.doRenderFileChangeList(fileChange);
    protected doRenderFileChangeList(fileChange: ScmFileChangeNode): React.ReactNode {
        const fileChangeElement: React.ReactNode = this.renderGitItem(fileChange, fileChange.commitSha || '');
        return fileChangeElement;
    }

    protected renderGitItem(changeNode: ScmFileChangeNode, commitSha: string): React.ReactNode {
        return <div key={changeNode.fileChange.uri} className={`gitItem noselect${changeNode.selected ? ' ' + SELECTED_CLASS : ''}`}>
            <div
                title={changeNode.caption}
                className='noWrapInfo'
                onDoubleClick={() => {
                    this.openFile(changeNode.fileChange);
                }}
                onClick={() => {
                    this.selectNode(changeNode);
                }}>
                <span className={changeNode.icon + ' file-icon'}></span>
                <span className='name'>{changeNode.label + ' '}</span>
                <span className='path'>{changeNode.description}</span>
            </div>
            {
                changeNode.extraIconClassName ? <div
                    title={changeNode.caption}
                    className={changeNode.extraIconClassName}></div>
                    : ''
            }
            <div
                title={changeNode.caption}
                className={'status staged ' + changeNode.fileChange.getClassNameForStatus().toLowerCase()}>
                {changeNode.fileChange.getStatusCaptionAsThoughStaged().charAt(0)}
            </div>
        </div>;
    }

    protected navigateLeft(): void {
        const selected = this.getSelected();
        if (selected && this.status.state === 'ready') {
            if (ScmCommitNode.is(selected)) {
                const idx = this.status.commits.findIndex(c => c.commitDetails.id === selected.commitDetails.id);
                if (selected.expanded) {
                    this.addOrRemoveFileChangeNodes(selected);
                } else {
                    if (idx > 0) {
                        this.selectNode(this.status.commits[idx - 1]);
                    }
                }
            } else if (ScmFileChangeNode.is(selected)) {
                const idx = this.status.commits.findIndex(c => c.commitDetails.id === selected.commitSha);
                this.selectNode(this.status.commits[idx]);
            }
        }
        this.update();
    }

    protected navigateRight(): void {
        const selected = this.getSelected();
        if (selected) {
            if (ScmCommitNode.is(selected) && !selected.expanded && !this.singleFileMode) {
                this.addOrRemoveFileChangeNodes(selected);
            } else {
                this.selectNextNode();
            }
        }
        this.update();
    }

    protected async handleListEnter(): Promise<void> {
        const selected = this.getSelected();
        if (selected) {
            if (ScmCommitNode.is(selected)) {
                if (this.singleFileMode) {
                    const fileChangeNodes = await this.getFileChangeNodes(selected);
                    this.openFile(fileChangeNodes[0].fileChange);
                } else {
                    this.openDetailWidget(selected);
                }
            } else if (ScmFileChangeNode.is(selected)) {
                this.openFile(selected.fileChange);
            }
        }
        this.update();
    }

    protected openFile(change: ScmFileChange) {
        const uriToOpen = change.getUriToOpen();
        open(this.openerService, uriToOpen, { mode: 'reveal' });
    }
}

export namespace GitHistoryList {
    export interface Props {
        readonly rows: ScmHistoryListNode[]
        readonly indexOfSelected: number
        readonly hasMoreRows: boolean
        readonly handleScroll: (info: { clientHeight: number; scrollHeight: number; scrollTop: number }) => void
        // tslint:disable-next-line:no-any
        readonly loadMoreRows: (params: IndexRange) => Promise<any>
        readonly renderCommit: (commit: ScmCommitNode) => React.ReactNode
        readonly renderFileChangeList: (fileChange: ScmFileChangeNode) => React.ReactNode
    }
}
export class GitHistoryList extends React.Component<GitHistoryList.Props> {
    list: List | undefined;

    protected readonly checkIfRowIsLoaded = (opts: { index: number }) => this.doCheckIfRowIsLoaded(opts);
    protected doCheckIfRowIsLoaded(opts: { index: number }) {
        const row = this.props.rows[opts.index];
        return !!row;
    }

    render(): React.ReactNode {
        return <InfiniteLoader
            isRowLoaded={this.checkIfRowIsLoaded}
            loadMoreRows={this.props.loadMoreRows}
            rowCount={this.props.rows.length + 1}
            threshold={15}
        >
            {
                ({ onRowsRendered, registerChild }) => (
                    <AutoSizer>
                        {
                            ({ width, height }) => <List
                                className='commitList'
                                ref={list => {
                                    this.list = (list || undefined);
                                    registerChild(list);
                                }}
                                width={width}
                                height={height}
                                onRowsRendered={onRowsRendered}
                                rowRenderer={this.measureRowRenderer}
                                rowHeight={this.measureCache.rowHeight}
                                rowCount={this.props.hasMoreRows ? this.props.rows.length + 1 : this.props.rows.length}
                                tabIndex={-1}
                                onScroll={this.props.handleScroll}
                                scrollToIndex={this.props.indexOfSelected}
                                style={{
                                    overflowY: 'visible',
                                    overflowX: 'visible'
                                }}
                            />
                        }
                    </AutoSizer>
                )
            }
        </InfiniteLoader>;
    }

    componentWillUpdate(): void {
        this.measureCache.clearAll();
    }

    protected measureCache = new CellMeasurerCache();

    protected measureRowRenderer: ListRowRenderer = (params: ListRowProps) => {
        const { index, key, parent } = params;
        return (
            <CellMeasurer
                cache={this.measureCache}
                columnIndex={0}
                key={key}
                rowIndex={index}
                parent={parent}
            >
                {() => this.renderRow(params)}
            </CellMeasurer>
        );
    }

    protected renderRow: ListRowRenderer = ({ index, key, style }) => {
        if (this.checkIfRowIsLoaded({ index })) {
            const row = this.props.rows[index];
            if (ScmCommitNode.is(row)) {
                const head = this.props.renderCommit(row);
                return <div key={key} style={style} className={`commitListElement${index === 0 ? ' first' : ''}`} >
                    {head}
                </div>;
            } else if (ScmFileChangeNode.is(row)) {
                return <div key={key} style={style} className='fileChangeListElement'>
                    {this.props.renderFileChangeList(row)}
                </div>;
            }
        } else {
            return <div key={key} style={style} className={`commitListElement${index === 0 ? ' first' : ''}`} >
                <span className='fa fa-spinner fa-pulse fa-fw'></span>
            </div>;
        }
    }
}
