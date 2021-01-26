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
import { DebugAdapterContribution, DebugAdapterSessionFactory } from '../common/debug-model';
import { BaseDebugAdapterContributionRegistry } from '../common/base-debug-adapter-contribution-registry';

/**
 * Contributions registry.
 */
@injectable()
export class DebugAdapterContributionRegistry extends BaseDebugAdapterContributionRegistry<DebugAdapterContribution> {
    /**
     * Returns a [debug adapter session factory](#DebugAdapterSessionFactory).
     * @param debugType The registered debug type
     * @returns An [debug adapter session factory](#DebugAdapterSessionFactory)
     */
    debugAdapterSessionFactory(debugType: string): DebugAdapterSessionFactory | undefined {
        for (const contribution of this.getContributions(debugType)) {
            if (contribution.debugAdapterSessionFactory) {
                return contribution.debugAdapterSessionFactory;
            }
        }
        return undefined;
    }
}
