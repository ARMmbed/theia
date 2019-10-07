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

import * as path from 'path';
import * as upath from 'upath';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import { expect } from 'chai';
import { Hg } from '../common/hg';
import { git as gitExec } from 'dugite-extra/lib/core/git';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { WorkingDirectoryStatus, Repository, HgUtils, HgFileStatus, HgFileChange } from '../common';
import { initRepository, createTestRepository } from 'dugite-extra/lib/command/test-helper';
import { createHg } from './test/binding-helper';

// tslint:disable:no-unused-expression
// tslint:disable:max-line-length

const track = temp.track();

describe('hg', async function () {

    this.timeout(10000);

    after(async () => {
        track.cleanupSync();
    });

    describe('repositories', async () => {

        it('should discover only first repository', async () => {

            const root = track.mkdirSync('discovery-test-1');
            fs.mkdirSync(path.join(root, 'A'));
            fs.mkdirSync(path.join(root, 'B'));
            fs.mkdirSync(path.join(root, 'C'));
            const hg = await createHg();
            await initRepository(path.join(root, 'A'));
            await initRepository(path.join(root, 'B'));
            await initRepository(path.join(root, 'C'));
            const workspaceRootUri = FileUri.create(root).toString();
            const repositories = await hg.repositories(workspaceRootUri, { maxCount: 1 });
            expect(repositories.length).to.deep.equal(1);

        });

        it('should discover all nested repositories', async () => {

            const root = track.mkdirSync('discovery-test-2');
            fs.mkdirSync(path.join(root, 'A'));
            fs.mkdirSync(path.join(root, 'B'));
            fs.mkdirSync(path.join(root, 'C'));
            const hg = await createHg();
            await initRepository(path.join(root, 'A'));
            await initRepository(path.join(root, 'B'));
            await initRepository(path.join(root, 'C'));
            const workspaceRootUri = FileUri.create(root).toString();
            const repositories = await hg.repositories(workspaceRootUri, {});
            expect(repositories.map(r => path.basename(FileUri.fsPath(r.localUri))).sort()).to.deep.equal(['A', 'B', 'C']);

        });

        it('should discover all nested repositories and the root repository which is at the workspace root', async () => {

            const root = track.mkdirSync('discovery-test-3');
            fs.mkdirSync(path.join(root, 'BASE'));
            fs.mkdirSync(path.join(root, 'BASE', 'A'));
            fs.mkdirSync(path.join(root, 'BASE', 'B'));
            fs.mkdirSync(path.join(root, 'BASE', 'C'));
            const hg = await createHg();
            await initRepository(path.join(root, 'BASE'));
            await initRepository(path.join(root, 'BASE', 'A'));
            await initRepository(path.join(root, 'BASE', 'B'));
            await initRepository(path.join(root, 'BASE', 'C'));
            const workspaceRootUri = FileUri.create(path.join(root, 'BASE')).toString();
            const repositories = await hg.repositories(workspaceRootUri, {});
            expect(repositories.map(r => path.basename(FileUri.fsPath(r.localUri))).sort()).to.deep.equal(['A', 'B', 'BASE', 'C']);

        });

        it('should discover all nested repositories and the container repository', async () => {

            const root = track.mkdirSync('discovery-test-4');
            fs.mkdirSync(path.join(root, 'BASE'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'A'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'B'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'C'));
            const hg = await createHg();
            await initRepository(path.join(root, 'BASE'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'A'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'B'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'C'));
            const workspaceRootUri = FileUri.create(path.join(root, 'BASE', 'WS_ROOT')).toString();
            const repositories = await hg.repositories(workspaceRootUri, {});
            const repositoryNames = repositories.map(r => path.basename(FileUri.fsPath(r.localUri)));
            expect(repositoryNames.shift()).to.equal('BASE'); // The first must be the container repository.
            expect(repositoryNames.sort()).to.deep.equal(['A', 'B', 'C']);

        });

    });

    describe('status', async () => {

        it('modifying a staged file should result in two changes', async () => {

            // Init repository.
            const root = await createTestRepository(track.mkdirSync('status-test'));
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            const hg = await createHg();

            // // Check status. Expect empty.
            let status = await hg.status(repository);
            expect(status.changes).to.be.empty;

            // Modify a file.
            const filePath = path.join(root, 'A.txt');
            const fileUri = FileUri.create(filePath).toString();
            fs.writeFileSync(filePath, 'new content');
            expect(fs.readFileSync(filePath, { encoding: 'utf8' })).to.be.equal('new content');
            await hg.add(repository, [fileUri]);

            // Check the status again. Expect one single change.
            status = await hg.status(repository);
            expect(status.changes).to.be.have.lengthOf(1);
            expect(status.changes[0].uri).to.be.equal(fileUri);
            // expect(status.changes[0].untracked).to.be.false;

            // Change the same file again.
            fs.writeFileSync(filePath, 'yet another new content');
            expect(fs.readFileSync(filePath, { encoding: 'utf8' })).to.be.equal('yet another new content');

            // We expect two changes; one is staged, the other is in the working directory.
            status = await hg.status(repository);
            expect(status.changes).to.be.have.lengthOf(2);
            expect(status.changes.map(f => f.uri)).to.be.deep.equal([fileUri, fileUri]);
            // expect(status.changes.map(f => !f.untracked).sort()).to.be.deep.equal([false, true]);

        });

    });

    describe('WorkingDirectoryStatus#equals', async () => {

        it('staged change should matter', async () => {

            const left: WorkingDirectoryStatus = JSON.parse(`
            {
                "exists":true,
                "branch":"GH-165",
                "upstreamBranch":"origin/GH-165",
                "aheadBehind":{
                   "ahead":0,
                   "behind":0
                },
                "changes":[
                   {
                      "uri":"bar.foo",
                      "status":0,
                      "staged":false
                   }
                ],
                "currentHead":"a274d43dbfba5d1ff9d52db42dc90c6f03071656"
             }
            `);

            const right: WorkingDirectoryStatus = JSON.parse(`
            {
                "exists":true,
                "branch":"GH-165",
                "upstreamBranch":"origin/GH-165",
                "aheadBehind":{
                   "ahead":0,
                   "behind":0
                },
                "changes":[
                   {
                      "uri":"bar.foo",
                      "status":0,
                      "staged":true
                   }
                ],
                "currentHead":"a274d43dbfba5d1ff9d52db42dc90c6f03071656"
             }
            `);

            expect(WorkingDirectoryStatus.equals(left, right)).to.be.false;

        });

    });

    describe('show', async () => {

        let repository: Repository | undefined;
        let hg: Hg | undefined;

        beforeEach(async () => {
            const root = await createTestRepository(track.mkdirSync('status-test'));
            const localUri = FileUri.create(root).toString();
            repository = { localUri };
            hg = await createHg();
        });

        it('modified in working directory', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'A.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'A.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            const content = await hg!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'tip' });
            expect(content).to.be.equal('A');
        });

        it('modified in working directory (nested)', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'folder', 'C.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'folder', 'C.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            const content = await hg!.show(repository!, FileUri.create(path.join(repositoryPath, 'folder', 'C.txt')).toString(), { commitish: 'tip' });
            expect(content).to.be.equal('C');
        });

        it('modified in index', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'A.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'A.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            await hg!.add(repository!, [FileUri.create(path.join(repositoryPath, 'A.txt')).toString()]);
            const content = await hg!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'index' });
            expect(content).to.be.equal('new content');
        });

        it('modified in index and in working directory', async () => {
            const repositoryPath = FileUri.fsPath(repository!.localUri);
            fs.writeFileSync(path.join(repositoryPath, 'A.txt'), 'new content');
            expect(fs.readFileSync(path.join(repositoryPath, 'A.txt'), { encoding: 'utf8' })).to.be.equal('new content');
            await hg!.add(repository!, [FileUri.create(path.join(repositoryPath, 'A.txt')).toString()]);
            expect(await hg!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'index' })).to.be.equal('new content');
            expect(await hg!.show(repository!, FileUri.create(path.join(repositoryPath, 'A.txt')).toString(), { commitish: 'tip' })).to.be.equal('A');
        });

    });

    describe('remote', async () => {

        it('remotes are not set by default', async () => {
            const root = track.mkdirSync('remote-with-init');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);
            const hg = await createHg();
            const remotes = await hg.paths({ localUri });
            expect(remotes).to.be.empty;
        });

        it('origin is the default after a fresh clone', async () => {
            const hg = await createHg();
            const remoteUrl = 'https://hghub.com/TypeFox/find-hg-exec.hg';
            const localUri = FileUri.create(track.mkdirSync('remote-with-clone')).toString();
            const options = { localUri };
            await hg.clone(remoteUrl, options);

            const remotes = await hg.paths({ localUri });
            expect(remotes).to.be.lengthOf(1);
            expect(remotes.shift()).to.be.equal('origin');
        });

        it('remotes can be added and queried', async () => {
            const root = track.mkdirSync('remote-with-init');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);

            await gitExec(['remote', 'add', 'first', 'some/location'], root, 'addRemote');
            await gitExec(['remote', 'add', 'second', 'some/location'], root, 'addRemote');

            const hg = await createHg();
            const remotes = await hg.paths({ localUri });
            expect(remotes).to.be.deep.equal(['first', 'second']);
        });

    });

    describe('exec', async () => {

        it('version', async () => {
            const root = track.mkdirSync('exec-version');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);

            const hg = await createHg();
            const result = await hg.exec({ localUri }, ['--version']);
            expect(result.stdout.trim().replace(/^hg version /, '').startsWith('2')).to.be.true;
            expect(result.stderr.trim()).to.be.empty;
            expect(result.exitCode).to.be.equal(0);
        });

        it('config', async () => {
            const root = track.mkdirSync('exec-config');
            const localUri = FileUri.create(root).toString();
            await initRepository(root);

            const hg = await createHg();
            const result = await hg.exec({ localUri }, ['config', '-l']);
            expect(result.stdout.trim()).to.be.not.empty;
            expect(result.stderr.trim()).to.be.empty;
            expect(result.exitCode).to.be.equal(0);
        });

    });

    describe('map-status', async () => {

        it('deleted', () => {
            expect(HgUtils.mapStatus('D')).to.be.equal(HgFileStatus.Deleted);
        });

        it('added with leading whitespace', () => {
            expect(HgUtils.mapStatus(' A')).to.be.equal(HgFileStatus.New);
        });

        it('modified with trailing whitespace', () => {
            expect(HgUtils.mapStatus('M ')).to.be.equal(HgFileStatus.Modified);
        });

        it('copied with percentage', () => {
            expect(HgUtils.mapStatus('C100')).to.be.equal(HgFileStatus.Copied);
        });

        it('renamed with percentage', () => {
            expect(HgUtils.mapStatus('R10')).to.be.equal(HgFileStatus.Renamed);
        });

    });

    describe('similarity-status', async () => {

        it('copied (2)', () => {
            expect(HgUtils.isSimilarityStatus('C2')).to.be.false;
        });

        it('copied (20)', () => {
            expect(HgUtils.isSimilarityStatus('C20')).to.be.false;
        });

        it('copied (020)', () => {
            expect(HgUtils.isSimilarityStatus('C020')).to.be.true;
        });

        it('renamed (2)', () => {
            expect(HgUtils.isSimilarityStatus('R2')).to.be.false;
        });

        it('renamed (20)', () => {
            expect(HgUtils.isSimilarityStatus('R20')).to.be.false;
        });

        it('renamed (020)', () => {
            expect(HgUtils.isSimilarityStatus('R020')).to.be.true;
        });

        it('invalid', () => {
            expect(HgUtils.isSimilarityStatus('invalid')).to.be.false;
        });

    });

    describe('blame', async () => {

        const init = async (hg: Hg, repository: Repository) => {
            await hg.exec(repository, ['init']);
            if ((await hg.exec(repository, ['config', 'user.name'], { successExitCodes: new Set([0, 1]) })).exitCode !== 0) {
                await hg.exec(repository, ['config', 'user.name', 'User Name']);
            }
            if ((await hg.exec(repository, ['config', 'user.email'], { successExitCodes: new Set([0, 1]) })).exitCode !== 0) {
                await hg.exec(repository, ['config', 'user.email', 'user.name@domain.com']);
            }
        };

        it('blame file with dirty content', async () => {
            const fileName = 'blame.me.not';
            const root = track.mkdirSync('blame-dirty-file');
            const filePath = path.join(root, fileName);
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };

            const writeContentLines = async (lines: string[]) => fs.writeFile(filePath, lines.join('\n'), { encoding: 'utf8' });
            const addAndCommit = async (message: string) => {
                await hg.exec(repository, ['add', '.']);
                await hg.exec(repository, ['commit', '-m', `${message}`]);
            };
            const expectBlame = async (content: string, expected: [number, string][]) => {
                const uri = FileUri.create(path.join(root, fileName)).toString();
                const actual = await hg.blame(repository, uri, { content });
                expect(actual).to.be.not.undefined;
                const messages = new Map(actual!.commits.map<[string, string]>(c => [c.sha, c.summary]));
                const lineMessages = actual!.lines.map(l => [l.line, messages.get(l.sha)]);
                expect(lineMessages).to.be.deep.equal(expected);
            };

            const hg = await createHg();
            await init(hg, repository);
            await fs.createFile(filePath);

            await writeContentLines(['🍏', '🍏', '🍏', '🍏', '🍏', '🍏']);
            await addAndCommit('six 🍏');

            await expectBlame(['🍏', '🍐', '🍐', '🍏', '🍏', '🍏'].join('\n'),
                [
                    [0, 'six 🍏'],
                    [1, 'uncommitted'],
                    [2, 'uncommitted'],
                    [3, 'six 🍏'],
                    [4, 'six 🍏'],
                    [5, 'six 🍏'],
                ]);
        });

        it('uncommitted file', async () => {
            const fileName = 'uncommitted.file';
            const root = track.mkdirSync('try-blame');
            const filePath = path.join(root, fileName);
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };

            const writeContentLines = async (lines: string[]) => fs.writeFile(filePath, lines.join('\n'), { encoding: 'utf8' });
            const add = async () => {
                await hg.exec(repository, ['add', '.']);
            };
            const expectUndefinedBlame = async () => {
                const uri = FileUri.create(path.join(root, fileName)).toString();
                const actual = await hg.blame(repository, uri);
                expect(actual).to.be.undefined;
            };

            const hg = await createHg();
            await init(hg, repository);
            await fs.createFile(filePath);

            await writeContentLines(['🍏', '🍏', '🍏', '🍏', '🍏', '🍏']);
            await expectUndefinedBlame();

            await add();
            await expectUndefinedBlame();

            await writeContentLines(['🍏', '🍐', '🍐', '🍏', '🍏', '🍏']);
            await expectUndefinedBlame();
        });

        it('blame file', async () => {
            const fileName = 'blame.me';
            const root = track.mkdirSync('blame-file');
            const filePath = path.join(root, fileName);
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };

            const writeContentLines = async (lines: string[]) => fs.writeFile(filePath, lines.join('\n'), { encoding: 'utf8' });
            const addAndCommit = async (message: string) => {
                await hg.exec(repository, ['add', '.']);
                await hg.exec(repository, ['commit', '-m', `${message}`]);
            };
            const expectBlame = async (expected: [number, string][]) => {
                const uri = FileUri.create(path.join(root, fileName)).toString();
                const actual = await hg.blame(repository, uri);
                expect(actual).to.be.not.undefined;
                const messages = new Map(actual!.commits.map<[string, string]>(c => [c.sha, c.summary]));
                const lineMessages = actual!.lines.map(l => [l.line, messages.get(l.sha)]);
                expect(lineMessages).to.be.deep.equal(expected);
            };

            const hg = await createHg();
            await init(hg, repository);
            await fs.createFile(filePath);

            await writeContentLines(['🍏', '🍏', '🍏', '🍏', '🍏', '🍏']);
            await addAndCommit('six 🍏');

            await writeContentLines(['🍏', '🍐', '🍐', '🍏', '🍏', '🍏']);
            await addAndCommit('replace two with 🍐');

            await writeContentLines(['🍏', '🍐', '🍋', '🍋', '🍏', '🍏']);
            await addAndCommit('replace two with 🍋');

            await writeContentLines(['🍏', '🍐', '🍋', '🍌', '🍌', '🍏']);

            await expectBlame([
                [0, 'six 🍏'],
                [1, 'replace two with 🍐'],
                [2, 'replace two with 🍋'],
                [3, 'uncommitted'],
                [4, 'uncommitted'],
                [5, 'six 🍏'],
            ]);
        });

        it('commit summary and body', async () => {
            const fileName = 'blame.me';
            const root = track.mkdirSync('blame-with-commit-body');
            const filePath = path.join(root, fileName);
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };

            const writeContentLines = async (lines: string[]) => fs.writeFile(filePath, lines.join('\n'), { encoding: 'utf8' });
            const addAndCommit = async (message: string) => {
                await hg.exec(repository, ['add', '.']);
                await hg.exec(repository, ['commit', '-m', `${message}`]);
            };
            const expectBlame = async (expected: [number, string, string][]) => {
                const uri = FileUri.create(path.join(root, fileName)).toString();
                const actual = await hg.blame(repository, uri);
                expect(actual).to.be.not.undefined;
                const messages = new Map(actual!.commits.map<[string, string[]]>(c => [c.sha, [c.summary, c.body!]]));
                const lineMessages = actual!.lines.map(l => [l.line, ...messages.get(l.sha)!]);
                expect(lineMessages).to.be.deep.equal(expected);
            };

            const hg = await createHg();
            await init(hg, repository);
            await fs.createFile(filePath);

            await writeContentLines(['🍏']);
            await addAndCommit('add 🍏\n* green\n* red');

            await expectBlame([
                [0, 'add 🍏', '* green\n* red']
            ]);
        });
    });

    describe('diff', async () => {
        const init = async (hg: Hg, repository: Repository) => {
            await hg.exec(repository, ['init']);
            if ((await hg.exec(repository, ['config', 'user.name'], { successExitCodes: new Set([0, 1]) })).exitCode !== 0) {
                await hg.exec(repository, ['config', 'user.name', 'User Name']);
            }
            if ((await hg.exec(repository, ['config', 'user.email'], { successExitCodes: new Set([0, 1]) })).exitCode !== 0) {
                await hg.exec(repository, ['config', 'user.email', 'user.name@domain.com']);
            }
        };

        it('status without ranges (working directory)', async () => {
            const root = track.mkdirSync('diff-without-ranges');
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            await fs.createFile(path.join(root, 'A.txt'));
            await fs.writeFile(path.join(root, 'A.txt'), 'A content', { encoding: 'utf8' });
            const hg = await createHg();

            await init(hg, repository);

            const expectDiff: (expected: ChangeDelta[]) => Promise<void> = async expected => {
                const actual = (await hg.status(repository)).changes.map(change => ChangeDelta.map(repository, change)).sort(ChangeDelta.compare);
                expect(actual).to.be.deep.equal(expected);
            };

            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Initialized."']); // HEAD

            await fs.createFile(path.join(root, 'B.txt'));
            await fs.writeFile(path.join(root, 'B.txt'), 'B content', { encoding: 'utf8' });
            await expectDiff([]); // Unstaged (new)

            await fs.writeFile(path.join(root, 'A.txt'), 'updated A content', { encoding: 'utf8' });
            await expectDiff([{ pathSegment: 'A.txt', status: HgFileStatus.Modified }]); // Unstaged (modified)

            await fs.unlink(path.join(root, 'A.txt'));
            await expectDiff([{ pathSegment: 'A.txt', status: HgFileStatus.Deleted }]); // Unstaged (deleted)
        });

        it('diff without ranges / staged', async () => {
            const root = track.mkdirSync('diff-without-ranges');
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            await fs.createFile(path.join(root, 'A.txt'));
            await fs.writeFile(path.join(root, 'A.txt'), 'A content', { encoding: 'utf8' });
            const hg = await createHg();

            await init(hg, repository);

            const expectDiff: (expected: ChangeDelta[]) => Promise<void> = async expected => {
                const actual = (await hg.status(repository)).changes.map(change => ChangeDelta.map(repository, change)).sort(ChangeDelta.compare);
                expect(actual).to.be.deep.equal(expected);
            };

            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Initialized."']); // HEAD

            await fs.createFile(path.join(root, 'B.txt'));
            await fs.writeFile(path.join(root, 'B.txt'), 'B content', { encoding: 'utf8' });
            await hg.add(repository, [FileUri.create(path.join(root, 'B.txt')).toString()]);
            await expectDiff([{ pathSegment: 'B.txt', status: HgFileStatus.New }]); // Staged (new)

            await fs.writeFile(path.join(root, 'A.txt'), 'updated A content', { encoding: 'utf8' });
            await hg.add(repository, [FileUri.create(path.join(root, 'A.txt')).toString()]);
            await expectDiff([{ pathSegment: 'A.txt', status: HgFileStatus.Modified }, { pathSegment: 'B.txt', status: HgFileStatus.New }]); // Staged (modified)

            await fs.unlink(path.join(root, 'A.txt'));
            await hg.add(repository, [FileUri.create(path.join(root, 'A.txt')).toString()]);
            await expectDiff([{ pathSegment: 'A.txt', status: HgFileStatus.Deleted }, { pathSegment: 'B.txt', status: HgFileStatus.New }]); // Staged (deleted)
        });

        it('status with ranges', async () => {
            const root = track.mkdirSync('diff-with-ranges');
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            await fs.createFile(path.join(root, 'A.txt'));
            await fs.writeFile(path.join(root, 'A.txt'), 'A content', { encoding: 'utf8' });
            await fs.createFile(path.join(root, 'B.txt'));
            await fs.writeFile(path.join(root, 'B.txt'), 'B content', { encoding: 'utf8' });
            await fs.mkdir(path.join(root, 'folder'));
            await fs.createFile(path.join(root, 'folder', 'F1.txt'));
            await fs.writeFile(path.join(root, 'folder', 'F1.txt'), 'F1 content', { encoding: 'utf8' });
            await fs.createFile(path.join(root, 'folder', 'F2.txt'));
            await fs.writeFile(path.join(root, 'folder', 'F2.txt'), 'F2 content', { encoding: 'utf8' });
            const hg = await createHg();

            await init(hg, repository);

            const expectDiff: (fromRevision: string, toRevision: string, expected: ChangeDelta[], filePath?: string) => Promise<void> = async (fromRevision, toRevision, expected, filePath) => {
                const range = { fromRevision, toRevision };
                let uri: string | undefined;
                if (filePath) {
                    uri = FileUri.create(path.join(root, filePath)).toString();
                }
                const options: Hg.Options.Status = { range, uri };
                const actual = (await hg.status(repository, options)).map(change => ChangeDelta.map(repository, change)).sort(ChangeDelta.compare);
                expect(actual).to.be.deep.equal(expected, `Between ${fromRevision}..${toRevision}`);
            };

            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 1 on master."']); // HEAD~4

            await hg.exec(repository, ['checkout', '-b', 'new-branch']);
            await fs.writeFile(path.join(root, 'A.txt'), 'updated A content', { encoding: 'utf8' });
            await fs.unlink(path.join(root, 'B.txt'));
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 1 on new-branch."']); // new-branch~2

            await fs.createFile(path.join(root, 'C.txt'));
            await fs.writeFile(path.join(root, 'C.txt'), 'C content', { encoding: 'utf8' });
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 2 on new-branch."']); // new-branch~1

            await fs.createFile(path.join(root, 'B.txt'));
            await fs.writeFile(path.join(root, 'B.txt'), 'B content', { encoding: 'utf8' });
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 3 on new-branch."']); // new-branch

            await hg.exec(repository, ['checkout', 'master']);

            await fs.createFile(path.join(root, 'C.txt'));
            await fs.writeFile(path.join(root, 'C.txt'), 'C content', { encoding: 'utf8' });
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 2 on master."']); // HEAD~3

            await fs.createFile(path.join(root, 'D.txt'));
            await fs.writeFile(path.join(root, 'D.txt'), 'D content', { encoding: 'utf8' });
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 3 on master."']); // HEAD~2

            await fs.unlink(path.join(root, 'B.txt'));
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 4 on master."']); // HEAD~1

            await fs.unlink(path.join(root, 'folder', 'F1.txt'));
            await fs.writeFile(path.join(root, 'folder', 'F2.txt'), 'updated F2 content', { encoding: 'utf8' });
            await fs.createFile(path.join(root, 'folder', 'F3 with space.txt'));
            await fs.writeFile(path.join(root, 'folder', 'F3 with space.txt'), 'F3 content', { encoding: 'utf8' });
            await hg.exec(repository, ['add', '.']);
            await hg.exec(repository, ['commit', '-m', '"Commit 5 on master."']); // HEAD

            await expectDiff('HEAD~4', 'HEAD~3', [{ pathSegment: 'C.txt', status: HgFileStatus.New }]);
            await expectDiff('HEAD~4', 'HEAD~2', [{ pathSegment: 'C.txt', status: HgFileStatus.New }, { pathSegment: 'D.txt', status: HgFileStatus.New }]);
            await expectDiff('HEAD~4', 'HEAD~1', [{ pathSegment: 'B.txt', status: HgFileStatus.Deleted }, { pathSegment: 'C.txt', status: HgFileStatus.New }, { pathSegment: 'D.txt', status: HgFileStatus.New }]);
            await expectDiff('HEAD~3', 'HEAD~2', [{ pathSegment: 'D.txt', status: HgFileStatus.New }]);
            await expectDiff('HEAD~3', 'HEAD~1', [{ pathSegment: 'B.txt', status: HgFileStatus.Deleted }, { pathSegment: 'D.txt', status: HgFileStatus.New }]);
            await expectDiff('HEAD~2', 'HEAD~1', [{ pathSegment: 'B.txt', status: HgFileStatus.Deleted }]);

            await expectDiff('new-branch~2', 'new-branch~1', [{ pathSegment: 'C.txt', status: HgFileStatus.New }]);
            await expectDiff('new-branch~2', 'new-branch', [{ pathSegment: 'B.txt', status: HgFileStatus.New }, { pathSegment: 'C.txt', status: HgFileStatus.New }]);
            await expectDiff('new-branch~1', 'new-branch', [{ pathSegment: 'B.txt', status: HgFileStatus.New }]);

            // Filter for a whole folder and its descendants.
            await expectDiff('HEAD~4', 'HEAD~3', [], 'folder');
            await expectDiff('HEAD~4', 'tip', [
                { pathSegment: 'folder/F1.txt', status: HgFileStatus.Deleted },
                { pathSegment: 'folder/F2.txt', status: HgFileStatus.Modified },
                { pathSegment: 'folder/F3 with space.txt', status: HgFileStatus.New }],
                'folder');

            // Filter for a single file.
            await expectDiff('HEAD~4', 'HEAD~3', [], 'folder/F1.txt');
            await expectDiff('HEAD~4', 'tip', [
                { pathSegment: 'folder/F1.txt', status: HgFileStatus.Deleted }],
                'folder/F1.txt');

            // Filter for a non-existing file.
            await expectDiff('HEAD~4', 'HEAD~3', [], 'does not exist');
            await expectDiff('HEAD~4', 'tip', [], 'does not exist');
        });

    });

    describe('branch', () => {

        it('should list the branch in chronological order', async () => {
            const root = track.mkdirSync('branch-order');
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            const hg = await createHg();

            await createTestRepository(root);
            await hg.exec(repository, ['checkout', '-b', 'a']);
            await hg.exec(repository, ['checkout', 'master']);
            await hg.exec(repository, ['checkout', '-b', 'b']);
            await hg.exec(repository, ['checkout', 'master']);
            await hg.exec(repository, ['checkout', '-b', 'c']);
            await hg.exec(repository, ['checkout', 'master']);

            expect((await hg.branch(repository, { type: 'local' })).map(b => b.nameWithoutRemote)).to.be.deep.equal(['master', 'c', 'b', 'a']);
        });

    });

    describe('ls-files', () => {

        let hg: Hg;
        let root: string;
        let localUri: string;

        before(async () => {
            root = track.mkdirSync('ls-files');
            localUri = FileUri.create(root).toString();
            hg = await createHg();
            await createTestRepository(root);
        });

        ([
            ['A.txt', true],
            ['missing.txt', false],
            ['../outside.txt', false],
        ] as [string, boolean][]).forEach(test => {
            const [relativePath, expectation] = test;
            const message = `${expectation ? '' : 'not '}exist`;
            it(`errorUnmatched - ${relativePath} should ${message}`, async () => {
                const uri = relativePath.startsWith('.') ? relativePath : FileUri.create(path.join(root, relativePath)).toString();
                const testMe = async () => hg.lsFiles({ localUri }, uri, { errorUnmatch: true });
                expect(await testMe()).to.be.equal(expectation);
            });
        });

    });

});

