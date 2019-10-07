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

// import * as fs from 'fs-extra';
import * as Path from 'path';
import { injectable, inject, postConstruct } from 'inversify';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { ILogger } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import * as strings from '@theia/core/lib/common/strings';
import {
    Hg, HgUtils, Repository, WorkingDirectoryStatus, HgFileChange, HgFileStatus, Branch, Commit,
    CommitIdentity, HgResult, CommitWithChanges, HgFileBlame, CommitLine/*, HgError*/, Remote, StashEntry, BranchType
} from '../common';
import { HgRepositoryManager } from './hg-repository-manager';
import { HgLocator } from './hg-locator/hg-locator-protocol';
import { HgExecProvider } from './hg-exec-provider';
import { HgEnvProvider } from './env/hg-env-provider';
import { HgInit } from './init/hg-init';
import * as hg from './hg';
import { HGRepo, getHgRepo } from './hg';
import { FileSystem } from '@theia/filesystem/lib/common';  // remove me - Nigel
import * as fs from 'fs-extra';
import { Path as TheiaPath } from '@theia/core';
import { relative } from 'path';
import { DugiteHgPromptServer } from '../node/dugite-hg-prompt';
import { HgPrompt } from '../common/hg-prompt';

/**
 * Parsing and converting raw Hg output into Hg model instances.
 */
@injectable()
export abstract class OutputParser<T> {

    /** This is the `NUL` delimiter. Equals wih `%x00`. */
    static readonly LINE_DELIMITER = '\0';

    abstract parse(repositoryUri: string, raw: string, delimiter?: string): T[];
    abstract parse(repositoryUri: string, items: string[]): T[];
    abstract parse(repositoryUri: string, input: string | string[], delimiter?: string): T[];

    protected toUri(repositoryUri: string, pathSegment: string): string {
        return FileUri.create(Path.join(FileUri.fsPath(repositoryUri), pathSegment)).toString();
    }

    protected split(input: string | string[], delimiter: string): string[] {
        return (Array.isArray(input) ? input : input.split(delimiter)).filter(item => item && item.length > 0);
    }

}

/**
 * Status parser for converting raw Hg `--name-status` output into file change objects.
 */
@injectable()
export class NameStatusParser extends OutputParser<HgFileChange> {

    parse(repositoryUri: string, input: string | string[], delimiter: string = OutputParser.LINE_DELIMITER): HgFileChange[] {
        const items = this.split(input, delimiter);
        const changes: HgFileChange[] = [];
        let index = 0;
        while (index < items.length) {
            const rawStatus = items[index];
            const status = HgUtils.mapStatus(rawStatus);
            if (HgUtils.isSimilarityStatus(rawStatus)) {
                const uri = this.toUri(repositoryUri, items[index + 2]);
                const oldUri = this.toUri(repositoryUri, items[index + 1]);
                changes.push({
                    status,
                    uri,
                    oldUri
                });
                index = index + 3;
            } else {
                const uri = this.toUri(repositoryUri, items[index + 1]);
                changes.push({
                    status,
                    uri
                });
                index = index + 2;
            }
        }
        return changes;
    }

}

/**
 * Built-in Hg placeholders for tuning the `--format` option for `hg diff` or `hg log`.
 */
export enum CommitPlaceholders {
    HASH = '%H',
    SHORT_HASH = '%h',
    AUTHOR_EMAIL = '%aE',
    AUTHOR_NAME = '%aN',
    AUTHOR_DATE = '%aI',
    AUTHOR_RELATIVE_DATE = '%ar',
    SUBJECT = '%s',
    BODY = '%b'
}

@injectable()
export class HgBlameParser {

    async parse(fileUri: string, hgBlameOutput: string, commitBody: (sha: string) => Promise<string>): Promise<HgFileBlame | undefined> {
        if (!hgBlameOutput) {
            return undefined;
        }
        const parsedEntries = this.parseEntries(hgBlameOutput);
        return this.createFileBlame(fileUri, parsedEntries, commitBody);
    }

    protected parseEntries(rawOutput: string): HgBlameParser.Entry[] {
        const result: HgBlameParser.Entry[] = [];
        let current: HgBlameParser.Entry | undefined;
        for (const line of strings.split(rawOutput, '\n')) {
            if (current === undefined) {
                current = {};
            }
            if (HgBlameParser.pumpEntry(current, line)) {
                result.push(current);
                current = undefined;
            }
        }
        return result;
    }

