import {
	Button,
	Caption,
	Control,
	FloatingDialog,
	InputText,
	ScrollViewer,
	StackPanel,
	Text,
} from '@aeco-dev/gui';

import ops from '../../ops.js';
import { formatDropboxMissingScopeHelp } from './api.js';
import { dropboxConnector } from './connector.js';
import { FileManager } from './explorer.js';
import { ensureDropboxState } from './state.js';

const RIBBON_BUTTON_ID = 'RB_Dropbox';

function column( ...children ) {

	return new StackPanel( { isVertical: true } ).gap( '0.625rem' ).add( ...children );

}

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'flexWrap', [ 'wrap' ] )
		.add( ...children );

}

function note( text ) {

	return new Caption( text ).setStyle( 'whiteSpace', [ 'pre-wrap' ] );

}

function heading( label ) {

	return new Text( label ).setStyle( 'fontWeight', [ '600' ] );

}

function textButton( label, onClick ) {

	const button = new Button( label );
	button.onClick( ( event ) => {

		event?.preventDefault?.();
		onClick();

	} );
	return button;

}

function field( label, value ) {

	const input = new InputText( value ?? '' );
	input.setStyle( 'width', [ '100%' ] );
	const caption = new Text( label );
	caption.setStyle( 'fontSize', [ '0.7rem' ] );
	return {
		input,
		root: new StackPanel( { isVertical: true } ).gap( '0.15rem' ).add( caption, input ),
	};

}

class DropboxPanelUI {

	static id = 'dropbox';

	static spec = {
		group: 'file-manager',
		position: 'left',
		id: 'file-manager-panel',
		label: 'File Manager',
		icon: 'folder',
		title: 'File Manager',
		autoShow: false,
	};

	constructor( { context } ) {

		this.context = context;
		this.clientIdInput = null;
		this.syncFolderInput = null;
		this.authCodeInput = null;
		this.workspacePanel = null;
		this._pendingShow = null;
		this.body = column();
		this.explorer = new FileManager( {
			context,
			onConnect: () => this.dialog.show(),
		} );
		this.root = this.explorer.root;
		ensureDropboxState( context ).explorer = this.explorer;

		const scroller = new ScrollViewer( { scrollable: true, fill: true } );
		scroller.add( this.body );

		this.dialog = new FloatingDialog( {
			title: 'Dropbox',
			icon: 'cloud',
			panelStyles: { width: 'min(34rem, calc(100% - 1rem))', maxHeight: '82vh' },
		} );
		this.dialog.addClass( 'DropboxDialog' );
		this.dialog.content( scroller );
		this.dialog.onShow = () => {

			this.syncRibbon();
			void this.prepare();

		};

		this.dialog.onHide = () => this.syncRibbon();

		ensureDropboxState( context ).panel = this;
		void this.bootExplorer();

	}

	attach( workspacePanel ) {

		this.workspacePanel = workspacePanel;
		if ( ! this._pendingShow ) return;
		workspacePanel.show( this._pendingShow );
		this._pendingShow = null;

	}

	revealFileManager( select ) {

		const options = { select: Boolean( select ), open: true };
		if ( this.workspacePanel ) this.workspacePanel.show( options );
		else this._pendingShow = options;

	}

	async showFileManager( { select = false, path } = {} ) {

		const state = ensureDropboxState( this.context );
		this.revealFileManager( select );
		if ( ! state.connected ) {

			this.explorer.setConnected( false );
			return;

		}

		await this.explorer.open( path ?? this.explorer.path ?? '' );

	}

	hideFileManager() {

		this._pendingShow = null;
		this.explorer.setConnected( false );
		this.workspacePanel?.hide( { closeIfEmpty: true } );

	}

	async bootExplorer() {

		try {

			await ops.Dropbox.RefreshStatus();

		} catch ( error ) {

			console.error( error );
			return;

		}

		const state = ensureDropboxState( this.context );
		if ( state.connected ) await this.showFileManager( { select: false } );

	}

	toggle() {

		this.dialog.toggle();
		return this;

	}

	isVisible() {

		return Boolean( this.dialog?.isActive );

	}

	syncRibbon() {

		document.getElementById( RIBBON_BUTTON_ID )?.classList.toggle( 'Active', this.isVisible() );

	}

