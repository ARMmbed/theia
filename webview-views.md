# VS Code API: Weview Views

This documents investigation into adding the
[registerWebviewViewProvider](https://code.visualstudio.com/api/references/vscode-api#window.registerWebviewViewProvider`)
VS Code extension API into Theia.

## Background

### Webview API

The new WebviewView API is based on the existing VS Code
[webviews](https://code.visualstudio.com/api/extension-guides/webview) API. This lets extensions contribute fully
customisable UI, by giving them direct control over an `<iframe>` element.

Extensions use the [createWebviewPanel](https://code.visualstudio.com/api/references/vscode-api#window.createWebviewPanel) API to create a webview panel. This returns a `Webview`
object with, for example, an `html` property that controls the content of the `<iframe>`:

```typescript
// Extension entry point
export function activate() {
    // Create a webview panel in the first Editor group
    const panel = vscode.window.createWebviewPanel('webview-id', 'Webview Title', vscode.ViewColumn.One);
    // Set the iframe HTML
    panel.webview.html = '<html>Some HTML</html>';
};
```

JS running in the webview `<iframe>` can communicate with the main plugin via the browser `window.postMessage` API. See the
[webview-sample](https://github.com/microsoft/vscode-extension-samples/tree/3c58a94a2ad03dd78ccfe35a5f9695acb66dc219/webview-sample)
extension example.

One limitation of createWebviewPanel is that webviews can only appear in the main Editor region of the VS code API UI.
They cannot be placed into the Panel or Activity Bar regions.

### Webview Views API

The new Webview Views API removes this limitation. Extensions can contribute views backed by webviews into a view container
in the Panel or Activity Bar.

In the package.json, extensions specify a view contribution:

```json
"contributes": {
    "views": {
        "explorer": [
            { "id": "test-webview", "type": "webview", "name": "Test Webview" }
        ]
    }
}
```

The new "webview" type distinguishes this view from the existing "tree" type view contributions.

Then in the extension JS, `registerWebviewViewProvider` matches the view ID to a webview provider ("factory" for webviews):

```typescript
export function activate() {
    // Match up the view ID from the package.json with the logic for handling the webview
    vscode.window.registerWebviewViewProvider('test-webview', {
        resolveWebview: (webviewView: vscode.WebviewView) => {
            // This function manages the webview content, including the iframe HTML
            webviewView.webview.html = '<html>Some HTML</html>';
            // ... other webview code here, e.g. passing messages to JS running in the iframe ...
        }
    });
};
```

See the
[webview-view-sample](https://github.com/microsoft/vscode-extension-samples/tree/37ac6e5e254bb6d3f6887bbeebcabad8ddcc300c/webview-view-sample)
extension example.

## Theia

Theia currently has support for webviews, but not webview views.

### Implementing VS Code plugin APIs in Theia

Theia's plugin implementation is mostly API-compatible with VS Code's extension API. Guidance for adding new plugin APIs
can be found here: [Theia-Plugin-Implementation](https://github.com/eclipse-theia/theia/wiki/Theia-Plugin-Implementation).

In summary, Theia plugins are run in a separate plugin host process on the backend host machine. One plugin host is spawned
for each frontend instance, i.e. one host process per browser tab. The plugin host and frontend code processes communicate
over an RPC interface. The plugin host side is called "ext" and the frontend side is called "main".

The RPC interface is defined in
[plugin-api-rpc.ts](https://github.com/eclipse-theia/theia/blob/b083deb1ef97147fd509f3982fef3ffe6c463e82/packages/plugin-ext/src/common/plugin-api-rpc.ts).
Then the ext implementations live in plugin-ext/src/plugin and the main implementations live in plugin-ext/src/main.

For example, the main side of the webview RPC interface is in
[webviews-main.ts](https://github.com/eclipse-theia/theia/blob/b083deb1ef97147fd509f3982fef3ffe6c463e82/packages/plugin-ext/src/main/browser/webviews-main.ts),
and the ext side is in
[plugin/webviews.ts](https://github.com/eclipse-theia/theia/blob/b083deb1ef97147fd509f3982fef3ffe6c463e82/packages/plugin-ext/src/plugin/webviews.ts).

The `theia` interface exposed to plugin code is defined in plugin/src/theia.d.ts. It is implemented in
[plugin-context.ts](https://github.com/eclipse-theia/theia/blob/b083deb1ef97147fd509f3982fef3ffe6c463e82/packages/plugin-ext/src/plugin/plugin-context.ts),
in the ext process.

### VS Code Implementation

It is recommended to copy the VS Code implementation as closely as possible when porting extension APIs to Theia.

The ext side of the Webview View Provider API is implemented in
[extHostWebviewView.ts](https://github.com/microsoft/vscode/blob/master/src/vs/workbench/api/common/extHostWebviewView.ts).
And the main side is in
[mainThreadWebviewViews.ts](https://github.com/microsoft/vscode/blob/master/src/vs/workbench/api/browser/mainThreadWebviewViews.ts).

### The Webview View API and Theia

GitHub issue: https://github.com/eclipse-theia/theia/issues/8740
Related GitHub issue for CustomEditor API https://github.com/eclipse-theia/theia/issues/6636

Adding the Webview View API to Theia will require at least:
- Addiing the view `type` property to the package definitions in plugin-protocol.ts and parsing it in the plugin scanner.
- Adding `registerWebviewViewProvider` to theia.d.ts and implementing it in the plugin-context.ts.
- Updating the `PluginViewRegistry` in the main process to handle webview views in addition to the existing support for
tree views.
- Adding RPC methods to both main & ext sides to implement `registerWebviewViewProvider`.

Potential issues/complications:
- The VS Code webview implementation has evolved since it was copied in to Theia. VS Code now has three RPC interfaces for
webviews: one for panels, one for webview views, and a common "webviews" interface. Theia only has one.
- The CustomEditor API also uses webviews. The team implementing webview views may need to liase with the team implementing
custom editors to avoid duplication or merge conflicts.
