// This file was generated with the assistance of an AI coding tool.

import { Caption, Container, InputText, StackPanel, Text } from '@aeco-dev/gui';

import ops from '../../ops.js';
import { Terminal, Viewer } from '../../tool/index.js';
import {
	applyCompletion,
	argSuggestions,
	commandCatalog,
	commandContext,
	extractChain,
	formatArg,
	formatSignature,
	getCompletions,
	matchCommands,
	resolveCommand,
} from '../code.scripting/commands.js';
import { commandScope } from '../code.scripting/core.js';

const LIMIT = 10;
const SEQUENCE_MS = 800;
const TOP_LEVEL = [ 'bonsai', '$sel', '$entity', '$model', '$last' ];

function isEditable( element ) {

	const tag = element?.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean( element?.isContentEditable );

}

function flyActive() {

	try {

		return Boolean( Viewer.get()?.flyActive?.() );

	} catch {

		return false;

	}

}

/**
 * AutoCAD-style command line over the viewport. Typing `c` `d` there opens
 * it, empty; the menu lists matching commands, then the values of the
 * argument under the cursor. Lines run through Terminal.Execute, in the
 * terminal panel's active session, so history and variables are shared.
 * Not a panel: the host constructs it and skips mounting (no spec).
 */
class CommandBarUI {

	static id = 'code.terminal';

	constructor( { context } ) {

		this.context = context;
		this.items = [];
		this.index = - 1;
		this.navigated = false;
		this.mode = null;
		this.historyIndex = - 1;
		this.executing = false;
		this._pendingC = 0;

		this._onGlobalKeyDown = ( event ) => this._openFromKey( event );
		this._onPointerDown = ( event ) => {

			if ( this.isOpen() && ! this.root.dom.contains( event.target ) ) this.close();

		};

		this.build();
		window.addEventListener( 'keydown', this._onGlobalKeyDown, true );
		document.addEventListener( 'pointerdown', this._onPointerDown );

		context.terminal = context.terminal || {};
		context.terminal.commandBar = this;

	}

	build() {

		this.menu = new StackPanel( { isVertical: true } ).addClass( 'bonsai-commandbar-menu' );
		this.hint = new Caption( '' ).addClass( 'bonsai-commandbar-hint' );

		this.input = new InputText();
		this.input.dom.spellcheck = false;
		this.input.dom.placeholder = 'Command…  e.g. SetStandardView TOP';
		this.input.dom.setAttribute( 'aria-label', 'Command' );
		this.input.dom.addEventListener( 'input', () => this.refresh() );
		this.input.dom.addEventListener( 'keydown', ( event ) => this._onInputKeyDown( event ) );

		const prompt = new Text( '›' ).addClass( 'bonsai-commandbar-prompt' );
		const line = new StackPanel( { isVertical: false } )
			.addClass( 'bonsai-commandbar-line' )
			.add( prompt, this.input );

		this.result = new Text( '' ).addClass( 'bonsai-commandbar-result' );

		this.root = new Container()
			.addClass( 'bonsai-commandbar' )
			.add( this.menu, this.hint, line, this.result );
		this.root.setHidden( true );

	}

	isOpen() {

		return Boolean( this.root.dom.isConnected && ! this.root.dom.hidden );

	}

	open( text = '' ) {

		const mount = this.context.viewport ?? document.body;
		if ( this.root.dom.parentNode !== mount ) mount.appendChild( this.root.dom );
		this.root.dom.classList.toggle( 'is-fixed', mount === document.body );
		this.root.setHidden( false );
		this.historyIndex = - 1;
		this._setText( text, text.length );
		this.input.dom.focus();
		this.refresh();
		return this;

	}

	close() {

		this.root.setHidden( true );
		this._showItems( [] );
		this.hint.setValue( '' );
		if ( document.activeElement === this.input.dom ) this.input.dom.blur();
		return this;

	}

