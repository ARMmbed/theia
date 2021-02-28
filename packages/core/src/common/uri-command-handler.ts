/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { SelectionService } from '../common/selection-service';
import { UriSelection } from '../common/selection';
import { Event, Emitter } from '../common/event';
import { CommandHandler } from './command';
import { MaybeArray } from '.';
import URI from './uri';

export interface UriCommandHandler<T extends MaybeArray<URI>> extends CommandHandler {

    execute(uri: T, ...args: any[]): any;

    isEnabled?(uri: T, ...args: any[]): boolean;

    isVisible?(uri: T, ...args: any[]): boolean;

}

/**
 * Handler for a single URI-based selection.
 */
export interface SingleUriCommandHandler extends UriCommandHandler<URI> {

}

/**
 * Handler for multiple URIs.
 */
export interface MultiUriCommandHandler extends UriCommandHandler<URI[]> {

}

export class UriAwareCommandHandler<T extends MaybeArray<URI>> implements UriCommandHandler<T> {
    protected onUriChangedEmitter: Emitter<T | undefined> = new Emitter();
    public readonly onUriChanged = this.onUriChangedEmitter.event;

    /**
     * @deprecated since 1.6.0. Please use `UriAwareCommandHandler.MonoSelect` or `UriAwareCommandHandler.MultiSelect`.
     */
    constructor(
        protected readonly selectionService: SelectionService,
        protected readonly handler: UriCommandHandler<T>,
        protected readonly options?: UriAwareCommandHandler.Options
    ) {
        selectionService.onSelectionChanged(selection => this.selectionChanged(selection));
     }

    protected getUriFromArgs(...args: any[]): T | undefined {
        const [maybeUriArray] = args;
        const firstArgIsOK = this.isMulti()
            ? Array.isArray(maybeUriArray) && maybeUriArray.every(uri => uri instanceof URI)
            : maybeUriArray instanceof URI;

        return firstArgIsOK ? maybeUriArray : undefined;
    }

    protected getUriFromSelection(selection: Object | undefined): T | undefined {
        const uriOrUris = this.isMulti()
            ? UriSelection.getUris(selection)
            : UriSelection.getUri(selection);

        return uriOrUris as T;
    }

    protected getUri(...args: any[]): T | undefined {
        return this.getUriFromArgs(args) || this.getUriFromSelection(this.selectionService.selection);
    }

    protected getArgsWithUri(...args: any[]): [T | undefined, ...any[]] {
        const uri = this.getUri(...args);
        const [maybeUri, ...others] = args;
        if (uri === maybeUri) {
            return [maybeUri, ...others];
        }
        return [uri, ...args];
    }

    execute(...args: any[]): object | undefined {
        const [uri, ...others] = this.getArgsWithUri(...args);
        return uri ? this.handler.execute(uri, ...others) : undefined;
    }

    /**
     * The general approach here is that we make the item visible if a selection
     * change would enable the handler.  Only if a selection change can never enable
     * the handler do we mark the item invisible.
     *
     * That means the item is invisible only if the uri (or array of uris) is passed as
     * the first parameter of the args and all of the handlers say they cannot handle
     * that uri (or array of uris).
     *
     * It is really only in a context menu where the uri is passed in the args.  In the
     * context menu disabled items are not visible anyway, even if indicated here as being
     * visible.  So perhaps just returning true is ok.
     *
     * @param args passed on as-is to the handler if the first arg is a URI or URI[], otherwise
     *          the URI or URI[] is obtained from the current selection and prepended to args.
     */
    isVisible(...args: any[]): boolean {
        return true;
        // const [uri, ...others] = this.getArgsWithUri(...args);
        // if (uri) {
        //     if (this.handler.isVisible) {
        //         return this.handler.isVisible(uri, ...others);
        //     }
        //     return true;
        // }
        // return false;
    }

    isEnabled(...args: any[]): boolean {
        const [uri, ...others] = this.getArgsWithUri(...args);
        if (uri) {
            if (this.handler.isEnabled) {
                return this.handler.isEnabled(uri, ...others);
            }
            return true;
        }
        return false;
    }

    trackEnabled(...args: any[]): { value: boolean, onChange: Event<boolean> } {
        const value = this.isEnabled(args);
        const onChangeEmitter: Emitter<boolean> = new Emitter();

        if (this.options?.stop) {
            onChangeEmitter.fire(false);
        }

        const isEnabled = this.handler.isEnabled;
        if (isEnabled) {
            const uri = this.getUriFromArgs(...args);
            if (!uri) {
                // uri not specified in args, so it is coming from selection, so it may change
                this.onUriChanged(uriOrUris => {
                    if (uriOrUris) {
                        const newValue = isEnabled(uriOrUris, ...args);
                        onChangeEmitter.fire(newValue);
                    } else {
                        onChangeEmitter.fire(false);
                    }
                });
            }
        }

        return { value, onChange: onChangeEmitter.event };
    }

    protected isMulti(): boolean | undefined {
        return this.options && !!this.options.multi;
    }

    protected selectionChanged(selection: any): void {
        const uriOrUris = this.getUriFromSelection(selection);

        if (this.options?.stop) {
            this.onUriChangedEmitter.fire(uriOrUris);
        }
        this.onUriChangedEmitter.fire(uriOrUris);
    }
}

export namespace UriAwareCommandHandler {
    /**
     * Further options for the URI aware command handler instantiation.
     */
    export interface Options {

        /**
         * `true` if the handler supports multiple selection. Otherwise, `false`. Defaults to `false`.
         */
        readonly multi?: boolean,

        readonly stop?: boolean,
    }

    /**
     * @returns a command handler for mono-select contexts that expects a `URI` as the first parameter of its methods.
     */
    export function MonoSelect(selectionService: SelectionService, handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        /* eslint-disable-next-line deprecation/deprecation*/ // Safe to use when the generic and the options agree.
        return new UriAwareCommandHandler<URI>(selectionService, handler, { multi: false });
    }

    /**
     * @returns a command handler for multi-select contexts that expects a `URI[]` as the first parameter of its methods.
     */
    export function MultiSelect(selectionService: SelectionService, handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        /* eslint-disable-next-line deprecation/deprecation*/ // Safe to use when the generic and the options agree.
        return new UriAwareCommandHandler<URI[]>(selectionService, handler, { multi: true });
    }

}