	async prepare() {

		await ops.Dropbox.RefreshStatus();
		const state = ensureDropboxState( this.context );
		if ( state.view === 'authorizing' ) {

			this.render();
			return;

		}

		state.view = state.connected ? 'browse' : 'connect';
		this.render();
		if ( state.connected && this.workspacePanel?.isVisible?.() ) await this.explorer.reload();

	}

	render() {

		this.body.clear();
		const state = ensureDropboxState( this.context );
		if ( state.view === 'authorizing' ) this.renderAuthorizing( state );
		else if ( state.view === 'browse' && state.connected ) this.renderBrowse( state );
		else this.renderConnect( state );

	}

	renderConnect( state ) {

		const children = [
			note( 'Dropbox uses OAuth with PKCE. Authorize file access, then paste the code Dropbox shows. Tokens stay encrypted in this browser. No redirect URI is required.' ),
			note( state.connected ? `Connected as ${ state.accountLabel || 'Dropbox' }.` : 'Not connected.' ),
		];

		this.clientIdInput = null;
		if ( state.usesBundledAppKey ) {

			children.push( note(
				`Dropbox app key is configured for this build (${ state.clientIdPreview || 'bundled' }). Enable file permissions on that app at dropbox.com/developers.`,
			) );

		} else {

			const client = field( 'Dropbox app key', state.clientId );
			this.clientIdInput = client.input;
			children.push( client.root );

		}

		const folder = field( 'Sync folder', state.syncFolderPath || '/bonsai-web' );
		this.syncFolderInput = folder.input;
		children.push( folder.root );
		children.push( note( 'The folder is created in your Dropbox on first sync. App-folder apps should use / or a subfolder such as /bonsai-web.' ) );

		if ( state.authError ) children.push( note( state.authError ) );

		children.push( row(
			textButton( 'Save settings', () => void this.saveSettings() ),
			textButton( state.connected ? 'Re-authenticate' : 'Authenticate', () => void this.beginAuthentication() ),
		) );

		if ( state.connected ) {

			children.push( textButton( 'Open File Manager', () => {

				void this.showFileManager( { select: true } );

			} ) );

		}

		this.body.add( ...children );

	}

	renderAuthorizing( state ) {

		const code = field( 'Authorization code', '' );
		this.authCodeInput = code.input;
		code.input.dom.setAttribute( 'autocapitalize', 'off' );
		code.input.dom.setAttribute( 'autocorrect', 'off' );
		code.input.dom.setAttribute( 'spellcheck', 'false' );

		const children = [
			note( 'Open the Dropbox page, approve access, then paste the authorization code or the whole callback URL.' ),
			code.root,
		];
		if ( state.authError ) children.push( note( state.authError ) );
		if ( state.authUrl ) {

			const link = document.createElement( 'a' );
			link.href = state.authUrl;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			link.textContent = state.authUrl;
			link.style.wordBreak = 'break-all';
			children.push( heading( 'Authorization URL' ) );
			children.push( new Control( link ) );

		} else {

			children.push( note( 'Preparing authorization link…' ) );

		}

		children.push( row(
			textButton( 'Complete authentication', () => void this.completeAuthentication() ),
			textButton( 'Cancel', () => {

				dropboxConnector.cancelAuth();
				state.authUrl = '';
				state.authError = '';
				state.view = 'connect';
				this.render();

			} ),
		) );
		this.body.add( ...children );

	}

	renderBrowse( state ) {

		const binding = state.binding;
		const children = [
			note( state.accountLabel
				? `Connected as ${ state.accountLabel }. Folder: ${ state.syncFolderPath }`
				: 'Connected to Dropbox.' ),
		];
		if ( binding?.path ) children.push( note( `Linked file: ${ binding.path }` ) );
		if ( state.pendingUploadCount > 0 ) {

			children.push( note( `${ state.pendingUploadCount } upload(s) queued until the next sync.` ) );

		}

		if ( state.authError ) children.push( note( state.authError ) );
		children.push( note( 'Folders and files are in the File Manager panel on the left. Double-click a model to open it.' ) );
		children.push( row(
			textButton( 'Open File Manager', () => {

				void this.showFileManager( { select: true } );

			} ),
			textButton( 'Account', () => {

				state.view = 'connect';
				this.render();

			} ),
			textButton( 'Sync now', () => void this.syncNow() ),
			textButton( 'Save project', () => void this.saveProject() ),
			textButton( 'Reload', () => void this.pullProject() ),
			textButton( 'Disconnect', () => void this.disconnect() ),
		) );

		this.body.add( ...children );

	}

