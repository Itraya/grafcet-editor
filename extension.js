'use strict';
const vscode = require('vscode');
const { toST } = require('./st');

const VIEW_TYPE = 'grafcetEditor.editor';
const EMPTY_DOC = { version: 1, cols: 4, rows: 12, nextId: 1, nodes: [] };
let lastDoc = null;

async function exportST(document) {
  const doc = document || lastDoc;
  if (!doc) { vscode.window.showWarningMessage('Ouvre d’abord un fichier .grafcet.json.'); return; }
  let data;
  try { data = JSON.parse(doc.getText() || JSON.stringify(EMPTY_DOC)); }
  catch (e) { vscode.window.showErrorMessage('Fichier grafcet invalide : ' + e.message); return; }
  const out = await vscode.workspace.openTextDocument({ content: toST(data), language: 'plaintext' });
  vscode.window.showTextDocument(out, vscode.ViewColumn.Beside);
}

function getHtml(webview, extUri) {
  const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
  const u = f => webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'media', f));
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${u('main.css')}"></head>
<body><div class="bar" id="bar"></div><div id="root"></div>
<script nonce="${nonce}" src="${u('graph.js')}"></script>
<script nonce="${nonce}" src="${u('main.js')}"></script></body></html>`;
}

class GrafcetEditorProvider {
  constructor(ctx) { this.ctx = ctx; }
  resolveCustomTextEditor(document, panel) {
    lastDoc = document;
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')] };
    panel.webview.html = getHtml(panel.webview, this.ctx.extensionUri);
    const send = () => panel.webview.postMessage({ type: 'doc', text: document.getText() });
    const sub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) send();
    });
    panel.onDidChangeViewState(() => { if (panel.active) lastDoc = document; });
    panel.onDidDispose(() => sub.dispose());
    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'ready') send();
      else if (msg.type === 'exportST') exportST(document);
      else if (msg.type === 'edit') {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), msg.text);
        vscode.workspace.applyEdit(edit);
      }
    });
  }
}

function activate(ctx) {
  ctx.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new GrafcetEditorProvider(ctx), { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('grafcetEditor.exportST', () => exportST()),
    vscode.commands.registerCommand('grafcetEditor.new', async () => {
      const uri = await vscode.window.showSaveDialog({ filters: { 'Grafcet': ['grafcet.json'] }, saveLabel: 'Créer' });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(EMPTY_DOC, null, 2), 'utf8'));
      vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
    })
  );
}
function deactivate() {}
module.exports = { activate, deactivate };
