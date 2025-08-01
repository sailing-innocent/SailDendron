import {
  assertUnreachable,
  DendronEditorViewKey,
  DLogger,
  DMessageEnum,
  getWebEditorViewEntry,
  NoteProps,
  NoteUtils,
  NoteViewMessage,
  NoteViewMessageEnum,
  OnUpdatePreviewHTMLData,
  OnUpdatePreviewHTMLMsg,
} from "@saili/common-all";
import _ from "lodash";
import { inject, injectable } from "tsyringe";
import * as vscode from "vscode";
import { URI } from "vscode-uri";
import { type IPreviewLinkHandler } from "../../../components/views/IPreviewLinkHandler";
import { type PreviewProxy } from "../../../components/views/PreviewProxy";
import { type ITextDocumentService } from "../../../services/ITextDocumentService";
import { type INoteRenderer } from "../../engine/INoteRenderer";
import { WSUtilsWeb } from "../../utils/WSUtils";
import { type IPreviewPanelConfig } from "./IPreviewPanelConfig";
import { WebViewUtils } from "./WebViewUtils";

/**
 * This is the default implementation of PreviewProxy. It contains a singleton
 * of a vscode webviewPanel that renders the note preview. Furthermore, it will
 * automatically handle event subscriptions to know when to update the preview,
 * as well as properly dispose of the resources when the preview has been
 * closed.
 */
@injectable()
export class PreviewPanel implements PreviewProxy, vscode.Disposable {
  private _panel: vscode.WebviewPanel | undefined;
  private _textDocumentService: ITextDocumentService;
  private _onDidChangeActiveTextEditor: vscode.Disposable | undefined =
    undefined;
  private _onTextChanged: vscode.Disposable | undefined = undefined;
  private _linkHandler: IPreviewLinkHandler;
  private _lockedEditorNoteId: string | undefined;

  /**
   *
   * @param param0 extension - IDendronExtension implementation. linkHandler -
   * Implementation to handle preview link clicked events
   */
  constructor(
    @inject("IPreviewLinkHandler") linkHandler: IPreviewLinkHandler,
    @inject("ITextDocumentService") textDocumentService: ITextDocumentService,
    @inject("logger") private logger: DLogger,
    @inject("wsRoot") private wsRoot: URI,
    private wsUtils: WSUtilsWeb,
    private webViewUtils: WebViewUtils,
    @inject("IPreviewPanelConfig") private config: IPreviewPanelConfig,
    @inject("INoteRenderer") private noteRenderer: INoteRenderer
  ) {
    this._linkHandler = linkHandler;
    this._textDocumentService = textDocumentService;
  }

  /**
   * Show the preview.
   * @param note - if specified, this will override the preview contents with
   * the contents specified in this parameter. Otherwise, the contents of the
   * preview will follow default behavior (it will show the currently in-focus
   * Dendron note).
   */
  async show(note?: NoteProps): Promise<void> {
    if (this._panel) {
      if (!this.isVisible()) {
        this._panel.reveal();
      }
    } else {
      const viewColumn = vscode.ViewColumn.Beside; // Editor column to show the new webview panel in.
      const preserveFocus = true;

      const { bundleName: name, label } = getWebEditorViewEntry(
        DendronEditorViewKey.NOTE_PREVIEW
      );

      this._panel = vscode.window.createWebviewPanel(
        name,
        label,
        {
          viewColumn,
          preserveFocus,
        },
        {
          enableScripts: true,
          enableCommandUris: true,
          retainContextWhenHidden: true,
          enableFindWidget: true,
          localResourceRoots: this.webViewUtils
            .getLocalResourceRoots()
            .concat(this.wsRoot),
        }
      );

      const webViewAssets = this.webViewUtils.getJsAndCss();
      const html = await this.webViewUtils.getWebviewContent({
        ...webViewAssets,
        name,
        panel: this._panel,
        initialTheme: this.config.theme || "",
      });

      this._panel.webview.html = html;

      this.setupCallbacks();

      this._panel.onDidDispose(() => {
        if (this._onDidChangeActiveTextEditor) {
          this._onDidChangeActiveTextEditor.dispose();
          this._onDidChangeActiveTextEditor = undefined;
        }

        if (this._onTextChanged) {
          this._onTextChanged.dispose();
          this._onTextChanged = undefined;
        }

        this._panel = undefined;
        this.unlock();
      });

      this._panel.reveal(viewColumn, preserveFocus);
    }

    if (note && this.isVisible()) {
      this.sendRefreshMessage(this._panel, note, true);
    }
  }
  hide(): void {
    this.dispose();
  }
  async lock(noteId?: string) {
    if (noteId) {
      this._lockedEditorNoteId = noteId;
      this.sendLockMessage(this._panel, this.isLocked());
    } else {
      this.logger.error({
        ctx: "lock preview",
        msg: "Did not find note to lock.",
      });
    }
  }
  unlock() {
    this._lockedEditorNoteId = undefined;
    this.sendLockMessage(this._panel, this.isLocked());
  }
  isOpen(): boolean {
    return this._panel !== undefined;
  }
  isVisible(): boolean {
    return this._panel !== undefined && this._panel.visible;
  }

