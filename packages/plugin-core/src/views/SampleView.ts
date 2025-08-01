import { DendronTreeViewKey, DMessage } from "@saili/common-all";
import * as vscode from "vscode";
import { WebViewUtils } from "./utils";

export class SampleView implements vscode.WebviewViewProvider {
  public static readonly viewType = DendronTreeViewKey.SAMPLE_VIEW;
  private _view?: vscode.WebviewView;

  public postMessage(msg: DMessage) {
    this._view?.webview.postMessage(msg);
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    webviewView.webview.html = await this._getHtmlForWebview(
      webviewView.webview
    );
  }

  private _getHtmlForWebview(_webview: vscode.Webview) {
    return WebViewUtils.genHTMLForTreeView({
      title: "SamplePage",
      view: DendronTreeViewKey.SAMPLE_VIEW,
    });
  }
}