	// Only from the viewport (or nothing focused), never from a text field,
	// and not while fly mode owns the keyboard.
	_openFromKey( event ) {

		if ( this.isOpen() || event.defaultPrevented || event.isComposing ) return;
		if ( event.ctrlKey || event.metaKey || event.altKey ) return;
		const active = document.activeElement;
		if ( isEditable( active ) ) return;
		const inViewport = ! active || active === document.body || active === document.documentElement
			|| Boolean( this.context.viewport?.contains( active ) );
		if ( ! inViewport || flyActive() ) return;

		// `c` then `d` within SEQUENCE_MS. The `c` still reaches the viewer.
		const key = event.key.toLowerCase();
		const armed = this._pendingC && event.timeStamp - this._pendingC < SEQUENCE_MS;
		this._pendingC = key === 'c' ? event.timeStamp : 0;
		if ( key !== 'd' || ! armed ) return;
		event.preventDefault();
		event.stopPropagation();
		this.open();

	}

	_setText( text, cursor ) {

		this.input.setValue( text );
		this.input.dom.selectionStart = cursor;
		this.input.dom.selectionEnd = cursor;

	}

	_catalog() {

		return commandCatalog( ops.registry );

	}

	_session() {

		const guid = this.context.terminal?.activeTerminalGuid;
		return Terminal.get( guid ) ?? Terminal.list()[ 0 ] ?? Terminal.create();

	}

