import {
	Button,
	Caption,
	Container,
	InputText,
	Operator,
	ScrollViewer,
	StackPanel,
	TabView,
	Text,
} from '@aeco-dev/gui';

import ops from '../../ops.js';
import { Terminal } from '../../tool/index.js';
import { scriptScope } from '../code.scripting/core.js';

const TOP_LEVEL = [
	'bonsai',
	'console', 'Math', 'JSON', 'Object', 'Array', 'Promise',
	'setTimeout', 'clearTimeout', 'fetch', 'performance',
];

function extractChain( text, cursorPos ) {

	let i = cursorPos;
	while ( i > 0 && /[\w$.]/.test( text[ i - 1 ] ) ) i --;
	return text.slice( i, cursorPos );

}

function allProps( obj ) {

	const seen = new Set();
	let cur = obj;
	while ( cur != null ) {

		for ( const key of Object.getOwnPropertyNames( cur ) ) {

			if ( ! key.startsWith( '__' ) ) seen.add( key );

		}

		cur = Object.getPrototypeOf( cur );
		if ( cur === Object.prototype ) break;

	}

	return [ ...seen ].sort();

}

function getCompletions( text, cursor, context ) {

	cursor = cursor ?? text.length;
	const chain = extractChain( text, cursor );
	const dotIdx = chain.lastIndexOf( '.' );

	if ( dotIdx === - 1 ) {

		const partial = chain;
		const completions = partial
			? TOP_LEVEL.filter( ( k ) => k.startsWith( partial ) && k !== partial )
			: [];
		return { completions, chain, partial };

	}

	const objExpr = chain.slice( 0, dotIdx );
	const partial = chain.slice( dotIdx + 1 );
	if ( ! objExpr ) return { completions: [], chain, partial };

	try {

		const fn = new Function( 'bonsai', `return (${ objExpr })` );
		const obj = fn( scriptScope( context ) );
		if ( obj == null ) return { completions: [], chain, partial };
		const completions = allProps( obj ).filter(
			( k ) => ! partial || k.startsWith( partial ),
		);
		return { completions, chain, partial };

	} catch {

		return { completions: [], chain, partial };

	}

}

function applyCompletion( text, cursor, chain, completion ) {

	cursor = cursor ?? text.length;
	const dotIdx = chain.lastIndexOf( '.' );
	const keep = dotIdx === - 1 ? '' : chain.slice( 0, dotIdx + 1 );
	const before = text.slice( 0, cursor - chain.length );
	const after = text.slice( cursor );
	const newText = before + keep + completion;
	return { text: newText + after, cursor: newText.length };

}

const PROMPT = 'bonsai >';

// tool.Ifc.get() and tool.Ifc.entity() are null until a live file is
// open; the snippets below that use them need a model opened for editing.
const SNIPPETS = [
	{
		id: 'tool',
		label: 'bonsai.tool',
		items: [
			{ label: 'Active model', command: 'bonsai.tool.Ifc.get()' },
			{ label: 'Count walls', command: 'bonsai.tool.Ifc.get()?.byType(\'IfcWall\').length' },
			{ label: 'Storeys', command: 'bonsai.tool.Ifc.get()?.byType(\'IfcBuildingStorey\').map((s) => bonsai.tool.Element.displayName(s))' },
			{ label: 'Selected GlobalId', command: 'bonsai.tool.Ifc.globalId()' },
			{ label: 'Selected attributes', command: 'bonsai.tool.Element.getAttributes(bonsai.tool.Ifc.entity())' },
			{ label: 'Selected psets', command: 'bonsai.tool.Pset.getPsets(bonsai.tool.Ifc.entity())' },
		],
	},
	{
		id: 'ops',
		label: 'bonsai.ops',
		items: [
			{ label: 'List operators', command: 'bonsai.ops.list()' },
			{ label: 'New project', command: 'await bonsai.ops.execute(\'project.new\')' },
			{ label: 'Top view', command: 'bonsai.ops.execute(\'viewer.standard_view\', \'TOP\')' },
			{ label: 'View all', command: 'bonsai.ops.execute(\'viewer.view_all\')' },
			{ label: 'Isolate selection', command: 'bonsai.ops.execute(\'viewer.isolate\')' },
			{ label: 'Section', command: 'bonsai.ops.execute(\'viewer.section\')' },
			{ label: 'Clear cuts', command: 'bonsai.ops.execute(\'viewer.clear_section\')' },
			{ label: 'Show all', command: 'bonsai.ops.execute(\'show.all\')' },
			{ label: 'Undo', command: 'bonsai.ops.undo()' },
		],
	},
];

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'flexWrap', [ 'wrap' ] )
		.add( ...children );

}

