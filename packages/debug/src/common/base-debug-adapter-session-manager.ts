/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable } from 'inversify';
import { DebugConfiguration } from './debug-configuration';
import { DebugAdapterContribution } from './debug-model';
import { BaseDebugAdapterContributionRegistry } from './base-debug-adapter-contribution-registry';

/**
 * Debug adapter session manager.
 */
@injectable()
export abstract class BaseDebugAdapterSessionManager<T> {
    protected readonly sessions = new Map<string, T>();

    /**
     * Creates a new [debug adapter session](#DebugAdapterSession).
     * @param config The [DebugConfiguration](#DebugConfiguration)
     * @returns The debug adapter session
     */
    abstract create(config: DebugConfiguration, registry: BaseDebugAdapterContributionRegistry<DebugAdapterContribution>): Promise<string>;

    /**
     * Removes [debug adapter session](#DebugAdapterSession) from the list of the instantiated sessions.
     * Is invoked when session is terminated and isn't needed anymore.
     * @param sessionId The session identifier
     */
    remove(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Finds the debug adapter session by its id.
     * Returning the value 'undefined' means the session isn't found.
     * @param sessionId The session identifier
     * @returns The debug adapter session
     */
    find(sessionId: string): T | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Returns all instantiated debug adapter sessions.
     * @returns An array of debug adapter sessions
     */
    getAll(): IterableIterator<T> {
        return this.sessions.values();
    }
}