    protected async createFileBlame(uri: string, blameEntries: HgBlameParser.Entry[], commitBody: (sha: string) => Promise<string>): Promise<HgFileBlame> {
        const commits = new Map<string, Commit>();
        const lines: CommitLine[] = [];
        for (const entry of blameEntries) {
            const sha = entry.sha!;
            let commit = commits.get(sha);
            if (!commit) {
                commit = <Commit>{
                    sha,
                    author: {
                        name: entry.author,
                        email: entry.authorMail,
                        timestamp: entry.authorTime,
                    },
                    summary: entry.summary,
                    body: await commitBody(sha)
                };
                commits.set(sha, commit);
            }
            const lineCount = entry.lineCount!;
            for (let lineOffset = 0; lineOffset < lineCount; lineOffset++) {
                const line = <CommitLine>{
                    sha,
                    line: entry.line! + lineOffset
                };
                lines[line.line] = line;
            }
        }
        const fileBlame = <HgFileBlame>{ uri, commits: Array.from(commits.values()), lines };
        return fileBlame;
    }

}

export namespace HgBlameParser {
    export interface Entry {
        fileName?: string,
        sha?: string,
        previousSha?: string,
        line?: number,
        lineCount?: number,
        author?: string,
        authorMail?: string,
        authorTime?: number,
        summary?: string,
    }

    export function isUncommittedSha(sha: string | undefined) {
        return (sha || '').startsWith('0000000');
    }

    export function pumpEntry(entry: Entry, outputLine: string): boolean {
        const parts = outputLine.split(' ');
        if (parts.length < 2) {
            return false;
        }
        const uncommitted = isUncommittedSha(entry.sha);
        const firstPart = parts[0];
        if (entry.sha === undefined) {
            entry.sha = firstPart;
            entry.line = parseInt(parts[2], 10) - 1; // to zero based
            entry.lineCount = parseInt(parts[3], 10);
        } else if (firstPart === 'author') {
            entry.author = uncommitted ? 'You' : parts.slice(1).join(' ');
        } else if (firstPart === 'author-mail') {
            const rest = parts.slice(1).join(' ');
            const matches = rest.match(/(<(.*)>)/);
            entry.authorMail = matches ? matches[2] : rest;
        } else if (firstPart === 'author-time') {
            entry.authorTime = parseInt(parts[1], 10);
        } else if (firstPart === 'summary') {
            let summary = parts.slice(1).join(' ');
            if (summary.startsWith('"') && summary.endsWith('"')) {
                summary = summary.substr(1, summary.length - 2);
            }
            entry.summary = uncommitted ? 'uncommitted' : summary;
        } else if (firstPart === 'previous') {
            entry.previousSha = parts[1];
        } else if (firstPart === 'filename') {
            entry.fileName = parts.slice(1).join(' ');
            return true;
        }
        return false;
    }

}

/**
 * `dugite-extra` based Hg implementation.
 */
@injectable()
export class DugiteHg implements Hg {

