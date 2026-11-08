import {
	Button,
	Caption,
	Container,
	Control,
	InputSearch,
	Operator,
	StackPanel,
} from '@aeco-dev/gui';

import ops from '../../ops.js';
import { formatDropboxMissingScopeHelp, isSupportedConnectorFilename } from './api.js';
import { DROPBOX_DRAG_TYPE } from './const.js';
import { ensureDropboxState } from './state.js';

const COLUMNS = [
	{ key: 'name', label: 'Name', className: 'FileManager-col-name' },
	{ key: 'modified', label: 'Date modified', className: 'FileManager-col-modified' },
	{ key: 'type', label: 'Type', className: 'FileManager-col-type' },
	{ key: 'size', label: 'Size', className: 'FileManager-col-size' },
];

function parentPath( path ) {

	const parts = String( path || '' ).split( '/' ).filter( Boolean );
	parts.pop();
	return parts.length ? `/${ parts.join( '/' ) }` : '';

}

function crumbParts( path ) {

	const parts = String( path || '' ).split( '/' ).filter( Boolean );
	const crumbs = [ { label: 'Dropbox', path: '' } ];
	let current = '';
	for ( const part of parts ) {

		current += `/${ part }`;
		crumbs.push( { label: part, path: current } );

	}

	return crumbs;

}

function extensionOf( name ) {

	const base = String( name || '' ).split( '/' ).pop() || '';
	const dot = base.lastIndexOf( '.' );
	if ( dot <= 0 ) return '';
	return base.slice( dot + 1 ).toLowerCase();

}

function fileType( entry ) {

	if ( entry.isFolder ) return 'File folder';
	const ext = extensionOf( entry.name );
	const known = {
		ifc: 'IFC model',
		ifcview: 'IFC view',
		ifcfed: 'Federation',
		zip: 'ZIP archive',
		json: 'JSON file',
		pdf: 'PDF',
	};
	if ( known[ ext ] ) return known[ ext ];
	return ext ? `${ ext.toUpperCase() } file` : 'File';

}

function canSceneDrop( name ) {

	const lower = String( name || '' ).toLowerCase();
	return lower.endsWith( '.ifc' )
		|| lower.endsWith( '.ifcview' )
		|| lower.endsWith( '.ifcfed' )
		|| lower.endsWith( '.zip' );

}