describe('log', function () {

    // See https://hghub.com/theia-ide/theia/issues/2143
    it('should not fail when executed from the repository root', async () => {
        const root = await createTestRepository(track.mkdirSync('log-test'));
        const localUri = FileUri.create(root).toString();
        const repository = { localUri };
        const hg = await createHg();
        const result = await hg.log(repository, { uri: localUri });
        expect(result.length).to.be.equal(1);
        expect(result[0].author.email).to.be.equal('jon@doe.com');
    });

    it('should not fail when executed against an empty repository', async () => {
        const root = await initRepository(track.mkdirSync('empty-log-test'));
        const localUri = FileUri.create(root).toString();
        const repository = { localUri };
        const hg = await createHg();
        const result = await hg.log(repository, { uri: localUri });
        expect(result.length).to.be.equal(0);
    });
});

function toPathSegment(repository: Repository, uri: string): string {
    return upath.relative(FileUri.fsPath(repository.localUri), FileUri.fsPath(uri));
}

interface ChangeDelta {
    readonly pathSegment: string;
    readonly status: HgFileStatus;
}

namespace ChangeDelta {
    export function compare(left: ChangeDelta, right: ChangeDelta): number {
        const result = left.pathSegment.localeCompare(right.pathSegment);
        if (result === 0) {
            return left.status - right.status;
        }
        return result;
    }
    export function map(repository: Repository, fileChange: HgFileChange): ChangeDelta {
        return {
            pathSegment: toPathSegment(repository, fileChange.uri),
            status: fileChange.status
        };
    }
}
