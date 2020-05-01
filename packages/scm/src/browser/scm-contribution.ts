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
import { inject, injectable, postConstruct } from 'inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { find } from '@phosphor/algorithm';
import {
    AbstractViewContribution,
    FrontendApplicationContribution, LabelProvider,
    QuickOpenService,
    StatusBar,
    StatusBarAlignment,
    StatusBarEntry,
    KeybindingRegistry,
    ViewContainerTitleOptions,
    ViewContainer} from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandRegistry, Command, Disposable, DisposableCollection, CommandService } from '@theia/core/lib/common';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { ScmService } from './scm-service';
import { ScmWidget } from '../browser/scm-widget';
import URI from '@theia/core/lib/common/uri';
import { ScmQuickOpenService } from './scm-quick-open-service';
import { ScmRepository } from './scm-repository';

export const EDITOR_CONTEXT_MENU_SCM = [...EDITOR_CONTEXT_MENU, '3_scm'];
export const SCM_WIDGET_FACTORY_ID = ScmWidget.ID;
export const SCM_VIEW_CONTAINER_ID = 'scm-view-container';
export const SCM_VIEW_CONTAINER_TITLE_OPTIONS: ViewContainerTitleOptions = {
    label: 'Source Control',
    iconClass: 'scm-tab-icon',
    closeable: true
};

export namespace SCM_COMMANDS {
    export const CHANGE_REPOSITORY = {
        id: 'scm.change.repository',
        category: 'SCM',
        label: 'Change Repository...'
    };
    export const ACCEPT_INPUT = {
        id: 'scm.acceptInput'
    };
    export const TREE_VIEW_MODE = {
        id: 'scm.viewmode.tree',
        tooltip: 'Toggle to Tree View',
        iconClass: 'codicon codicon-list-tree',
        label: 'Toggle to Tree View',
    };
    export const FLAT_VIEW_MODE = {
        id: 'scm.viewmode.flat',
        tooltip: 'Toggle to Flat View',
        iconClass: 'codicon codicon-list-flat',
        label: 'Toggle to Flat View',
    };
}

@injectable()
export class ScmContribution extends AbstractViewContribution<ScmWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(ScmQuickOpenService) protected readonly scmQuickOpenService: ScmQuickOpenService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;

    protected scmFocus: ContextKey<boolean>;

    constructor() {
        super({
            viewContainerId: SCM_VIEW_CONTAINER_ID,
            widgetId: SCM_WIDGET_FACTORY_ID,
            widgetName: 'Source Control',
            defaultWidgetOptions: {
                area: 'left',
                rank: 300
            },
            toggleCommandId: 'scmView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+g'
        });
    }

    @postConstruct()
    protected init(): void {
        this.scmFocus = this.contextKeys.createKey('scmFocus', false);
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }

    onStart(): void {
        this.updateStatusBar();
        this.scmService.onDidAddRepository(() => this.updateStatusBar());
        this.scmService.onDidRemoveRepository(() => this.updateStatusBar());
        this.scmService.onDidChangeSelectedRepository(() => this.updateStatusBar());
        this.scmService.onDidChangeStatusBarCommands(() => this.updateStatusBar());
        this.labelProvider.onDidChange(() => this.updateStatusBar());

        this.updateContextKeys();
        this.shell.currentChanged.connect(() => this.updateContextKeys());
    }

    protected updateContextKeys(): void {
        this.scmFocus.set(this.shell.currentWidget instanceof ScmWidget);
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        super.registerCommands(commandRegistry);
        commandRegistry.registerCommand(SCM_COMMANDS.CHANGE_REPOSITORY, {
            execute: () => this.scmQuickOpenService.changeRepository(),
            isEnabled: () => this.scmService.repositories.length > 1
        });
        commandRegistry.registerCommand(SCM_COMMANDS.ACCEPT_INPUT, {
            execute: () => this.acceptInput(),
            isEnabled: () => !!this.scmFocus.get() && !!this.acceptInputCommand()
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        const viewModeEmitter = new Emitter<void>();
        // tslint:disable-next-line:no-any
        const extractScmWidget = (widget: any) => {
            if (widget instanceof ViewContainer) {
                const layout = widget.containerLayout;
                const scmWidgetPart = find(layout.iter(), part => part.wrapped instanceof ScmWidget);
                if (scmWidgetPart && scmWidgetPart.wrapped instanceof ScmWidget) {
                    return scmWidgetPart.wrapped;
                }
            }
        };
        const registerToggleViewItem = (command: Command, mode: 'tree' | 'flat') => {
            const id = command.id;
            const item: TabBarToolbarItem = {
                id,
                command: id,
                tooltip: command.label,
                onDidChange: viewModeEmitter.event
            };
            this.commandRegistry.registerCommand({ id, iconClass: command && command.iconClass }, {
                execute: widget => {
                    const scmWidget = extractScmWidget(widget);
                    if (scmWidget) {
                        scmWidget.viewMode = mode;
                        viewModeEmitter.fire(undefined);
                    }
                },
                isVisible: widget => {
                    const scmWidget = extractScmWidget(widget);
                    if (scmWidget) {
                        return !!this.scmService.selectedRepository
                            && scmWidget.viewMode !== mode;
                    }
                    return false;
                },
            });
            registry.registerItem(item);
        };
        registerToggleViewItem(SCM_COMMANDS.TREE_VIEW_MODE, 'tree');
        registerToggleViewItem(SCM_COMMANDS.FLAT_VIEW_MODE, 'flat');
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: SCM_COMMANDS.ACCEPT_INPUT.id,
            keybinding: 'ctrlcmd+enter',
            when: 'scmFocus'
        });
    }

    protected async acceptInput(): Promise<void> {
        const command = this.acceptInputCommand();
        if (command) {
            await this.commands.executeCommand(command.command, command.repository);
        }
    }
    protected acceptInputCommand(): {
        command: string
        repository: ScmRepository
    } | undefined {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return undefined;
        }
        const command = repository.provider.acceptInputCommand;
        if (!command || !command.command) {
            return undefined;
        }
        return {
            command: command.command,
            repository
        };
    }

    protected readonly statusBarDisposable = new DisposableCollection();
    protected updateStatusBar(): void {
        this.statusBarDisposable.dispose();
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        const name = this.labelProvider.getName(new URI(repository.provider.rootUri));
        if (this.scmService.repositories.length > 1) {
            this.setStatusBarEntry(SCM_COMMANDS.CHANGE_REPOSITORY.id, {
                text: `$(database) ${name}`,
                tooltip: name.toString(),
                command: SCM_COMMANDS.CHANGE_REPOSITORY.id,
                alignment: StatusBarAlignment.LEFT,
                priority: 100
            });
        }
        const label = repository.provider.rootUri ? `${name} (${repository.provider.label})` : repository.provider.label;
        this.scmService.statusBarCommands.forEach((value, index) => this.setStatusBarEntry(`scm.status.${index}`, {
            text: value.title,
            tooltip: label + (value.tooltip ? ` - ${value.tooltip}` : ''),
            command: value.command,
            arguments: value.arguments,
            alignment: StatusBarAlignment.LEFT,
            priority: 100
        }));
    }
    protected setStatusBarEntry(id: string, entry: StatusBarEntry): void {
        this.statusBar.setElement(id, entry);
        this.statusBarDisposable.push(Disposable.create(() => this.statusBar.removeElement(id)));
    }

}
