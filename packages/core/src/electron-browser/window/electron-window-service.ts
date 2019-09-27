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

import { injectable } from 'inversify';
import { ipcRenderer } from 'electron';
import { NewWindowOptions } from '../../browser/window/window-service';
import { DefaultWindowService } from '../../browser/window/default-window-service';
import * as electron from 'electron';

@injectable()
export class ElectronWindowService extends DefaultWindowService {

    openNewWindow(url: string, { external }: NewWindowOptions = {}): undefined {
        if (external) {
            ipcRenderer.send('open-external', url);
        } else {
            ipcRenderer.send('create-new-window', url);
        }
        return undefined;
    }

    protected preventUnload(event: BeforeUnloadEvent): string | void {
        const preventStop = 0 !== electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {
            type: 'question',
            buttons: ['Yes', 'No'],
            title: 'Confirm',
            message: 'Are you sure you want to quit?',
            detail: 'Changes you made may not be saved.'
        });

        if (preventStop) {
            event.returnValue = false;
        }
    }

}