class TerminalPanelUI {

	static id = 'code.terminal';

	static spec = {
		group: 'terminal',
		position: 'bottom',
		id: 'terminal-panel',
		label: 'Terminal',
		icon: 'terminal',
		title: 'Terminal',
		autoShow: false,
		panelStyles: { height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column' },
	};

	constructor( { context } ) {

		this.context = context;
		this.visible = false;
		this.workspacePanel = null;

		this.activeTerminalGuid = null;
		this.historyIndex = - 1;
		this.tabs = null;
		this.promptInput = null;
		this.executing = false;
		this._outputs = new Map();

		this._completions = null;
		this._completionItems = [];
		this._completionIndex = - 1;
		this._onPointerDown = ( event ) => {

			if ( ! this._completions?.dom.contains( event.target ) ) this._closeCompletions();

		};

		this._onResize = () => {

			if ( this._completionItems.length > 0 ) this._positionCompletions();

		};

		context.terminal = context.terminal || {};
		context.terminal.terminalPanel = this;
		context.terminal.activeTerminalGuid = null;
		context.terminal.onTerminalCreated = ( guid ) => {

			this.refreshTerminalList();
			this.selectTerminal( guid, { focusInput: true } );

		};

		context.terminal.onTerminalCleared = ( guid ) => {

			if ( guid === this.activeTerminalGuid ) this.renderActiveTerminal();

		};

		context.terminal.onTerminalClosed = ( guid ) => {

			const wasActive = guid === this.activeTerminalGuid;
			if ( wasActive ) {

				this.activeTerminalGuid = null;
				this.context.terminal.activeTerminalGuid = null;

			}

			this.refreshTerminalList();
			if ( ! wasActive ) return;
			const next = Terminal.list()[ 0 ] ?? Terminal.create();
			this.selectTerminal( next.guid );

		};

		context.terminal.onCommandResult = ( { terminalGuid } ) => {

			if ( terminalGuid === this.activeTerminalGuid ) {

				this.renderActiveTerminal();
				this._focusInput();

			}

			this.refreshTerminalList();

		};

		this._buildCompletionsPopup();
		this.build();

		if ( Terminal.list().length === 0 ) Terminal.create( 'Terminal 1' );
		const first = Terminal.list()[ 0 ];
		if ( first ) this.selectTerminal( first.guid );

	}

	attach( workspacePanel ) {

		this.workspacePanel = workspacePanel;
		this._syncVisible();

	}

	_syncVisible() {

		this.visible = Boolean( this.workspacePanel?.isVisible?.() );
		return this.visible;

	}

	_buildCompletionsPopup() {

		this._completions = new StackPanel( { isVertical: true } )
			.addClass( 'bonsai-completions' )
			.setStyle( 'display', [ 'none' ] )
			.setStyle( 'position', [ 'fixed' ] )
			.setStyle( 'zIndex', [ '999' ] );
		document.body.appendChild( this._completions.dom );
		document.addEventListener( 'mousedown', this._onPointerDown );
		window.addEventListener( 'resize', this._onResize );

	}

	_openCompletions( items, selectedIndex = 0 ) {

		const popup = this._completions;
		popup.clear();
		this._completionItems = items;
		this._completionIndex = selectedIndex;

		items.forEach( ( item, index ) => {

			const choice = new Button( item )
				.addClass( 'secondary' )
				.setTooltip( item );
			if ( index === selectedIndex ) choice.addClass( 'is-active' );
			choice.dom.addEventListener( 'mousedown', ( event ) => {

				event.preventDefault();
				this._applyCompletionAt( index );

			} );
			popup.add( choice );

		} );

		popup.setStyle( 'display', [ 'flex' ] );
		this._positionCompletions();

	}

	_positionCompletions() {

		if ( ! this.promptInput?.dom || ! this._completions ) return;
		const rect = this.promptInput.dom.getBoundingClientRect();
		const popup = this._completions.dom;
		const popH = Math.min( popup.scrollHeight, 200 );
		popup.style.left = `${ rect.left }px`;
		popup.style.top = `${ rect.top - popH - 6 }px`;
		popup.style.minWidth = `${ Math.max( 180, rect.width ) }px`;

	}

	_closeCompletions() {

		this._completions?.setStyle( 'display', [ 'none' ] );
		this._completionItems = [];
		this._completionIndex = - 1;

	}

	_highlightCompletion( index ) {

		if ( ! this._completions ) return;
		this._completionIndex = index;
		const buttons = this._completions.dom.querySelectorAll( '.Button' );
		buttons.forEach( ( button, i ) => {

			button.classList.toggle( 'is-active', i === index );

		} );
		buttons[ index ]?.scrollIntoView( { block: 'nearest' } );

	}

	_applyCompletionAt( index ) {

		const item = this._completionItems[ index ];
		if ( ! item || ! this.promptInput ) return;
		const dom = this.promptInput.dom;
		const text = dom.value;
		const cursor = dom.selectionStart ?? text.length;
		const { chain } = getCompletions( text, cursor, this.context );
		const { text: newText, cursor: newCursor } = applyCompletion( text, cursor, chain, item );
		this.promptInput.setValue( newText );
		requestAnimationFrame( () => {

			dom.selectionStart = newCursor;
			dom.selectionEnd = newCursor;

		} );
		this._closeCompletions();

	}

	_triggerCompletions() {

		if ( ! this.promptInput ) return;
		const dom = this.promptInput.dom;
		const text = dom.value;
		const cursor = dom.selectionStart ?? text.length;
		const { completions, chain } = getCompletions( text, cursor, this.context );
		if ( completions.length === 0 ) return;

		if ( completions.length === 1 ) {

			const { text: newText, cursor: newCursor } = applyCompletion( text, cursor, chain, completions[ 0 ] );
			this.promptInput.setValue( newText );
			requestAnimationFrame( () => {

				dom.selectionStart = newCursor;
				dom.selectionEnd = newCursor;

			} );
			return;

		}

		this._openCompletions( completions, 0 );

	}

	build() {

		this.tabs = new TabView();

		this.promptInput = new InputText();
		this.promptInput.dom.spellcheck = false;
		this.promptInput.dom.placeholder = 'JavaScript expression…';
		this.promptInput.setStyle( 'flex', [ '1' ] );
		this.promptInput.dom.setAttribute( 'aria-label', 'Terminal input' );
		this.promptInput.dom.addEventListener( 'keydown', ( event ) => this._onPromptKeyDown( event ) );

		const promptRow = row(
			new Text( PROMPT ).setStyle( 'color', [ 'var(--dui-color-accent)' ] ),
			this.promptInput,
		).setStyle( 'flexWrap', [ 'nowrap' ] );

		const snippets = new TabView().addClass( 'bonsai-terminal-snippets' );
		for ( const group of SNIPPETS ) {

			const list = new StackPanel( { isVertical: true } )
				.addClass( 'bonsai-terminal-snippet-list' )
				.gap( '0.25rem' );
			for ( const item of group.items ) {

				list.add( new Button( item.label )
					.addClass( 'secondary' )
					.setTooltip( item.command )
					.onClick( ( event ) => {

						event.preventDefault();
						this.promptInput.setValue( item.command );
						this._focusInput();

					} ) );

			}

			const scroll = new ScrollViewer( { scrollable: true, fill: true } ).add( list );
			snippets.addTab( `terminal-snippets-${ group.id }`, group.label, scroll );

		}

		snippets.select( `terminal-snippets-${ SNIPPETS[ 0 ].id }` );

		// The tab strip moves into the header; TabView keeps its own
		// reference to it, so tab selection still works.
		const header = row(
			new Container().addClass( 'bonsai-terminal-tabs' ).add( this.tabs.tabsDiv ),
			new Operator( 'add' )
				.setTooltip( 'New terminal' )
				.onClick( ( event ) => {

					event.preventDefault();
					ops.execute( 'terminal.new', this.context );

				} ),
			new Operator( 'clear_all' )
				.setTooltip( 'Clear terminal' )
				.onClick( ( event ) => {

					event.preventDefault();
					ops.execute( 'code.terminal.clear', this.context );

				} ),
			new Operator( 'close' )
				.setTooltip( 'Close terminal' )
				.onClick( ( event ) => {

					event.preventDefault();
					ops.execute( 'code.terminal.close', this.context );

				} ),
		).addClass( 'bonsai-terminal-header' ).setStyle( 'flexWrap', [ 'nowrap' ] );

		const output = new StackPanel( { isVertical: true } )
			.addClass( 'bonsai-terminal-console' )
			.gap( '0.5rem' )
			.add( this.tabs, promptRow );

		const body = new StackPanel( { isVertical: false } )
			.addClass( 'bonsai-terminal-body' )
			.gap( '0.75rem' )
			.add( output, snippets );

		this.root = new StackPanel( { isVertical: true } )
			.addClass( 'bonsai-terminal' )
			.gap( '0.5rem' )
			.setStyle( 'height', [ '100%' ] )
			.setStyle( 'minHeight', [ '0' ] )
			.add( header, body );

	}

	_onPromptKeyDown( event ) {

		const completionsOpen = this._completionItems.length > 0;

		if ( event.key === 'Tab' ) {

			event.preventDefault();
			if ( completionsOpen ) {

				const next = ( this._completionIndex + ( event.shiftKey ? - 1 : 1 ) + this._completionItems.length ) % this._completionItems.length;
				this._highlightCompletion( next );

			} else {

				this._triggerCompletions();

			}

			return;

		}

		if ( event.key === 'Enter' ) {

			event.preventDefault();
			if ( completionsOpen && this._completionIndex >= 0 ) this._applyCompletionAt( this._completionIndex );
			else void this._submitCommand();
			return;

		}

		if ( event.key === 'Escape' ) {

			if ( completionsOpen ) {

				event.preventDefault();
				this._closeCompletions();

			}

			return;

		}

		if ( event.key === 'ArrowUp' ) {

			event.preventDefault();
			if ( completionsOpen ) {

				const prev = ( this._completionIndex - 1 + this._completionItems.length ) % this._completionItems.length;
				this._highlightCompletion( prev );

			} else {

				this._historyStep( - 1 );

			}

			return;

		}

		if ( event.key === 'ArrowDown' ) {

			event.preventDefault();
			if ( completionsOpen ) {

				const next = ( this._completionIndex + 1 ) % this._completionItems.length;
				this._highlightCompletion( next );

			} else {

				this._historyStep( 1 );

			}

			return;

		}

		if ( completionsOpen ) this._closeCompletions();

	}

	toggle() {

		if ( this.isVisible() ) this.hide();
		else this.show();
		return this;

	}

	isVisible() {

		return this.workspacePanel ? this._syncVisible() : this.visible;

	}

	show() {

		const panel = this.workspacePanel;
		if ( panel && ! panel.isVisible() ) {

			const layout = panel.layout;
			const needsOpen = typeof layout?.isWorkspaceOpen === 'function'
				&& ! layout.isWorkspaceOpen( panel.position );
			panel.show( { open: needsOpen, select: needsOpen } );

		}
		this.visible = this.workspacePanel ? this.isVisible() : true;
		if ( this.visible ) this._focusInput();
		return this;

	}

	hide() {

		const panel = this.workspacePanel;
		if ( panel?.isVisible() ) panel.hide( { closeIfEmpty: true } );
		this.visible = false;
		this._closeCompletions();
		return this;

	}

	refreshTerminalList() {

		if ( ! this.tabs ) return;
		const sessions = Terminal.list();
		const live = new Set( sessions.map( ( session ) => session.guid ) );

		for ( const guid of [ ...this._outputs.keys() ] ) {

			if ( live.has( guid ) ) continue;
			this.tabs.removeTab( guid );
			this._outputs.delete( guid );

		}

		for ( const session of sessions ) {

			if ( this._outputs.has( session.guid ) ) continue;
			const lines = new StackPanel( { isVertical: true } ).gap( '0.25rem' );
			const scroll = new ScrollViewer( { scrollable: true, fill: true } );
			scroll.add( lines );
			this.tabs.addTab( session.guid, session.name, scroll );
			this._outputs.set( session.guid, { lines, scroll } );
			const tab = this.tabs.tabs.find( ( item ) => item.dom.id === session.guid );
			tab?.onClick( () => this.selectTerminal( session.guid, { focusInput: true } ) );

		}

		if ( this.activeTerminalGuid && live.has( this.activeTerminalGuid ) ) {

			this.tabs.select( this.activeTerminalGuid );

		}

	}

	selectTerminal( guid, { focusInput = false } = {} ) {

		const session = Terminal.get( guid );
		if ( ! session ) return;
		this.activeTerminalGuid = guid;
		this.context.terminal.activeTerminalGuid = guid;
		this.historyIndex = - 1;
		this.refreshTerminalList();
		this.renderActiveTerminal();
		if ( focusInput ) this._focusInput();

	}

	renderActiveTerminal() {

		const slot = this._outputs.get( this.activeTerminalGuid );
		if ( ! slot ) return;
		slot.lines.clear();

		const session = Terminal.get( this.activeTerminalGuid );
		if ( ! session ) {

			slot.lines.add( new Caption( 'No terminal selected.' ) );
			return;

		}

		for ( const entry of session.history ) {

			slot.lines.add( row(
				new Text( PROMPT ).setStyle( 'color', [ 'var(--dui-color-accent)' ] ),
				new Text( entry.command ),
			).setStyle( 'flexWrap', [ 'nowrap' ] ) );

			if ( entry.output ) {

				slot.lines.add(
					new Text( entry.output )
						.setStyle( 'color', [ entry.success ? 'var(--dui-color-info)' : 'var(--dui-color-danger)' ] )
						.setStyle( 'whiteSpace', [ 'pre-wrap' ] )
						.setStyle( 'overflowWrap', [ 'anywhere' ] ),
				);

			}

		}

		const scroller = slot.scroll.dom;
		scroller.scrollTop = scroller.scrollHeight;

	}

	async _submitCommand() {

		if ( this.executing || ! this.promptInput ) return;
		const command = this.promptInput.getValue();
		if ( ! String( command ).trim() ) return;
		this.executing = true;
		this.promptInput.setValue( '' );
		this.historyIndex = - 1;
		try {

			await ops.execute(
				'code.terminal.execute',
				this.context,
				command,
				this.activeTerminalGuid,
			);

		} finally {

			this.executing = false;
			this._focusInput();

		}

	}

	_historyStep( delta ) {

		const session = Terminal.get( this.activeTerminalGuid );
		if ( ! session || ! this.promptInput ) return;
		const commands = session.commandHistory;
		if ( commands.length === 0 ) return;

		if ( this.historyIndex < 0 ) this.historyIndex = commands.length;
		this.historyIndex = Math.max( 0, Math.min( commands.length, this.historyIndex + delta ) );
		if ( this.historyIndex >= commands.length ) {

			this.promptInput.setValue( '' );
			this.historyIndex = commands.length;
			return;

		}

		this.promptInput.setValue( commands[ this.historyIndex ] );

	}

	_focusInput() {

		this.promptInput?.dom.focus();

	}

	destroy() {

		document.removeEventListener( 'mousedown', this._onPointerDown );
		window.removeEventListener( 'resize', this._onResize );
		this._completions?.dom.remove();
		this._completions = null;
		this.workspacePanel?.hide();
		this.workspacePanel = null;

	}

}

export default [ TerminalPanelUI ];