function fileIcon( entry ) {

	if ( entry.isFolder ) return 'folder';
	const ext = extensionOf( entry.name );
	if ( ext === 'ifc' || ext === 'ifcview' || ext === 'ifcfed' ) return 'deployed_code';
	if ( ext === 'zip' ) return 'folder_zip';
	if ( ext === 'json' ) return 'data_object';
	if ( ext === 'pdf' ) return 'picture_as_pdf';
	if ( [ 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg' ].includes( ext ) ) return 'image';
	return 'draft';

}

function formatBytes( bytes ) {

	if ( bytes == null ) return '';
	if ( bytes < 1024 ) return `${ bytes } B`;
	const units = [ 'KB', 'MB', 'GB' ];
	let size = bytes / 1024;
	let unit = 0;
	while ( size >= 1024 && unit < units.length - 1 ) {

		size /= 1024;
		unit += 1;

	}

	const digits = size >= 10 ? 0 : 1;
	return `${ size.toFixed( digits ) } ${ units[ unit ] }`;

}

function formatModified( value ) {

	if ( ! value ) return '';
	const date = new Date( value );
	if ( Number.isNaN( date.getTime() ) ) return '';
	return date.toLocaleString( undefined, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	} );

}

function textButton( label, onClick ) {

	const button = new Button( label );
	button.onClick( ( event ) => {

		event?.preventDefault?.();
		onClick();

	} );
	return button;

}

function toolButton( icon, label, onClick ) {

	const button = new Operator( icon );
	button.addClass( 'FileManager-tool' );
	button.dom.title = label;
	button.dom.setAttribute( 'aria-label', label );
	button.onClick( ( event ) => {

		event?.preventDefault?.();
		if ( button.dom.getAttribute( 'aria-disabled' ) === 'true' ) return;
		onClick();

	} );
	return button;

}

function setToolEnabled( button, enabled ) {

	button.toggleClass( 'is-disabled', ! enabled );
	button.dom.setAttribute( 'aria-disabled', enabled ? 'false' : 'true' );

}

function icon( name ) {

	const node = document.createElement( 'span' );
	node.className = 'material-symbols-outlined';
	node.textContent = name;
	node.setAttribute( 'aria-hidden', 'true' );
	return node;

}

export class FileManager {

	constructor( { context, onConnect } ) {

		this.context = context;
		this.onConnect = onConnect;
		this.connected = false;
		this.path = '';
		this.history = [ '' ];
		this.historyIndex = 0;
		this.entries = [];
		this.selectedKey = '';
		this.query = '';
		this.sortKey = 'name';
		this.sortDir = 1;
		this.loading = false;
		this.error = '';
		this.notice = '';
		this._transfers = new Map();
		this._request = 0;
		this._menu = null;

		this.root = new Container().addClass( 'FileManager' );
		this.root.dom.tabIndex = 0;
		this.root.dom.setAttribute( 'aria-label', 'File Manager' );

		this.prompt = new StackPanel( { isVertical: true } ).addClass( 'FileManager-prompt' );
		this.prompt.add(
			new Caption( 'Connect Dropbox to browse the account as a file list.' ),
			textButton( 'Connect Dropbox', () => this.onConnect?.() ),
		);

		this.backButton = toolButton( 'arrow_back', 'Back', () => this.back() );
		this.forwardButton = toolButton( 'arrow_forward', 'Forward', () => this.forward() );
		this.upButton = toolButton( 'arrow_upward', 'Up', () => this.up() );
		this.refreshButton = toolButton( 'refresh', 'Refresh', () => void this.reload() );

		const toolbar = new StackPanel( { isVertical: false } )
			.addClass( 'FileManager-toolbar' )
			.gap( '0.1rem' )
			.setStyle( 'alignItems', [ 'center' ] )
			.add( this.backButton, this.forwardButton, this.upButton, this.refreshButton );

		this.crumbs = new Container().addClass( 'FileManager-address' );
		this.search = new InputSearch( 'Search this folder', () => {

			this.query = this.search.getValue();
			this.renderRows();

		} );
		this.search.addClass( 'FileManager-search-input' );
		this.search.setStyle( 'width', [ '100%' ] );
		const searchWrap = new Container().addClass( 'FileManager-search' ).add( this.search );

		this.list = new Control( document.createElement( 'div' ) ).addClass( 'FileManager-list' );
		this.table = document.createElement( 'table' );
		this.table.className = 'FileManager-table';
		this.headRow = document.createElement( 'tr' );
		const thead = document.createElement( 'thead' );
		thead.append( this.headRow );
		this.body = document.createElement( 'tbody' );
		this.table.append( thead, this.body );
		thead.addEventListener( 'click', ( event ) => event.stopPropagation() );
		this.list.dom.append( this.table );
		this.renderHead();

		this.status = new Container().addClass( 'FileManager-status' );

		this.browser = new Container().addClass( 'FileManager-browser' );
		this.browser.dom.hidden = true;
		this.browser.add( toolbar, this.crumbs, searchWrap, this.list, this.status );

		this.root.add( this.prompt, this.browser );
		this.bind();
		this.renderShell();

	}

	bind() {

		this.list.dom.addEventListener( 'click', ( event ) => {

			const row = event.target.closest( 'tr[data-path]' );
			if ( ! row || ! this.body.contains( row ) ) {

				this.selectedKey = '';
				this.renderRows();
				return;

			}

			this.selectRow( row.dataset.parentNav === '1' ? 'parent' : ( row.dataset.path || '' ) );

		} );

		this.list.dom.addEventListener( 'dblclick', ( event ) => {

			const row = event.target.closest( 'tr[data-path]' );
			if ( ! row || ! this.body.contains( row ) ) return;
			event.preventDefault();
			void this.activatePath( row.dataset.path || '', row.dataset.parentNav === '1' );

		} );

		this.list.dom.addEventListener( 'contextmenu', ( event ) => {

			const row = event.target.closest( 'tr[data-path]' );
			if ( ! row || ! this.body.contains( row ) ) return;
			event.preventDefault();
			this.selectRow( row.dataset.parentNav === '1' ? 'parent' : ( row.dataset.path || '' ) );
			this.showMenu( event.clientX, event.clientY, row );

		} );

		this.root.dom.addEventListener( 'keydown', ( event ) => this.onKeyDown( event ) );
		this.list.dom.addEventListener( 'scroll', () => this.closeMenu() );
		this.list.dom.addEventListener( 'dragstart', ( event ) => {

			const row = event.target.closest( 'tr[data-path]' );
			if ( ! row || row.dataset.parentNav === '1' || row.getAttribute( 'draggable' ) !== 'true' ) return;
			const entry = this.entries.find( ( item ) => item.path === row.dataset.path );
			if ( ! entry ) {

				event.preventDefault();
				return;

			}

			event.dataTransfer.setData( DROPBOX_DRAG_TYPE, JSON.stringify( { path: entry.path, name: entry.name } ) );
			event.dataTransfer.setData( 'text/plain', entry.name );
			event.dataTransfer.effectAllowed = 'copy';
			row.classList.add( 'is-dragging' );
			this.selectRow( entry.path );

		} );
		this.list.dom.addEventListener( 'dragend', () => {

			this.list.dom.querySelectorAll( '.is-dragging' ).forEach( ( node ) => node.classList.remove( 'is-dragging' ) );

		} );

	}

	setConnected( connected ) {

		this.connected = connected;
		if ( ! connected ) {

			this._request += 1;
			this.loading = false;
			this.entries = [];
			this.error = '';
			this.notice = '';
			this.closeMenu();

		}

		this.renderShell();

	}

	async open( path, { record = true } = {} ) {

		const next = path ?? '';
		const request = ++ this._request;
		this.path = next;
		this.loading = true;
		this.error = '';
		this.notice = '';
		this.selectedKey = '';
		this.connected = true;
		this.query = '';
		this.search.setValue( '' );
		if ( record ) this.pushHistory( next );
		this.renderShell();

		try {

			const result = await ops.Dropbox.Explore( next );
			if ( request !== this._request ) return;
			if ( result?.status === 'CANCELLED' ) {

				this.setConnected( false );
				return;

			}

			this.entries = result?.result?.entries ?? [];
			this.loading = false;
			this.renderShell();

		} catch ( error ) {

			if ( request !== this._request ) return;
			console.error( error );
			this.loading = false;
			this.entries = [];
			this.error = formatDropboxMissingScopeHelp( error );
			this.renderShell();

		}

	}

	reload() {

		return this.open( this.path, { record: false } );

	}

	back() {

		if ( this.historyIndex <= 0 ) return;
		this.historyIndex -= 1;
		void this.open( this.history[ this.historyIndex ], { record: false } );

	}

	forward() {

		if ( this.historyIndex >= this.history.length - 1 ) return;
		this.historyIndex += 1;
		void this.open( this.history[ this.historyIndex ], { record: false } );

	}

	up() {

		if ( ! this.path ) return;
		void this.open( parentPath( this.path ) );

	}

	pushHistory( path ) {

		if ( this.history[ this.historyIndex ] === path ) return;
		this.history = this.history.slice( 0, this.historyIndex + 1 );
		this.history.push( path );
		this.historyIndex = this.history.length - 1;

	}

	visibleEntries() {

		const query = this.query.trim().toLowerCase();
		const rows = this.entries.filter( ( entry ) => {

			if ( ! query ) return true;
			return entry.name.toLowerCase().includes( query ) || entry.path.toLowerCase().includes( query );

		} );
		const dir = this.sortDir;
		const key = this.sortKey;
		rows.sort( ( left, right ) => {

			if ( left.isFolder !== right.isFolder ) return left.isFolder ? - 1 : 1;
			return compareEntry( left, right, key ) * dir;

		} );
		return rows;

	}

	renderShell() {

		this.prompt.dom.hidden = this.connected;
		this.browser.dom.hidden = ! this.connected;
		if ( ! this.connected ) return;
		setToolEnabled( this.backButton, this.historyIndex > 0 );
		setToolEnabled( this.forwardButton, this.historyIndex < this.history.length - 1 );
		setToolEnabled( this.upButton, Boolean( this.path ) );
		this.renderCrumbs();
		this.renderHead();
		this.renderRows();
		this.renderStatus();

	}

	renderCrumbs() {

		const crumbs = crumbParts( this.path );
		this.crumbs.dom.replaceChildren();
		crumbs.forEach( ( crumb, index ) => {

			if ( index > 0 ) {

				const separator = icon( 'chevron_right' );
				separator.classList.add( 'FileManager-sep' );
				this.crumbs.dom.append( separator );

			}

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'FileManager-crumb';
			button.textContent = crumb.label;
			const current = index === crumbs.length - 1;
			if ( current ) button.setAttribute( 'aria-current', 'page' );
			else {

				button.addEventListener( 'click', () => void this.open( crumb.path ) );

			}

			this.crumbs.dom.append( button );

		} );

	}

	renderHead() {

		this.headRow.replaceChildren();
		for ( const column of COLUMNS ) {

			const cell = document.createElement( 'th' );
			cell.className = column.className;
			cell.scope = 'col';
			const active = this.sortKey === column.key;
			cell.setAttribute( 'aria-sort', active ? ( this.sortDir > 0 ? 'ascending' : 'descending' ) : 'none' );
			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'FileManager-sort';
			const mark = active ? ( this.sortDir > 0 ? ' \u25B2' : ' \u25BC' ) : '';
			button.textContent = `${ column.label }${ mark }`;
			button.addEventListener( 'click', () => this.setSort( column.key ) );
			cell.append( button );
			this.headRow.append( cell );

		}

	}

	setSort( key ) {

		if ( this.sortKey === key ) this.sortDir *= - 1;
		else {

			this.sortKey = key;
			this.sortDir = key === 'size' ? - 1 : 1;

		}

		this.renderHead();
		this.renderRows();

	}

	renderRows() {

		const rows = this.connected ? this.visibleEntries() : [];
		const fragment = document.createDocumentFragment();
		if ( this.path && ! this.query.trim() ) fragment.append( this.parentRow() );

		if ( this.loading ) fragment.append( messageRow( 'Loading…' ) );
		else if ( this.error ) fragment.append( messageRow( this.error ) );
		else if ( ! rows.length ) {

			fragment.append( messageRow( this.query.trim() ? 'No matching files.' : 'This folder is empty.' ) );

		}

		for ( const entry of rows ) fragment.append( this.entryRow( entry ) );
		this.body.replaceChildren( fragment );
		this.renderStatus();

	}

	parentRow() {

		const row = document.createElement( 'tr' );
		row.dataset.path = parentPath( this.path );
		row.dataset.parentNav = '1';
		row.dataset.kind = 'parent';
		if ( this.selectedKey === 'parent' ) row.classList.add( 'is-current' );
		const name = document.createElement( 'td' );
		name.className = 'FileManager-col-name';
		const label = document.createElement( 'span' );
		label.className = 'FileManager-name';
		label.append( icon( 'arrow_upward' ), document.createTextNode( '..' ) );
		name.append( label );
		row.append( name, blankCell( 'FileManager-col-modified' ), blankCell( 'FileManager-col-type' ), blankCell( 'FileManager-col-size' ) );
		return row;

	}

	entryRow( entry ) {

		const row = document.createElement( 'tr' );
		row.dataset.path = entry.path;
		row.dataset.kind = entry.isFolder ? 'folder' : 'file';
		if ( ! entry.isFolder && canSceneDrop( entry.name ) ) row.draggable = true;
		this.applyRowState( row, entry.path );
		const name = document.createElement( 'td' );
		name.className = 'FileManager-col-name';
		const label = document.createElement( 'span' );
		label.className = 'FileManager-name';
		label.title = entry.path;
		label.append( icon( fileIcon( entry ) ), document.createTextNode( entry.name ) );
		name.append( label );
		row.append(
			name,
			metaCell( 'FileManager-col-modified', entry.isFolder ? '' : formatModified( entry.modified ) ),
			metaCell( 'FileManager-col-type', fileType( entry ) ),
			metaCell( 'FileManager-col-size', entry.isFolder ? '' : formatBytes( entry.size ) ),
		);
		return row;

	}

	renderStatus() {

		let text;
		if ( this.error ) text = this.error;
		else if ( this.notice ) text = this.notice;
		else if ( this.loading ) text = 'Loading…';
		else {

			const shownRows = this.visibleEntries();
			const total = this.entries.length;
			const selected = shownRows.find( ( entry ) => entry.path === this.selectedKey );
			if ( this.selectedKey === 'parent' && ! this.query.trim() ) text = '..';
			else if ( selected ) text = selected.name;
			else if ( this.query.trim() ) text = `${ shownRows.length } of ${ total }`;
			else text = total === 1 ? '1 item' : `${ total } items`;

		}

		this.status.setTextContent( text );
		this.status.toggleClass( 'is-error', Boolean( this.error ) );

	}

	applyRowState( row, path ) {

		const local = ensureDropboxState( this.context ).localFiles.has( path );
		const transfer = this._transfers.get( path );
		const downloading = transfer?.phase === 'downloading';
		row.classList.toggle( 'is-local', local && ! downloading );
		row.classList.toggle( 'is-downloading', downloading );
		row.classList.toggle( 'is-indeterminate', downloading && transfer.progress == null );
		row.classList.toggle( 'is-current', path === this.selectedKey );
		if ( downloading && transfer.progress != null ) row.style.setProperty( '--download', `${ Math.round( transfer.progress * 100 ) }%` );
		else row.style.removeProperty( '--download' );

	}

	rowForPath( path ) {

		for ( const row of this.body.querySelectorAll( 'tr[data-path]' ) ) {

			if ( row.dataset.parentNav === '1' ) continue;
			if ( row.dataset.path === path ) return row;

		}

		return null;

	}

	setTransfer( path, transfer ) {

		if ( ! transfer || transfer.phase === 'local' ) this._transfers.delete( path );
		else this._transfers.set( path, transfer );
		const row = this.rowForPath( path );
		if ( row ) this.applyRowState( row, path );
		if ( transfer?.phase === 'downloading' ) {

			const name = transfer.name || path.split( '/' ).filter( Boolean ).pop() || 'file';
			const pct = transfer.progress == null ? '' : ` ${ Math.round( transfer.progress * 100 ) }%`;
			this.error = '';
			this.notice = `Downloading ${ name }${ pct }`;

		} else if ( ! this._transfers.size ) {

			this.notice = '';

		}

		this.renderStatus();

	}

	clearTransfers() {

		this._transfers.clear();
		this.notice = '';
		this.renderRows();

	}

	selectRow( key ) {

		this.selectedKey = key;
		if ( ! this._transfers.size ) this.notice = '';
		for ( const row of this.body.querySelectorAll( 'tr[data-path]' ) ) {

			const rowKey = row.dataset.parentNav === '1' ? 'parent' : ( row.dataset.path || '' );
			row.classList.toggle( 'is-current', rowKey === key );

		}

		this.renderStatus();
		this.root.dom.focus( { preventScroll: true } );

	}

	onKeyDown( event ) {

		if ( event.target.closest( 'input, textarea' ) ) return;
		if ( ! this.connected ) return;
		if ( event.altKey && event.key === 'ArrowLeft' ) {

			event.preventDefault();
			this.back();
			return;

		}

		if ( event.altKey && event.key === 'ArrowRight' ) {

			event.preventDefault();
			this.forward();
			return;

		}

		if ( event.key === 'Backspace' ) {

			event.preventDefault();
			this.up();
			return;

		}

		const rows = [ ...this.body.querySelectorAll( 'tr[data-path]' ) ];
		if ( ! rows.length ) return;
		const current = rows.findIndex( ( row ) => row.classList.contains( 'is-current' ) );
		if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {

			event.preventDefault();
			const next = event.key === 'ArrowDown'
				? Math.min( rows.length - 1, Math.max( 0, current + 1 ) )
				: Math.max( 0, current <= 0 ? 0 : current - 1 );
			const row = rows[ next ];
			this.selectRow( row.dataset.parentNav === '1' ? 'parent' : ( row.dataset.path || '' ) );
			row.scrollIntoView( { block: 'nearest' } );
			return;

		}

		if ( event.key === 'Enter' ) {

			const row = current >= 0 ? rows[ current ] : null;
			if ( ! row ) return;
			event.preventDefault();
			void this.activatePath( row.dataset.path || '', row.dataset.parentNav === '1' );

		}

	}

	async activatePath( path, isParent ) {

		if ( isParent ) {

			await this.open( path );
			return;

		}

		const entry = this.entries.find( ( item ) => item.path === path );
		if ( ! entry ) return;
		if ( entry.isFolder ) {

			await this.open( entry.path );
			return;

		}

		if ( ! isSupportedConnectorFilename( entry.name ) ) {

			this.notice = 'Bonsai opens IFC, IFC view, federation, ZIP, and JSON files.';
			this.renderStatus();
			return;

		}

		this.error = '';
		this.renderStatus();
		try {

			const opened = await ops.Dropbox.OpenFile( entry.path, entry.name );
			if ( opened?.status === 'CANCELLED' ) throw new Error( 'The viewer is not ready yet.' );

		} catch ( error ) {

			console.error( error );
			this.notice = '';
			this.error = error instanceof Error ? error.message : String( error );

		}

		this.renderStatus();

	}

	showMenu( x, y, row ) {

		this.closeMenu();
		const isParent = row.dataset.parentNav === '1';
		const entry = this.entries.find( ( item ) => item.path === row.dataset.path );
		const actions = [];
		if ( isParent || entry?.isFolder ) {

			actions.push( { label: 'Open', run: () => void this.activatePath( row.dataset.path || '', isParent ) } );

		} else if ( entry && isSupportedConnectorFilename( entry.name ) ) {

			actions.push( { label: 'Open', run: () => void this.activatePath( entry.path, false ) } );

		}

		const copyPath = row.dataset.path || '/';
		actions.push( { label: 'Copy path', run: () => void this.copyPath( copyPath ) } );

		const menu = document.createElement( 'div' );
		menu.className = 'FileManager-menu';
		menu.tabIndex = - 1;
		for ( const action of actions ) {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'FileManager-menu-item';
			button.textContent = action.label;
			button.addEventListener( 'click', () => {

				this.closeMenu();
				action.run();

			} );
			menu.append( button );

		}

		document.body.append( menu );
		const rect = menu.getBoundingClientRect();
		const left = Math.min( x, window.innerWidth - rect.width - 8 );
		const top = Math.min( y, window.innerHeight - rect.height - 8 );
		menu.style.left = `${ Math.max( 8, left ) }px`;
		menu.style.top = `${ Math.max( 8, top ) }px`;
		this._menu = menu;
		this._onMenuPointer = ( event ) => {

			if ( ! menu.contains( event.target ) ) this.closeMenu();

		};

		this._onMenuKey = ( event ) => {

			if ( event.key === 'Escape' ) this.closeMenu();

		};

		setTimeout( () => {

			document.addEventListener( 'pointerdown', this._onMenuPointer );
			document.addEventListener( 'keydown', this._onMenuKey );

		}, 0 );

	}

	closeMenu() {

		this._menu?.remove();
		this._menu = null;
		if ( this._onMenuPointer ) document.removeEventListener( 'pointerdown', this._onMenuPointer );
		if ( this._onMenuKey ) document.removeEventListener( 'keydown', this._onMenuKey );
		this._onMenuPointer = null;
		this._onMenuKey = null;

	}

	async copyPath( path ) {

		const value = path || '/';
		try {

			await navigator.clipboard.writeText( value );
			this.notice = `Copied ${ value }`;
			this.error = '';

		} catch ( error ) {

			console.error( error );
			this.notice = '';
			this.error = 'Could not copy the path.';

		}

		this.renderStatus();

	}

}

function compareEntry( left, right, key ) {

	if ( key === 'size' ) return ( left.size ?? - 1 ) - ( right.size ?? - 1 );
	if ( key === 'modified' ) return String( left.modified || '' ).localeCompare( String( right.modified || '' ) );
	if ( key === 'type' ) return fileType( left ).localeCompare( fileType( right ), undefined, { sensitivity: 'base' } );
	return left.name.localeCompare( right.name, undefined, { sensitivity: 'base', numeric: true } );

}

function blankCell( className ) {

	const cell = document.createElement( 'td' );
	cell.className = className;
	return cell;

}

function metaCell( className, text ) {

	const cell = blankCell( className );
	cell.textContent = text;
	return cell;

}

function messageRow( text ) {

	const row = document.createElement( 'tr' );
	row.className = 'FileManager-message';
	const cell = document.createElement( 'td' );
	cell.colSpan = COLUMNS.length;
	cell.textContent = text;
	row.append( cell );
	return row;

}
