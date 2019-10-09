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

import { injectable, inject, postConstruct } from 'inversify';
import { Disposable, Event, Emitter, ILogger, DisposableCollection } from '@theia/core';
import { Git, Repository, WorkingDirectoryStatus, GitUtils } from '../common';
import { GitStatusChangeEvent } from '../common/git-watcher';
import { Deferred } from '@theia/core/lib/common/promise-util';

export const GitRepositoryWatcherFactory = Symbol('GitRepositoryWatcherFactory');
export type GitRepositoryWatcherFactory = (options: GitRepositoryWatcherOptions) => GitRepositoryWatcher;

@injectable()
export class GitRepositoryWatcherOptions {
    readonly repository: Repository;
}

@injectable()
export class GitRepositoryWatcher implements Disposable {

    protected readonly onGitStatusChangedEmitter = new Emitter<GitStatusChangeEvent>();
    readonly onGitStatusChanged: Event<GitStatusChangeEvent> = this.onGitStatusChangedEmitter.event;

    @inject(Git)
    protected readonly git: Git;

    protected readonly instanceId = Math.floor(Math.random() * 1000);
    protected trace(mark: string): void {
        console.log(`ZZZ Repository-Watcher(${this.instanceId}) ${mark} ${this.options.repository.localUri.split('/').pop()}`);
    }

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(GitRepositoryWatcherOptions)
    protected readonly options: GitRepositoryWatcherOptions;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.initWatcher());
    }

    watch(): void {
        this.trace('watch');
        if (this.state.watching) {
            console.debug('Repository watcher is already active.');
            return;
        }
        this.sync();
        this.updateWatcherState({ watching: true });
    }

    protected syncWorkPromises: Deferred<void>[] = [];
    sync(): Promise<void> {
        this.trace('sync');
        if (this.state.idle) {
            if (this.interruptIdle) {
                this.interruptIdle();
            }
        } else {
            this.skipNextIdle = true;
        }
        const result = new Deferred<void>();
        this.syncWorkPromises.push(result);
        return result.promise;
    }

    protected readonly toDispose = new DisposableCollection();
    dispose(): void {
        this.trace('dispose !!!');
        this.toDispose.dispose();
        if (this.state.idle) {
            if (this.interruptIdle) {
                this.interruptIdle();
            }
        }
    }

    protected status: WorkingDirectoryStatus | undefined;
    protected async syncStatus(): Promise<void> {
        try {
            const source = this.options.repository;
            const oldStatus = this.status;
            const newStatus = await this.git.status(source);
            this.trace(`syncStatus changes: ${!WorkingDirectoryStatus.equals(newStatus, oldStatus)}`);
            if (!WorkingDirectoryStatus.equals(newStatus, oldStatus)) {
                this.status = newStatus;
                this.onGitStatusChangedEmitter.fire({ source, status: newStatus, oldStatus });
            }
        } catch (error) {
            if (!GitUtils.isRepositoryDoesNotExistError(error)) {
                const { localUri } = this.options.repository;
                this.logger.error('Error occurred while synchronizing the status of the repository.', localUri, error);
            }
        }
    }

    protected readonly onWatcherStateChangedEmitter = new Emitter<GitRepositoryWatcher.StateChange>();
    protected readonly onWatcherStateChanged: Event<GitRepositoryWatcher.StateChange> = this.onWatcherStateChangedEmitter.event;
    protected state: GitRepositoryWatcher.State = {
        watching: false,
        idle: false
    };
    protected updateWatcherState(partialState: Partial<GitRepositoryWatcher.State>): void {
        const oldState = { ...this.state };
        const newState = { ...this.state, ...partialState };
        if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
            this.state = newState;
            this.onWatcherStateChangedEmitter.fire({ oldState, newState });
        }
    }
    protected initWatcher(): Disposable {
        const stateMachine = this.onWatcherStateChanged(({ oldState, newState }) => {
            if (oldState.watching === newState.watching) {
                if (!oldState.idle && newState.idle) {
                    this.idle().then(() => {
                        this.updateWatcherState({ idle: false });
                    });
                }
                if (oldState.idle && !newState.idle) {
                    this.work().then(() => {
                        this.updateWatcherState({ idle: true });
                    });
                }
            }
        });
        // move it!
        this.updateWatcherState({
            watching: false,
            idle: true
        });
        return stateMachine;
    }
    protected interruptIdle: (() => void) | undefined;
    protected skipNextIdle = false;
    protected idle(): Promise<void> {
        if (this.skipNextIdle) {
            this.skipNextIdle = false;
            return Promise.resolve();
        }
        const idleTimeout = this.state.watching ? 5000 : /* super long */ 1000 * 60 * 60 * 24;
        return new Promise(resolve => {
            const id = setTimeout(resolve, idleTimeout);
            this.interruptIdle = () => { clearTimeout(id); resolve(); };
        }).then(() => {
            this.interruptIdle = undefined;
        });
    }
    protected work(): Promise<void> {
        return this.syncStatus().then(() => {
            this.syncWorkPromises.splice(0, this.syncWorkPromises.length).forEach(d => d.resolve());
        });
    }

}
namespace GitRepositoryWatcher {
    export interface State {
        watching: boolean;
        idle: boolean;
    }
    export interface StateChange {
        oldState: State;
        newState: State;
    }
}