  isLocked(): boolean {
    return this._lockedEditorNoteId !== undefined;
  }

  /**
   * If the Preview is locked and the active note does not match the locked note.
   */
  async isLockedAndDirty(): Promise<boolean> {
    const note = await this.wsUtils.getActiveNote();
    return this.isLocked() && note?.id !== this._lockedEditorNoteId;
  }

  dispose() {
    this.unlock();
    if (this._panel) {
      this._panel.dispose();
      this._panel = undefined;
    }
  }

  private setupCallbacks(): void {
    // Callback on getting a message back from the webview
    this._panel!.webview.onDidReceiveMessage(async (msg: NoteViewMessage) => {
      const ctx = "ShowPreview:onDidReceiveMessage";
      this.logger.debug({ ctx, msgType: msg.type });
      switch (msg.type) {
        case DMessageEnum.ON_DID_CHANGE_ACTIVE_TEXT_EDITOR:
        case DMessageEnum.INIT: {
          // do nothing
          break;
        }
        case DMessageEnum.MESSAGE_DISPATCHER_READY: {
          // if ready, get current note
          let note: NoteProps | undefined;
          if (this.initWithNote !== undefined) {
            note = this.initWithNote;
            this.logger.debug({
              ctx,
              msg: "got pre-set note",
              note: NoteUtils.toLogObj(note),
            });
          } else {
            note = await this.wsUtils.getActiveNote();
            if (note) {
              this.logger.debug({
                ctx,
                msg: "got active note",
                note: NoteUtils.toLogObj(note),
              });
            }
          }
          if (note) {
            this.sendRefreshMessage(this._panel!, note, true);
          }
          break;
        }
        case NoteViewMessageEnum.onClick: {
          const { data } = msg;
          this._linkHandler.onLinkClicked({ data });
          break;
        }
        case NoteViewMessageEnum.onGetActiveEditor: {
          this.logger.debug({ ctx, "msg.type": "onGetActiveEditor" });
          const activeTextEditor = vscode.window.activeTextEditor;
          const maybeNote = !_.isUndefined(activeTextEditor)
            ? await this.wsUtils.getNoteFromDocument(activeTextEditor?.document)
            : undefined;

          if (!_.isUndefined(maybeNote)) {
            this.sendRefreshMessage(this._panel!, maybeNote[0], true);
          }
          break;
        }
        case NoteViewMessageEnum.onLock: {
          const { data } = msg;
          this.logger.debug({ ctx, "msg.type": "onLock" });
          this.lock(data.id);
          break;
        }
        case NoteViewMessageEnum.onUnlock: {
          this.logger.debug({ ctx, "msg.type": "onUnlock" });
          this.unlock();
          break;
        }
        case DMessageEnum.ON_UPDATE_PREVIEW_HTML:
          break;
        default:
          assertUnreachable(msg.type);
      }
    });

    // If the user changes focus, then the newly in-focus Dendron note should be
    // shown in the preview
    this._onDidChangeActiveTextEditor =
      vscode.window.onDidChangeActiveTextEditor(
        // sentryReportingCallback(
        async (editor: vscode.TextEditor | undefined) => {
          if (
            !editor ||
            editor.document.uri.fsPath !==
              vscode.window.activeTextEditor?.document.uri.fsPath ||
            (await this.isLockedAndDirty())
          ) {
            return;
          }

          // TODO: Add check back
          // const textDocument = editor.document;
          // if (
          //   !WorkspaceUtils.isPathInWorkspace({
          //     wsRoot,
          //     vaults,
          //     fpath: textDocument.uri.fsPath,
          //   })
          // ) {
          //   return;
          // }

          const maybeNote = await this.wsUtils.getNoteFromDocument(
            editor.document
          );

          if (!maybeNote || maybeNote.length !== 1) {
            return;
          }
          this.sendRefreshMessage(this._panel!, maybeNote[0], true);
        }
        // )
      );

    // If the text document contents have changed, update the preview with the new
    // contents. This call is debounced every 200 ms
    this._onTextChanged = vscode.workspace.onDidChangeTextDocument(
      _.debounce(this.updatePreviewPanel, 200),
      this
    );
  }

