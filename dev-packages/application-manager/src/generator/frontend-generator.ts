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

import { AbstractGenerator } from "./abstract-generator";

export class FrontendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;
        await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('electron-main.js'), this.compileElectronMain());
        }
    }

    protected compileIndexHtml(frontendModules: Map<string, string>): string {
        return `<!DOCTYPE html>
<html>
    <head>
        ${this.compileIndexHead(frontendModules)}
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
        <title>Sign in | Mbed Studio</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Lato:400">
        <script src="./bundle.js"></script>
    </head>
    <style>
        body, html {
            height: 100%;
            background-color: #0091BD;
            background-image: url("https://s3.us-west-2.amazonaws.com/mbed-auth0-assets/MbedCityTile.png");
            background-attachment: fixed;
            font-size: 10px;
            font-weight: 400;
            font-family: Lato, sans-serif;
            line-height: 1.4;
        }

        .login-container {
            font-size: 1.4rem;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-group:last-child {
            margin-bottom: 2.5rem;
        }

        .form-control {
            padding: 6px;
            border-radius: 2px;
        }

        .form-control:focus {
            background: #fafafa;
            outline: none !important;
            box-shadow: none;
            border-color: #b3b3b3;
        }

        .login-container {
            position: relative;
            height: 100%;
        }

        .login-box {
            padding: 15px;
            background-color: #fff;
            border-top: 1px solid #e9e9e9;
            margin-top: 30px;
            margin-bottom: 30px;
        }

        .login-header {
            text-align: center;
            margin-bottom: 10px;
        }

        .login-header img {
            width: 100px;
        }

        .tab-content {
            padding: 15px;
            border: 1px solid #ddd;
            border-top: 0;
        }

        .help-link {
            outline: none;
            text-decoration: none;
            font-size: 1.2rem;
        }

        #login-error-message {
            display: none;
        }

        #signup-form p {
            font-size: 12px;
        }

        input.ui-autocomplete-input {
            display: block;
        }

        button.btn-primary {
            font-size: 1.6rem;
            border: none;
            border-radius: 0;
            background-color: #FFC700;
            color: #333E48;
        }

        button.btn-primary:hover {
            background-color: #fb9f2a;
            color: #333E48;
        }
    </style>
    <body>
        <div class="login-container" id="login-container">
            <div class="col-xs-12 col-sm-4 col-sm-offset-4 login-box">
                <div class="login-header">
                    <img src="https://s3.us-west-2.amazonaws.com/mbed-auth0-assets/ArmLogoVertical.svg"/>
                </div>

                <ul id="tabs" class="nav nav-tabs nav-justified">
                    <li class="active">
                        <a id="login-tab" data-toggle="tab" href="#login">Log in</a>
                    </li>
                </ul>
                <div class="tab-content">
                    <div id="login" class="tab-pane fade in active">
                        <div id="login-success-message" class="alert alert-success" style="display: none;"></div>
                        <div id="login-error-message" class="alert alert-danger" style="display: none;"></div>
                        <form id="login-form" method="post">
                            <div class="form-group">
                                <label for="login-identifier">
                                    Email or username
                                </label>
                                <input
                                    type="text"
                                    class="form-control"
                                    id="login-identifier"
                                    placeholder="Enter your email or username"
                                >
                                <a class="help-link" href="https://mbed-developer-qa.test.mbed.com/account/forgotten_username/" tabindex="-1">
                                    Forgotten your username?
                                </a>
                            </div>
                            <div class="form-group">
                                <label for="login-password">Password</label>
                                <input
                                    type="password"
                                    class="form-control"
                                    id="login-password"
                                    placeholder="Enter your password"
                                >
                                <a class="help-link" href="https://mbed-developer-qa.test.mbed.com/account/reset_password/" tabindex="-1">
                                    Forgotten your password?
                                </a>
                            </div>
                            <button type="submit" id="login-submit" class="btn btn-primary btn-block">Log In</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <script>if (typeof module === 'object') {window.module = module; module = undefined;}</script>
        <script src="https://code.jquery.com/jquery-3.3.1.min.js"></script>
        <script src="https://cdn.auth0.com/js/auth0/9.4.2/auth0.min.js"></script>
        <script src="https://cdn.auth0.com/js/polyfills/1.0/object-assign.min.js"></script>
        <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script>
        <script>if (window.module) module = window.module;</script>
        <script>
            window.addEventListener('load', function () {
                const config = {
                    auth0Domain: "",
                    clientID: "",
                    callbackURL: "",
                    auth0Tenant: ""
                }
                const params = Object.assign({
                    domain: config.auth0Domain,
                    clientID: config.clientID,
                    redirectUri: config.callbackURL,
                    responseType: 'code',
                    overrides: {
                        __tenant: config.auth0Tenant,
                        __token_issuer: config.auth0Domain
                    }
                }, config.internalOptions);
                const webAuth = new auth0.WebAuth(params);

                // Notification events
                function displayNotificationMessage(element, msg) {
                    const notificationElement = $(element);
                    notificationElement.empty();
                    notificationElement.append(msg);
                    notificationElement.show();
                    $("html, body").animate({
                        scrollTop: (notificationElement.offset().top)
                    }, 500);
                }

                // const connection = "Username-Password-Authentication";
                // const identifier = $("#login-identifier").val();
                // const password = $("#login-password").val();

                // webAuth.login({
                //     realm: connection,
                //     username: identifier,
                //     password: password
                // }, function (error) {
                //     if (error) {
                //         displayNotificationMessage("#login-error-message", error.description);
                //         $("#login-submit").removeAttr('disabled');
                //     }
                // });
            });
        </script>
    </body>
</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        return `// @ts-check
${this.ifBrowser("require('es6-promise/auto');")}
require('reflect-metadata');
const { Container } = require('inversify');
const { FrontendApplication } = require('@theia/core/lib/browser');
const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
const { messagingFrontendModule } = require('@theia/core/lib/browser/messaging/messaging-frontend-module');
const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');
const { ThemeService } = require('@theia/core/lib/browser/theming');

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function login() {
    return new Promise(function(resolve, reject) {
        document.getElementById("login-form").onsubmit = function(event) {
            event.preventDefault();

            const theiaPreloadDiv = document.createElement('div');

            theiaPreloadDiv.classList.add("theia-preload");
            document.body.appendChild(theiaPreloadDiv);
            document.getElementById('login-container').remove();

            resolve("Done a login");
        }
    });
}

function start() {
    const application = container.get(FrontendApplication);
    login().then(() => application.start());
}

function start() {
    const themeService = ThemeService.get()
    themeService.loadUserTheme();

    const application = container.get(FrontendApplication);
    login().then(() => application.start());
}

module.exports = Promise.resolve()${this.compileFrontendModuleImports(frontendModules)}
    .then(start).catch(reason => {
        console.error('Failed to start the frontend application.');
        if (reason) {
            console.error(reason);
        }
    });`;
    }

    protected compileElectronMain(): string {
        return `// @ts-check

// Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where
// in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the
// LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the
// C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).
if (process.env.LC_ALL) {
    process.env.LC_ALL = 'C';
}
process.env.LC_NUMERIC = 'C';

const { join } = require('path');
const { isMaster } = require('cluster');
const { fork } = require('child_process');
const { app, BrowserWindow, ipcMain } = require('electron');

const windows = [];

function createNewWindow(theUrl) {
    const newWindow = new BrowserWindow({ width: 1024, height: 728, show: !!theUrl });
    if (windows.length === 0) {
        newWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
            // If the first electron window isn't visible, then all other new windows will remain invisible.
            // https://github.com/electron/electron/issues/3751
            options.show = true;
            options.width = 1024;
            options.height = 728;
        });
    }
    windows.push(newWindow);
    if (!!theUrl) {
        newWindow.loadURL(theUrl);
    } else {
        newWindow.on('ready-to-show', () => newWindow.show());
    }
    newWindow.on('closed', () => {
        const index = windows.indexOf(newWindow);
        if (index !== -1) {
            windows.splice(index, 1);
        }
        if (windows.length === 0) {
            app.exit(0);
        }
    });
    return newWindow;
}