	async saveSettings() {

		const state = ensureDropboxState( this.context );
		state.authError = '';
		try {

			const clientId = state.usesBundledAppKey ? '' : ( this.clientIdInput?.getValue?.() ?? '' );
			await ops.Dropbox.SaveSettings( clientId );
			const syncFolderPath = this.syncFolderInput?.getValue?.() ?? '';
			if ( syncFolderPath.trim() ) {

				await ops.Dropbox.SaveSyncFolder( syncFolderPath );

			}

			await ops.Dropbox.RefreshStatus();
			this.render();

		} catch ( error ) {

			console.error( error );
			state.authError = error instanceof Error ? error.message : String( error );
			this.render();

		}

	}

	async beginAuthentication() {

		const state = ensureDropboxState( this.context );
		state.authError = '';
		state.authUrl = '';
		try {

			await this.saveSettings();
			if ( state.authError ) return;
			const settings = await dropboxConnector.getSettings();
			if ( ! settings.clientId ) {

				throw new Error( 'Paste your Dropbox app key, save settings, then authenticate again.' );

			}

			state.view = 'authorizing';
			this.render();
			const begun = await ops.Dropbox.BeginAuth();
			if ( begun?.status === 'CANCELLED' ) throw new Error( 'Could not start Dropbox sign-in.' );
			state.authUrl = begun.result?.authUrl ?? state.authUrl;
			this.render();
			dropboxConnector.openAuthorizationPage( state.authUrl );

		} catch ( error ) {

			console.error( error );
			state.authError = error instanceof Error ? error.message : String( error );
			state.view = 'connect';
			this.render();

		}

	}

	async completeAuthentication() {

		const state = ensureDropboxState( this.context );
		const authCode = this.authCodeInput?.getValue?.() ?? '';
		if ( ! authCode.trim() ) {

			state.authError = 'Paste the authorization code from Dropbox.';
			this.render();
			return;

		}

		try {

			state.authError = '';
			const done = await ops.Dropbox.CompleteAuth( authCode );
			if ( done?.status === 'CANCELLED' ) throw new Error( 'Paste the authorization code from Dropbox.' );
			state.view = 'browse';
			this.render();
			await this.showFileManager( { select: true, path: '' } );

		} catch ( error ) {

			console.error( error );
			state.authError = formatDropboxMissingScopeHelp( error );
			this.render();

		}

	}

	async disconnect() {

		await ops.Dropbox.Disconnect();
		await ops.Dropbox.RefreshStatus();
		ensureDropboxState( this.context ).view = 'connect';
		this.hideFileManager();
		this.render();

	}

	async syncNow() {

		const state = ensureDropboxState( this.context );
		try {

			await ops.Dropbox.Sync();
			await ops.Dropbox.RefreshStatus();
			state.authError = '';
			this.render();
			if ( this.workspacePanel?.isVisible?.() ) await this.explorer.reload();

		} catch ( error ) {

			console.error( error );
			state.authError = formatDropboxMissingScopeHelp( error );
			this.render();

		}

	}

	async saveProject() {

		const state = ensureDropboxState( this.context );
		try {

			const saved = await ops.Dropbox.SaveProject();
			if ( saved?.status === 'CANCELLED' ) throw new Error( 'Connect Dropbox and open a model before saving.' );
			state.authError = saved.result?.queued
				? `Queued for upload: ${ saved.result.path }`
				: `Saved to Dropbox: ${ saved.result?.path ?? '' }`;
			await ops.Dropbox.RefreshStatus();
			if ( this.workspacePanel?.isVisible?.() ) await this.explorer.reload();
			this.render();

		} catch ( error ) {

			console.error( error );
			state.authError = formatDropboxMissingScopeHelp( error );
			this.render();

		}

	}

	async pullProject() {

		const state = ensureDropboxState( this.context );
		try {

			const pulled = await ops.Dropbox.PullProject();
			if ( pulled?.status === 'CANCELLED' ) throw new Error( 'This session has no Dropbox file to reload.' );
			state.authError = pulled.result?.changed ? 'Reloaded the linked file from Dropbox.' : 'Dropbox file is already up to date.';
			this.render();

		} catch ( error ) {

			console.error( error );
			state.authError = formatDropboxMissingScopeHelp( error );
			this.render();

		}

	}

}

export default [ DropboxPanelUI ];