    protected readonly limit = 1000;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HgLocator)
    protected readonly locator: HgLocator;

    // Remove this as node-side - Nigel
    @inject(FileSystem) protected readonly filesystem: FileSystem;

    @inject(HgRepositoryManager)
    protected readonly manager: HgRepositoryManager;

    // Remove me... - Nigel (and the others)
    @inject(NameStatusParser)
    protected readonly nameStatusParser: NameStatusParser;

    @inject(HgBlameParser)
    protected readonly blameParser: HgBlameParser;

    @inject(HgExecProvider)
    protected readonly execProvider: HgExecProvider;

    @inject(HgEnvProvider)
    protected readonly envProvider: HgEnvProvider;

    @inject(HgInit)
    protected readonly hgInit: HgInit;

    @inject(DugiteHgPromptServer)
    protected readonly promptServer: DugiteHgPromptServer;

    protected ready: Deferred<void> = new Deferred();
    protected hgEnv: Deferred<Object> = new Deferred();

    @postConstruct()
    protected init(): void {
        this.envProvider.getEnv().then(env => this.hgEnv.resolve(env));
        this.hgInit.init()
            .catch(err => {
                this.logger.error('An error occurred during the Hg initialization.', err);
                this.ready.resolve();
            })
            .then(() => this.ready.resolve());
    }

    dispose(): void {
        this.locator.dispose();
        this.execProvider.dispose();
        this.hgInit.dispose();
    }

    async clone(remoteUrl: string, options: Hg.Options.Clone): Promise<Repository> {
        await this.ready.promise;
        const localPath = FileUri.fsPath(options.localUri);
        await hg.clone(this.hgInit, remoteUrl, localPath, []);
        const repository = { localUri: options.localUri };
        await this.addHgExtensions(repository);
        return repository;
    }

    private async addHgExtensions(repository: Repository): Promise<void> {
        const fileUri = `${repository.localUri}/.hg/hgrc`;
        const filePath = FileUri.fsPath(fileUri);
        if (fs.existsSync(filePath)) {
            const fileContent = await fs.readFile(filePath, 'utf-8');

            const lines = fileContent.split(/\r\n|\n|\r/);

            // TODO finish me (eg what if there are extensions but not the ones we want) - Nigel
            if (!lines.some(line => line === '[extensions]')) {
                lines.push('[extensions]');
                lines.push('strip =');
            }

            const output = lines.reduce((lines1, lines2) => lines1 + '\n' + lines2);
            await fs.writeFile(filePath, output, { encoding: 'utf-8' });
        } else {
            const lines = ['[extensions]', 'strip ='];

            const newContent: string = lines.join('\n');
            await fs.writeFile(filePath, newContent, { encoding: 'utf-8' });
        }
    }

    async repositories(workspaceRootUri: string, options: Hg.Options.Repositories): Promise<Repository[]> {
        const dir = await this.filesystem.getFileStat(workspaceRootUri);
        if (!dir || !dir.children) {
            return Promise.reject(new Error('An error occurred when getting children of directory.'));
        }

        const hgRepositories = dir.children
            .filter(f => f.isDirectory)
            .map(f => this.isRepository(new TheiaPath(f.uri)).then(e => ({ f, e })));

        const exists = await Promise.all(hgRepositories);

        const result = exists.filter(pair => pair.e)
            .map(pair => ({ localUri: pair.f.uri }));

        if (options.maxCount && result.length > options.maxCount) {
            return result.slice(0, options.maxCount);
        } else {
            return result;
        }
    }

    /**
     * Returns true if the given path points to the root of a Mercurial repository.
     * @param directoryPath
     */
    public isRepository(directoryPath: TheiaPath): Promise<boolean> {
        return this.filesystem.exists(directoryPath.join('.hg').toString());
    }

    async status(repository: Repository): Promise<WorkingDirectoryStatus>;
    async status(repository: Repository, options: Hg.Options.Status): Promise<HgFileChange[]>;
    async status(repository: Repository, options?: Hg.Options.Status): Promise<WorkingDirectoryStatus | HgFileChange[]> {
        await this.ready.promise;
        const repo = await this.getHgRepo(repository);

        const args = ['status'];
        if (options) {
            args.push('--rev', options.range.fromRevision, '--rev', options.range.toRevision);
            if (options.uri) {
                args.push(FileUri.fsPath(options.uri));
            }
        }

        const outputChunks = await repo.runCommand(args);

        // tslint:disable:no-console
        console.debug(outputChunks.join('\n'));

        const changes: HgFileChange[] = [];
        let status: HgFileStatus | undefined;
        outputChunks.forEach(chunk => {
            if (chunk === 'M ') {
                status = HgFileStatus.Modified;
            } else if (chunk === '! ') {
                status = HgFileStatus.Deleted;
            } else if (chunk === 'A ') {
                status = HgFileStatus.New;
            } else if (chunk === '? ') {
                status = HgFileStatus.Untracked;
            } else {
                if (status === undefined) {
                    throw new Error('Parse error');
                }
                const name = chunk.slice(0, chunk.length - 1); // remove trailing newline
                const uri = `${repository.localUri}/${name}`;
                const change: HgFileChange = {
                    uri,
                    status,
                };
                changes.push(change);
            }
        });

        if (options) {
            return changes;
        } else {
            const currentHead: string = await this.getCurrentRevisionId(repo);

            const result = {
                currentHead,
                changes,
                exists: true
            };
            return result;
        }
    }

    private async getCurrentRevisionId(repository: HGRepo): Promise<string> {
        const outputChunks = await repository.runCommand(['id', '-i']);
        const output = outputChunks[0];

        // The output will end with a newline and may have a '+' before that
        // (the '+' indicates there are uncommitted changes)
        return output.slice(0, 12);
    }

    // TODO remove me - Nigel
    async add(repository: Repository, uris: string[]): Promise<void> {
        await this.ready.promise;

        const paths = uris.map(uri => FileUri.fsPath(uri));
        await this.runCommand(repository, ['add', ...paths]);
    }

    protected async runCommand(repository: Repository, args: string | string[], responseProvider?: (promptKey: string) => Promise<string>): Promise<string[]> {
        const hgRepo = await this.getHgRepo(repository);
        return hgRepo.runCommand(args, responseProvider);

    }

    protected async getHgRepo(repository: Repository): Promise<HGRepo> {
        return getHgRepo(this.hgInit, repository.localUri);
    }

    async forget(repository: Repository, uris: string[], options?: Hg.Options.Forget): Promise<void> {
        await this.ready.promise;
        const paths = uris.map(uri => FileUri.fsPath(uri));
        await this.runCommand(repository, ['forget', ...paths]);
    }

    async branch(repository: Repository, options: { type: 'current' }): Promise<Branch | undefined>;
    async branch(repository: Repository, options: { type: 'local' | 'remote' | 'all' }): Promise<Branch[]>;
    async branch(repository: Repository, options: Hg.Options.BranchCommand.Create | Hg.Options.BranchCommand.Rename | Hg.Options.BranchCommand.Delete): Promise<void>;
    // tslint:disable-next-line:no-any
    async branch(repository: any, options: any): Promise<void | undefined | Branch | Branch[]> {
        await this.ready.promise;
        const repo = await this.getHgRepo(repository);

        const output = await repo.runCommand(['branches']);

        const branches: Branch[] = [];
        let i = 0;
        do {
            const name = output[i++];
            const revisionId = output[i++].trim();
            i += 1;
            // const newLine = output[i++].body;
            const author = {
                name: 'unknown',
                email: 'unknown',
                timestamp: 0
            } as CommitIdentity;
            const tip = {
                sha: revisionId,
                summary: 'Mercurial commit',
                author
            } as Commit;
            const branch = {
                name,
                type: BranchType.Local,
                tip,
                nameWithoutRemote: name
            } as Branch;
            branches.push(branch);
        } while (i < output.length);

        return branches;
    }

    async checkout(repository: Repository, options: Hg.Options.Checkout.CheckoutBranch | Hg.Options.Checkout.WorkingTreeFile): Promise<void> {
        await this.ready.promise;
        const repo = await this.getHgRepo(repository);

        if (HgUtils.isBranchCheckout(options)) {
            await repo.runCommand(['checkout', options.branch]);
        } else {
            return Promise.reject(new Error('Mbed Studio does not provide support for checkout of a working tree of a Mercurial project.'));
        }
    }

    async commit(repository: Repository, message?: string, options?: Hg.Options.Commit): Promise<void> {
        // TODO support amend, as that is in the UI - Nigel

        await this.ready.promise;
        const args = ['commit'];
        if (message) {
            args.push('-m');
            args.push(message);
        }
        if (options) {
            if (options.secret) {
                args.push('--secret');
            }
        }
        await this.runCommand(repository, args);
    }

    async fetch(repository: Repository, options?: Hg.Options.Fetch): Promise<void> {
        await this.ready.promise;
        this.fail(repository, 'Mbed Studio does not provide support for "fetch" in a Mercurial project.');
    }

    async push(repository: Repository, { remote, localBranch, remoteBranch, setUpstream, force }: Hg.Options.Push = {}): Promise<void> {
        await this.ready.promise;

        // Get the remote name in case we need it for interactive prompts
        const remotes = await this.paths(repository, { name: (remote || 'default') });
        if (remotes.length !== 1) {
            throw new Error(`Expected one remote but got ${remotes.length}.`);
        }
        const remoteUrl = remotes[0].url;

        const args = ['push'];
        if (remote) {
            args.push(remote);  // 'dest' in Hg terminology
        }

        await this.runCommand(repository, args, promptKey => this.responseProvider(promptKey, remoteUrl));
    }

    protected async responseProvider(promptKey: string, remoteDescription: string): Promise<string> {
        const responses: { [s: string]: string; } = {
        };

        if (promptKey in responses) {
            return responses[promptKey];
        }
        const value = await this.prompt(remoteDescription, promptKey);
        return value;
    }

    protected async prompt(requestingHost: string, request: string): Promise<string> {
        try {
            const answer = await this.promptServer.ask({
                isPassword: /password/i.test(request),
                text: request,
                details: `Hg: ${requestingHost} (Press 'Enter' to confirm or 'Escape' to cancel.)`
            });
            if (HgPrompt.Success.is(answer) && typeof answer.result === 'string') {
                return answer.result;
            } else if (HgPrompt.Cancel.is(answer)) {
                return '';
            } else if (HgPrompt.Failure.is(answer)) {
                const { error } = answer;
                throw error;
            }
            throw new Error('Unexpected answer.'); // Do not ever log the `answer`, it might contain the password.
        } catch (e) {
            this.logger.error(`An unexpected error occurred when requesting ${request} by ${requestingHost}.`, e);
            return '';
        }
    }

    async pull(repository: Repository, { remote, branch, rebase }: Hg.Options.Pull = {}): Promise<void> {
        await this.ready.promise;

        const args = ['pull'];
        if (remote) {
            args.push(remote);  // 'source' in Hg terminology
        }
        await this.runCommand(repository, args);
    }

    /**
     * This is a synthetic command as there is no single hg command that is the equivalent of a Git reset.
     *
     */
    async reset(repository: Repository, options: Hg.Options.Reset): Promise<void> {
        await this.ready.promise;

        // If the working tree is dirty then we commit the changes first.
        // This enables us to maintain the state of the working tree by reverting to this
        // new commit afterwards.
        const workingDirectoryStatus = await this.status(repository);
        const changesToCommit = workingDirectoryStatus.changes.some(change => change.status !== HgFileStatus.Untracked);
        if (changesToCommit) {
            await this.commit(repository, 'working directory', { secret: true });
        }

        const currentCommit = await this.parent(repository);

        await this.update(repository, { revision: options.revision });
        await this.revert(repository, { revision: currentCommit });

        // Remove our temporary commit, now that we have restored the working directory to the
        // state that was saved in the commit.  Note that we cannot use 'uncommit' because Mercurial
        // seems to change the commit from 'secret' to 'public' when updating and reverting.
        if (changesToCommit) {
            await this.runCommand(repository, ['strip', currentCommit]);
        }
    }

    async merge(repository: Repository, options: Hg.Options.Merge): Promise<void> {
        await this.ready.promise;
        this.fail(repository, 'Mbed Studio does not provide support for "merge" in a Mercurial project.');
    }

    async show(repository: Repository, uri: string, options?: Hg.Options.Show): Promise<string> {
        await this.ready.promise;
        const repo = await this.getHgRepo(repository);

        const path = FileUri.fsPath(uri);

        const localPath = FileUri.fsPath(path);

        let revision = 'tip';
        if (options && options.commitish) {
            revision = options.commitish;
        }
        if (revision === 'tip') {
            revision = '.';
        }

        const output = await repo.runCommand(['cat', localPath, '-r', revision]);

        let content = '';
        let i = 0;
        do {
            content += output[i];
        } while (++i < output.length);

        return content;
    }

    async stash(repository: Repository, options?: Readonly<{ action?: 'push', message?: string }>): Promise<void>;
    async stash(repository: Repository, options: Readonly<{ action: 'list' }>): Promise<StashEntry[]>;
    async stash(repository: Repository, options: Readonly<{ action: 'clear' }>): Promise<void>;
    async stash(repository: Repository, options: Readonly<{ action: 'apply' | 'pop' | 'drop', id?: string }>): Promise<void>;
    async stash(repository: Repository, options?: Hg.Options.Stash): Promise<StashEntry[] | void> {
        this.fail(repository, 'Mbed Studio does not provide support for "stash" in a Mercurial project.');
    }

    async paths(repository: Repository, options?: Hg.Options.Paths): Promise<Remote[]> {
        await this.ready.promise;
        const args = ['paths'];
        if (options && options.name) {
            args.push(options.name);
        }
        const outputChunks = await this.runCommand(repository, args);
        const results = [];
        if (options && options.name) {
            const remoteName = options.name;
            const url = outputChunks[0];
            results.push({ remoteName, url });
        } else {
            const regex = /^(.*?)\s*=\s*$/;
            let i = 0;
            while (i < outputChunks.length) {
                const match = regex.exec(outputChunks[i]);
                if (!match) {
                    throw new Error('bad match');
                }
                const remoteName = match[1];
                const url = outputChunks[i + 1];
                results.push({ remoteName, url });

                i += 2;
            }
        }
        return results;
    }

    async exec(repository: Repository, args: string[], options?: Hg.Options.Execution): Promise<HgResult> {
        await this.ready.promise;
        const repo = await this.getHgRepo(repository);

        switch (args[0]) {
            case 'name-rev': {
                const revisionId = args[1];

                const outputChunks = await repo.runCommand(['log', '-r', revisionId, '--template', branchAndTagTemplate]);

                for (const output of outputChunks) {
                    const commitLine = JSON.parse(output);

                    if (commitLine.tags) {
                        return {
                            stdout: `${revisionId} ${commitLine.tags}\n`,
                            stderr: '',
                            exitCode: 0
                        } as HgResult;
                    } else if (commitLine.branch) {
                        return {
                            stdout: `${revisionId} ${commitLine.branch}\n`,
                            stderr: '',
                            exitCode: 0
                        } as HgResult;
                    } else {
                        // Emulate the message we would have got from Git
                        return {
                            stdout: `Could not get sha1 for ${revisionId}. Skipping.\n`,
                            stderr: '',
                            exitCode: 0
                        } as HgResult;
                    }
                }

                return {
                    stdout: '',
                    stderr: 'no output',
                    exitCode: 1
                } as HgResult;
            }

            // TODO check if we should return HgResult for all - Nigel
            // case 'reset':
            //     if (args.length === 3 && args[1] === 'HEAD~' && args[2] === '--soft') {
            //         // This form is used when the 'Undo' button is pressed in Theia's Git view

            //         try {
            //             const rollbackResults = await repo.runCommand(['commit', '--amend', '-m', 'Test Commit']);
            //             return {
            //                 stdout: rollbackResults.outputChunks[0],
            //                 stderr: '',
            //                 exitCode: rollbackResults.resultCode
            //             } as HgResult;
            //         } catch (e) {
            //             return {
            //                 stdout: e.toString(),
            //                 stderr: e.toString(),
            //                 exitCode: 255
            //             } as HgResult;
            //         }
            //     }
            //     return Promise.reject(this.mercurialWriteError(repository));

            default:
                return Promise.reject(new Error(
                    'This operation is not supported for Mercurial repositories. ' +
                    `You may use command-line tools or other tools to manage the Mercurial repository at ${FileUri.fsPath(repository.localUri)}.`));
        }
    }

    private extractFiles(files: string) {
        // TODO investigate what Mercurial gives us back if there is a space in the file name.
        // This code probably won't cope.
        return files === '' ? [] : files.split(' ');
    }

    async log(repository: Repository, options?: Hg.Options.Log): Promise<CommitWithChanges[]> {
        await this.ready.promise;

        // TODO check if following comment is something we need to take care of (from Git)
        // If remaining commits should be calculated by the backend, then run `hg rev-list --count ${fromRevision | HEAD~fromRevision}`.
        // How to use `mailmap` to map authors: https://www.kernel.org/pub/software/scm/hg/docs/hg-shortlog.html.

        const repo = await this.getHgRepo(repository);

        let args: string[] = ['log', '--template', logTemplate];
        if (options !== undefined) {
            if (options.maxCount !== undefined) {
                args = args.concat(['--limit', options.maxCount.toString()]);
            }
            // TODO check if this is required - Nigel
            // if (options.gitExtendedDiffs) {
            //     args = args.concat(['--git']);
            // }
            if (options.fullCommitMessages) {
                args = args.concat(['--verbose']);
            }
            if (options.revision) {
                args.push('-r');
                args.push(options.revision);
            }
        }

        const outputChunks = await repo.runCommand(args);

        return outputChunks.map(chunk => {
            /*
             * Note that 'desc' is not output in json format.  This is because the 'desc'
             * field may contain characters that would need to be escaped to make valid parsable
             * json, yet there is no way to get Mercurial to do this escaping, nor is there any easy
             * way for us to modify the text to do the escaping.  Therefore the template puts
             * the 'desc' field at the end with a separator that is not likely to appear in
             * the data.
             */
            const lines = chunk.split('end-json-start-desc');
            const commitLine = JSON.parse(lines[0]);

            const timestamp: number = commitLine.timestamp.split(' ')[0];

            const addedFiles = this.extractFiles(commitLine.added);
            const modifiedFiles = this.extractFiles(commitLine.modified);
            const deletedFiles = this.extractFiles(commitLine.deleted);

            const summary: string = lines[1];

            const fileChanges: HgFileChange[] = [];
            for (const filename of addedFiles) {
                fileChanges.push({ uri: `${repository.localUri}/${filename}`, status: HgFileStatus.New });
            }
            for (const filename of modifiedFiles) {
                fileChanges.push({ uri: `${repository.localUri}/${filename}`, status: HgFileStatus.Modified });
            }
            for (const filename of deletedFiles) {
                fileChanges.push({ uri: `${repository.localUri}/${filename}`, status: HgFileStatus.Deleted });
            }

            const sha = commitLine.node;
            const name = commitLine.author;
            const authorDateRelative = this.getAuthorDateRelative(timestamp);

            const author: CommitIdentity = { name, email: 'unknown', timestamp };
            return { sha, summary, author, authorDateRelative, fileChanges };
        });
    }

    async parent(repository: Repository): Promise<string> {
        await this.ready.promise;

        const repo = await this.getHgRepo(repository);

        const args: string[] = ['parent', '--template', parentTemplate];
        const outputChunks = await repo.runCommand(args);
        if (outputChunks.length !== 1) {
            throw new Error(`Expected a single parent to the working tree, but got ${outputChunks.length}.`);
        }

        const commitLine = JSON.parse(outputChunks[0]);
        return commitLine.revision;
    }

    /**
     * This is implemented by Git and returned by Dugite.  For Mercurial, we need
     * to implement this ourselves.  This is close enough to providing the same as
     * the Git implementation.
     *
     * @param timestamp the timestamp of the Mercurial commit
     */
    private getAuthorDateRelative(timestamp: number): string {
        const now = new Date().getTime();
        const seconds = Math.round(now / 1000 - timestamp);
        if (seconds < 60) {
            return `${seconds} seconds ago`;
        }
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) {
            return `${minutes} minutes ago`;
        }
        const hours = Math.round(minutes / 60);
        if (hours < 24) {
            return `${hours} hours ago`;
        }
        if (hours === 24) {
            return 'one day ago';
        }
        if (hours < 48) {
            return `one day, ${hours - 24} hours ago`;
        }
        const days = Math.round(hours / 24);
        if (days <= 8) {
            return `${days} days ago`;
        }
        if (days < 14) {
            return `one week, ${days - 7} days ago`;
        }
        const weeks = Math.round(days / 7);
        if (weeks < 8) {
            return `${weeks} weeks ago`;
        }
        const months = Math.round(days / 30.2);
        if (months < 12) {
            return `${months} months ago`;
        }
        if (months === 12) {
            return 'one year ago';
        }
        if (months === 13) {
            return 'one year, one month ago';
        }
        if (months < 24) {
            return `one year, ${months - 12} months ago`;
        }
        const years = Math.round(days / 365.25);
        return `${years} years ago`;
    }

    async revParse(repository: Repository, options: Hg.Options.RevParse): Promise<string | undefined> {
        return Promise.reject(new Error(
            'Mbed Studio does not provide support for "revParse" in a Mercurial project.'));
    }

    async blame(repository: Repository, uri: string, options?: Hg.Options.Blame): Promise<HgFileBlame | undefined> {
        await this.ready.promise;
        // const args = ['blame', '--root', '--incremental'];
        // const file = Path.relative(this.getFsPath(repository), this.getFsPath(uri));
        // const repositoryPath = this.getFsPath(repository);
        // const [exec, env] = await Promise.all([this.execProvider.exec(), this.hgEnv.promise]);
        // const status = await getStatus(repositoryPath, true, this.limit, { exec, env });
        // const isUncommitted = (change: DugiteFileChange) => change.status === AppFileStatus.New && change.path === file;
        // const changes = status.workingDirectory.files;
        // if (changes.some(isUncommitted)) {
        //     return undefined;
        // }
        // const stdin = options ? options.content : undefined;
        // if (stdin) {
        //     args.push('--contents', '-');
        // }
        // const hgResult = await this.exec(repository, [...args, '--', file], { stdin });
        // const output = hgResult.stdout.trim();
        // const commitBodyReader = async (sha: string) => {
        //     if (HgBlameParser.isUncommittedSha(sha)) {
        //         return '';
        //     }
        //     const revResult = await this.exec(repository, ['rev-list', '--format=%B', '--max-count=1', sha]);
        //     const revOutput = revResult.stdout;
        //     let nl = revOutput.indexOf('\n');
        //     if (nl > 0) {
        //         nl = revOutput.indexOf('\n', nl + 1);
        //     }
        //     return revOutput.substr(Math.max(0, nl)).trim();
        // };
        // const blame = await this.blameParser.parse(uri, output, commitBodyReader);
        // return blame;
        return Promise.reject(new Error(
            'Mbed Studio does not provide support for "blame" in a Mercurial project.'));
    }

    // tslint:disable-next-line:no-any
    async lsFiles(repository: Repository, uri: string, options?: Hg.Options.LsFiles): Promise<any> {
        await this.ready.promise;
        if (options && options.errorUnmatch) {
            const repo = await this.getHgRepo(repository);
            const file = relative(FileUri.fsPath(repository.localUri), FileUri.fsPath(uri));
            const args = ['status', file];

            const outputChunks = await repo.runCommand(args);

            // If nothing comes back then the file is tracked and unmodified.
            if (outputChunks.length === 0) {
                return Promise.resolve(true);
            } else {
                const firstLine = outputChunks[0];
                return Promise.resolve(!firstLine.startsWith('?'));
            }
        } else {
            return Promise.reject(this.mercurialWriteError(repository));
        }
    }

    /**
     * https://www.selenic.com/mercurial/hg.1.html#revert
     */
    async revert(repository: Repository, options: Hg.Options.Revert): Promise<void> {
        await this.ready.promise;
        const args = ['revert', '--all', '-r', options.revision];
        await this.runCommand(repository, args);
    }

    /**
     * https://www.selenic.com/mercurial/hg.1.html#update
     */
    async update(repository: Repository, options?: Hg.Options.Update): Promise<void> {
        await this.ready.promise;
        const args = ['update'];
        if (options) {
            if (options.clean) {
                args.push('--clean');
            }
            if (options.check) {
                args.push('--check');
            }
            if (options.revision) {
                args.push('-r');
                args.push(options.revision);
            }
        }

        await this.runCommand(repository, args);
    }

    private mercurialWriteError(repository: Repository): Error {
        const repoPath = FileUri.fsPath(repository.localUri);
        return new Error(
            'Mbed Studio does not provide write-access to Mercurial repositories. ' +
            `You may use command-line tools or other tools to manage the Mercurial repository at ${repoPath}.`);
    }

    // TODO: akitta what about symlinks? What if the workspace root is a symlink?
    // Maybe, we should use `--show-cdup` here instead of `--show-toplevel` because `show-toplevel` dereferences symlinks.
    // private async resolveContainingPath(repositoryPath: string): Promise<string | undefined> {
    //     await this.ready.promise;
    //     // Do not log an error if we are not contained in a Hg repository. Treat exit code 128 as a success too.
    //     const [exec, env] = await Promise.all([this.execProvider.exec(), this.hgEnv.promise]);
    //     const options = { successExitCodes: new Set([0, 128]), exec, env };
    //     const result = await git(['rev-parse', '--show-toplevel'], repositoryPath, 'rev-parse', options);
    //     const out = result.stdout;
    //     if (out && out.length !== 0) {
    //         try {
    //             return fs.realpathSync(out.trim());
    //         } catch (e) {
    //             this.logger.error(e);
    //             return undefined;
    //         }
    //     }
    //     return undefined;
    // }

    // private async getRemotes(repositoryPath: string): Promise<Remote[]> {
    //     await this.ready.promise;
    //     const [exec, env] = await Promise.all([this.execProvider.exec(), this.hgEnv.promise]);
    //     const result = await git(['remote', '-v'], repositoryPath, 'remote', { exec, env });
    //     const out = result.stdout || '';
    //     const results = out.trim().match(/\S+/g);
    //     if (results) {
    //         const values: Remote[] = [];
    //         for (let i = 0; i < results.length; i += 6) {
    //             values.push({ name: results[i], fetch: results[i + 1], push: results[i + 4] });
    //         }
    //         return values;
    //     } else {
    //     return [];
    //     }
    // }

    // private async getDefaultRemote(repositoryPath: string, remote?: string): Promise<string | undefined> {
    //     if (remote === undefined) {
    //         const remotes = await this.getRemotes(repositoryPath);
    //         const name = remotes.map(a => a.name);
    //         return name.shift();
    //     }
    //     return remote;
    // }

    // private async getCurrentBranch(repositoryPath: string, localBranch?: string): Promise<Branch | string> {
    //     await this.ready.promise;
    //     if (localBranch !== undefined) {
    //         return localBranch;
    //     }
    //     const [exec, env] = await Promise.all([this.execProvider.exec(), this.hgEnv.promise]);
    //     const branch = await listBranch(repositoryPath, 'current', { exec, env });
    //     if (branch === undefined) {
    //         return this.fail(repositoryPath, 'No current branch.');
    //     }
    //     if (Array.isArray(branch)) {
    //         return this.fail(repositoryPath, `Implementation error. Listing branch with the 'current' flag must return with single value. Was: ${branch}`);
    //     }
    //     return this.mapBranch(branch);
    // }

    // private getResetMode(mode: 'hard' | 'soft' | 'mixed') {
    //     switch (mode) {
    //         case 'hard': return GitResetMode.Hard;
    //         case 'soft': return GitResetMode.Soft;
    //         case 'mixed': return GitResetMode.Mixed;
    //         default: throw new Error(`Unexpected Hg reset mode: ${mode}.`);
    //     }
    // }

    // private async mapBranch(toMap: DugiteBranch): Promise<Branch> {
    //     const tip = await this.mapTip(toMap.tip);
    //     return {
    //         name: toMap.name,
    //         nameWithoutRemote: toMap.nameWithoutRemote,
    //         remote: toMap.remote,
    //         type: toMap.type,
    //         upstream: toMap.upstream,
    //         upstreamWithoutRemote: toMap.upstreamWithoutRemote,
    //         tip
    //     };
    // }

    // private async mapTip(toMap: DugiteCommit): Promise<Commit> {
    //     const author = await this.mapCommitIdentity(toMap.author);
    //     return {
    //         author,
    //         body: toMap.body,
    //         parentSHAs: [...toMap.parentSHAs],
    //         sha: toMap.sha,
    //         summary: toMap.summary
    //     };
    // }

    // private async mapCommitIdentity(toMap: DugiteCommitIdentity): Promise<CommitIdentity> {
    //     return {
    //         timestamp: toMap.date.toISOString(),
    //         email: toMap.email,
    //         name: toMap.name,
    //     };
    // }

    // private mapRange(toMap: Hg.Options.Range | undefined): string {
    //     let range = 'tip';
    //     if (toMap) {
    //         if (typeof toMap.fromRevision === 'number') {
    //             const toRevision = toMap.toRevision || 'tip';
    //             range = `${toRevision}~${toMap.fromRevision}..${toRevision}`;
    //         } else if (typeof toMap.fromRevision === 'string') {
    //             range = `${toMap.fromRevision}${toMap.toRevision ? '..' + toMap.toRevision : ''}`;
    //         } else if (toMap.toRevision) {
    //             range = toMap.toRevision;
    //         }
    //     }
    //     return range;
    // }

    // private getFsPath(repository: Repository | string): string {
    //     const uri = typeof repository === 'string' ? repository : repository.localUri;
    //     return FileUri.fsPath(uri);
    // }

    private fail(repository: Repository | string, message?: string): never {
        const p = typeof repository === 'string' ? repository : repository.localUri;
        const m = message ? `${message} ` : '';
        throw new Error(`${m}[${p}]`);
    }

}

/**
 * This template outputs data in JSON format so the output from the log command is easily parsed.
 */
const branchAndTagTemplate: string =
    '\\{ "branch": "{branch}",\\n' +
    '  "tags": "{tags}"\n}';

/**
 * This template outputs data in JSON format so the output from the log command is easily parsed.
 */
const logTemplate: string =
    '\\{ "node": "{node}",\\n' +
    '  "author": "{author}",\\n' +
    '  "timestamp": "{date|hgdate}",\\n' +
    '  "added": "{file_adds}",\\n' +
    '  "modified": "{file_mods}",\\n' +
    '  "deleted": "{file_dels}"\n}' +
    'end-json-start-desc{desc}';

/**
 * This template outputs data in JSON format so the output from the 'parent' command is easily parsed.
 */
const parentTemplate: string =
    '\\{ "node": "{node}",\\n' +
    '  "revision": "{rev}"\n}';