  /** Rewrites the image URLs to use VSCode's webview URIs, which is required to
   * access files from the preview.
   *
   * The results of this is cached based on the note content hash, so repeated
   * calls should not be excessively expensive.
   */
  // private rewriteImageUrls = memoize({
  //   fn: (note: NoteProps, panel: vscode.WebviewPanel) => {
  //     const parser = MDUtilsV5.procRemarkFull({
  //       dest: DendronASTDest.MD_DENDRON,
  //       engine: this._ext.getEngine(),
  //       fname: note.fname,
  //       vault: note.vault,
  //     });
  //     const tree = parser.parse(note.body);
  //     // ^preview-rewrites-images
  //     visit(
  //       tree,
  //       [DendronASTTypes.IMAGE, DendronASTTypes.EXTENDED_IMAGE],
  //       (image: Image) => {
  //         if (!isWebUri(image.url)) {
  //           makeImageUrlFullPath({ node: image, proc: parser });
  //           image.url = panel.webview
  //             .asWebviewUri(vscode.Uri.file(image.url))
  //             .toString();
  //         }
  //       }
  //     );
  //     return {
  //       ...note,
  //       body: parser.stringify(tree),
  //     };
  //   },
  //   keyFn: (note) => note.id,
  //   shouldUpdate: (previous, current) =>
  //     previous.contentHash !== current.contentHash,
  // });

  /**
   * Notify preview webview panel to display latest contents
   *
   * @param panel panel to notify
   * @param note note to display
   * @param isFullRefresh If true, sync contents of note with what's being seen in active editor.
   * This will be true in cases where user switches between tabs or opens/closes notes without saving, as contents of notes may not match engine notes.
   * Otherwise display contents of note
   */
  private async sendRefreshMessage(
    panel: vscode.WebviewPanel,
    note: NoteProps,
    isFullRefresh: boolean
  ) {
    if (this.isVisible()) {
      // Engine state has not changed so do not sync. This is for displaying updated text only

      // If full refresh is required, sync note with contents in active text editor
      const textDocument = vscode.window.activeTextEditor?.document;
      if (textDocument && isFullRefresh) {
        note = await this._textDocumentService.applyTextDocumentToNoteProps(
          note,
          textDocument
        );
      }
      // TODO: Add back once mdutils works in web ext.
      // note = this.rewriteImageUrls(note, panel);

      let html = "";
      const resp = await this.noteRenderer.renderNote({
        id: note.id,
        note,
      });

      if (resp.error) {
        vscode.window.showErrorMessage(
          `Problem Rendering Note: ${resp.error?.message}`
        );
        // TODO: log error
        html = `Problem Rendering Note: ${resp.error?.message}`;
      } else {
        html = resp.data!;
      }

      const data: OnUpdatePreviewHTMLData = {
        note,
        html,
      };

      try {
        return panel.webview.postMessage({
          type: DMessageEnum.ON_UPDATE_PREVIEW_HTML,
          data,
          source: "vscode",
        } as OnUpdatePreviewHTMLMsg);
      } catch (err) {
        this.logger.info({
          ctx: "sendRefreshMessage",
          state: "webview is disposed",
        });
        return;
      }
    }

    return;
  }

  private sendLockMessage(
    panel: vscode.WebviewPanel | undefined,
    isLocked: boolean
  ) {
    try {
      return panel?.webview.postMessage({
        type: isLocked
          ? NoteViewMessageEnum.onLock
          : NoteViewMessageEnum.onUnlock,
        data: {},
        source: "vscode",
      } as NoteViewMessage);
    } catch (err) {
      this.logger.info({
        ctx: "sendLockMessage",
        state: "webview is disposed",
      });
      return;
    }
  }

  /**
   * If panel is visible, update preview panel with text document changes
   */
  private async updatePreviewPanel(
    textDocument: vscode.TextDocumentChangeEvent
  ) {
    if (textDocument.document.isDirty === false) {
      return;
    }
    if (this.isVisible() && !(await this.isLockedAndDirty())) {
      const note =
        await this._textDocumentService.processTextDocumentChangeEvent(
          textDocument
        );
      if (note) {
        return this.sendRefreshMessage(this._panel!, note, false);
      }
    }
    return undefined;
  }

  private initWithNote: NoteProps | undefined;
}