	refresh() {

		const dom = this.input.dom;
		const text = dom.value;
		const cursor = dom.selectionStart ?? text.length;
		const catalog = this._catalog();

		const ctx = commandContext( text, cursor, catalog );
		if ( ctx ) {

			this.mode = 'args';
			const { arg, items } = argSuggestions( ctx );
			const args = ctx.command.args.map( ( item, i ) => ( i === ctx.argIndex ? `‹${ formatArg( item ) }›` : formatArg( item ) ) );
			this.hint.setValue( arg || args.length === 0
				? `${ ctx.command.name }  ${ args.join( ', ' ) || 'no arguments' }`
				: `${ ctx.command.name }  ${ args.join( ', ' ) }  (no more arguments)` );
			const more = ctx.argIndex + 1 < ctx.command.args.length;
			this._showItems( items.map( ( item ) => ( {
				label: item.label,
				detail: arg ? formatArg( arg ) : '',
				apply: () => {

					const tail = ctx.form === 'line' && more ? ' ' : '';
					const before = text.slice( 0, ctx.partialStart ) + item.insert + tail;
					return { text: before + text.slice( cursor ), cursor: before.length };

				},
			} ) ) );
			return;

		}

		this.mode = 'commands';
		const chain = extractChain( text, cursor );
		const items = matchCommands( chain, catalog, LIMIT ).map( ( command ) => ( {
			label: command.name,
			detail: command.label,
			signature: formatSignature( command ),
			command,
			apply: () => {

				const after = text.slice( cursor );
				const space = command.args.length && ! /^[\s(]/.test( after ) ? ' ' : '';
				const before = text.slice( 0, cursor - chain.length ) + command.name + space;
				return { text: before + after, cursor: before.length };

			},
		} ) );

		// Variables and properties, for plain JavaScript: `$model.byT…`.
		if ( chain ) {

			const vars = this._session().vars ?? {};
			const scope = commandScope( this.context, vars );
			const names = [ ...new Set( [ ...TOP_LEVEL, ...Object.keys( vars ) ] ) ];
			const { completions } = getCompletions( text, cursor, scope, names );
			for ( const name of completions.slice( 0, LIMIT - items.length ) ) {

				if ( items.some( ( item ) => item.label === name ) ) continue;
				items.push( {
					label: name,
					detail: '',
					apply: () => applyCompletion( text, cursor, chain, name ),
				} );

			}

		}

		this.hint.setValue( items[ 0 ]?.command ? this._commandHint( items[ 0 ].command ) : '' );
		this._showItems( items );

	}

	_commandHint( command ) {

		const signature = formatSignature( command );
		return `${ command.label }${ signature ? `  —  ${ signature }` : '' }`;

	}

	_showItems( items ) {

		this.items = items;
		this.index = items.length ? 0 : - 1;
		this.navigated = false;
		this.menu.clear();

		items.forEach( ( item, i ) => {

			const row = new Container().addClass( 'bonsai-commandbar-item' );
			row.add( new Text( item.label ).addClass( 'bonsai-commandbar-name' ) );
			if ( item.detail ) row.add( new Text( item.detail ).addClass( 'bonsai-commandbar-detail' ) );
			if ( item.signature ) row.add( new Text( item.signature ).addClass( 'bonsai-commandbar-signature' ) );
			row.dom.addEventListener( 'mousedown', ( event ) => {

				event.preventDefault();
				this._accept( i );

			} );
			this.menu.add( row );

		} );

		this.menu.setHidden( items.length === 0 );
		this._highlight( this.index );

	}

	_highlight( index ) {

		this.index = index;
		const rows = this.menu.dom.children;
		for ( let i = 0; i < rows.length; i ++ ) rows[ i ].classList.toggle( 'is-active', i === index );
		rows[ index ]?.scrollIntoView( { block: 'nearest' } );
		const command = this.items[ index ]?.command;
		if ( command ) this.hint.setValue( this._commandHint( command ) );

	}

	_move( delta ) {

		const count = this.items.length;
		this.navigated = true;
		this._highlight( ( this.index + delta + count ) % count );

	}

	// Returns the accepted item, after the text and menu have moved on.
	_accept( index ) {

		const item = this.items[ index ];
		if ( ! item ) return null;
		const { text, cursor } = item.apply();
		this._setText( text, cursor );
		this.input.dom.focus();
		this.refresh();
		return item;

	}

	// A half-typed command name (`grid`) is completed rather than run.
	_typingCommandName() {

		if ( this.mode !== 'commands' || ! this.items[ this.index ]?.command ) return false;
		const text = this.input.getValue().trim();
		return /^[\w.$]+$/.test( text ) && ! resolveCommand( text, this._catalog() );

	}

	_onInputKeyDown( event ) {

		event.stopPropagation();
		const menuOpen = this.items.length > 0;

		if ( event.key === 'Escape' ) {

			event.preventDefault();
			if ( menuOpen ) this._showItems( [] );
			else this.close();

		} else if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {

			event.preventDefault();
			const delta = event.key === 'ArrowDown' ? 1 : - 1;
			if ( menuOpen ) this._move( delta );
			else this._historyStep( delta );

		} else if ( event.key === 'Tab' ) {

			event.preventDefault();
			if ( menuOpen ) this._accept( this.index );
			else this.refresh();

		} else if ( event.key === 'Enter' ) {

			event.preventDefault();
			if ( menuOpen && ( this.navigated || this._typingCommandName() ) ) {

				const item = this._accept( this.index );
				const needsArgs = item?.command?.args.some( ( arg ) => ! arg.optional );
				if ( item?.command && ! needsArgs ) void this.submit();

			} else {

				void this.submit();

			}

		}

	}

	_historyStep( delta ) {

		const commands = this._session().commandHistory;
		if ( commands.length === 0 ) return;
		if ( this.historyIndex < 0 ) this.historyIndex = commands.length;
		this.historyIndex = Math.max( 0, Math.min( commands.length, this.historyIndex + delta ) );
		const text = commands[ this.historyIndex ] ?? '';
		this._setText( text, text.length );
		this._showItems( [] );

	}

	// Enter on an empty line repeats the last command, as in AutoCAD.
	async submit() {

		if ( this.executing ) return;
		const session = this._session();
		const command = this.input.getValue().trim() || session.commandHistory.at( - 1 ) || '';
		if ( ! command ) return;

		this.executing = true;
		this._setText( '', 0 );
		this._showItems( [] );
		this.hint.setValue( '' );

		try {

			const response = await ops.Terminal.Execute( command, session.guid );
			const { success = false, output = '' } = response?.result ?? {};
			const summary = output.split( '\n' ).slice( 0, 3 ).join( ' ' ).slice( 0, 240 );
			this._showResult( `${ command }${ summary ? `  →  ${ summary }` : '' }`, success );

		} catch ( error ) {

			this._showResult( `${ command }  →  ${ error?.message ?? error }`, false );

		} finally {

			this.executing = false;
			this.historyIndex = - 1;
			this.input.dom.focus();

		}

	}

	_showResult( text, success ) {

		this.result.setValue( text );
		this.result.dom.classList.toggle( 'is-error', ! success );

	}

	destroy() {

		window.removeEventListener( 'keydown', this._onGlobalKeyDown, true );
		document.removeEventListener( 'pointerdown', this._onPointerDown );
		this.root.dom.remove();

	}

}

export default CommandBarUI;