if (isMaster) {
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
    ipcMain.on('create-new-window', (event, url) => {
        createNewWindow(url);
    });
    app.on('ready', () => {
        // Check whether we are in bundled application or development mode.
        const devMode = process.defaultApp || /node_modules[\/]electron[\/]/.test(process.execPath);
        const mainWindow = createNewWindow();
        const loadMainWindow = (port) => {
            mainWindow.loadURL('file://' + join(__dirname, '../../lib/index.html') + '?port=' + port);
        };
        const mainPath = join(__dirname, '..', 'backend', 'main');
        // We need to distinguish between bundled application and development mode when starting the clusters.
        // See: https://github.com/electron/electron/issues/6337#issuecomment-230183287
        if (devMode) {
            require(mainPath).then(address => {
                loadMainWindow(address.port);
            }).catch((error) => {
                console.error(error);
                app.exit(1);
            });
        } else {
            const cp = fork(mainPath);
            cp.on('message', (message) => {
                loadMainWindow(message);
            });
            cp.on('error', (error) => {
                console.error(error);
                app.exit(1);
            });
            app.on('quit', () => {
                // If we forked the process for the clusters, we need to manually terminate it.
                // See: https://github.com/theia-ide/theia/issues/835
                process.kill(cp.pid);
            });
        }
    });
} else {
    require('../backend/main');
}
`;
    }

}
