import { FloatingDialog, InputList, LabeledBoxItem, StatusBar, TabView } from '@aeco-dev/gui';
import { Layout, World } from '@aeco-dev/layout';
import { Bonsai } from './index.js';
import { modulePanels } from './modules/ui.js';
import ops from './ops.js';
import { createLogger } from './util/log.js';

const log = createLogger( 'bonsai' );

// SHELL

/**
 * Region ids must stay stable. Layout looks up RibbonMenu, HeaderBar,
 * RibbonBar, WorkspaceLeft/Right, WorkspaceBottom, Viewport, Footer,
 * and LayoutToggleBar.
 */
function mountShell( container, ui ) {

	const world = new World( ui.WorldComponent );
	world.root.addClass( 'World' );
	world.mount( container );

	const layout = new Layout( ui.layout ).init( world );
	return {
		world,
		layout,
		viewport: world.dom.querySelector( '#Viewport' ),
		footer: world.dom.querySelector( '#Footer' ),
	};

}

function createWorkspacePanel( layout, options, body ) {

	const panel = new Layout.Panel( {
		layout,
		position: options.position,
		group: options.group,
		id: options.id,
		label: options.label,
		icon: options.icon,
		title: options.title,
		floatable: true,
		panelStyles: options.panelStyles,
	} );
	if ( body ) panel.add( body.addClass( 'bonsai-panel-body' ) );
	// Mount without selecting, so the compact workspace opens on layout.compactTab.
	if ( options.autoShow !== false ) panel.show( { select: false, open: true } );
	return panel;

}

function mountUi( context, layout, configs ) {

	const panels = [];
	for ( const item of configs ) {

		if ( item.active === false ) continue;
		for ( const UI of modulePanels ) {

			if ( UI.id !== item.id ) continue;
			const instance = new UI( { context } );
			if ( ! UI.spec || ! instance.root ) continue;
			const panel = createWorkspacePanel( layout, UI.spec, instance.root );
			instance.attach?.( panel );
			panels.push( { spec: UI.spec, panel } );

		}

	}

	return panels;

}

// RIBBON

/**
 * Show the ribbon groups for one work mode, and wire buttons and dropdowns.
 * In the compact shell the work modes sit in the bottom bar and the ribbon is a
 * tray: tapping a mode opens its tools, tapping it again closes them.
 */
function bindRibbon( context, ribbon, layout ) {

	const toggles = [];

	function bindNode( spec ) {

		if ( spec.type === 'RibbonGroup' ) {

			const el = document.getElementById( spec.id );
			if ( el && spec.workMode ) el.dataset.workMode = spec.workMode;
			if ( el ) toggles.push( { el, workMode: spec.workMode } );
			for ( const child of spec.children ?? [] ) bindNode( child );
			return;

		}

		const el = document.getElementById( spec.id );
		if ( ! el ) return;
		if ( spec.workMode ) {

			el.dataset.workMode = spec.workMode;
			toggles.push( { el, workMode: spec.workMode } );

		}

		if ( ! spec.operator ) return;

		if ( spec.type === 'Dropdown' ) {

			el.addEventListener( 'change', () => {

				void ops.execute( spec.operator, context, el.value );

			} );
			if ( spec.operator === 'viewer.nav_preset' ) {

				context.signals.navPresetChanged.add( ( payload ) => {

					const preset = payload?.preset;
					if ( preset && el.value !== preset ) el.value = preset;

				} );

			}
			return;

		}

		el.type = 'button';
		const args = spec.args ?? [];
		el.addEventListener( 'click', () => {

			void ops.execute( spec.operator, context, ...args );

		} );

	}

	for ( const spec of ribbon.buttons ) bindNode( spec );

	const bar = document.getElementById( 'WorkModeBar' );
	const workModes = new TabView();
	workModes.setId( 'RibbonWorkModes' );
	workModes.addClass( 'RibbonWorkModes' );

	for ( const mode of ribbon.workModes ) {

		workModes.addTab( mode.id, mode.name, [] );
		const tab = workModes.tabs.find( ( item ) => item.dom.id === mode.id );
		tab?.onClick( () => {

			const openTray = context.workMode !== mode.id || ! layout.isRibbonOpen();
			setWorkMode( mode.id );
			if ( layout.isCompact() ) {

				if ( openTray ) layout.openRibbon();
				else layout.closeRibbon();

			}

		} );

	}

	workModes.panelsDiv.dom.style.display = 'none';
	bar?.appendChild( workModes.dom );

	function setWorkMode( id ) {

		context.workMode = id;

		for ( const item of toggles ) {

			const hidden = Boolean( item.workMode ) && item.workMode !== id;
			item.el.classList.toggle( 'is-work-mode-hidden', hidden );

		}

		if ( workModes.selected !== id ) workModes.select( id );

	}

	context.setWorkMode = setWorkMode;
	setWorkMode( ribbon.defaultWorkMode );

}

// PANEL DIALOG

/**
 * Mount or remove a panel from its workspace.
 * Panels that start hidden open their region when checked, and close it again
 * when they are the last panel left in that region.
 */
function setPanelMounted( panel, mounted, spec = {} ) {

	if ( ! panel ) return;
	if ( mounted ) {

		if ( ! panel.isVisible() ) {

			const layout = panel.layout;
			const startsHidden = spec.autoShow === false;
			const needsOpen = startsHidden
				&& typeof layout?.isWorkspaceOpen === 'function'
				&& ! layout.isWorkspaceOpen( panel.position );
			panel.show( { open: needsOpen, select: needsOpen } );

		}
		return;

	}

	if ( panel.isVisible() ) panel.hide( { closeIfEmpty: spec.autoShow === false } );

}

/**
 * One ribbon button opens a dialog listing every panel from the active modules.
 * Each checkbox mounts or dismounts that panel in its default workspace.
 */
function bindPanelDialog( button, panels ) {

	const icons = { default: 'dock_to_right' };

	for ( const entry of panels ) {

		icons[ entry.spec.id ] = entry.spec.icon || icons.default;

	}

	const list = new InputList();
	const rows = [];

	for ( const entry of panels ) {

		const item = new LabeledBoxItem(
			{
				id: entry.spec.id,
				label: entry.spec.label,
				checked: entry.panel.isVisible(),
			},
			icons,
		);
		const input = item.dom.querySelector( 'input.Checkbox' );
		const apply = ( checked ) => setPanelMounted( entry.panel, checked, entry.spec );
		input?.addEventListener( 'change', () => apply( input.checked ) );
		item.dom.addEventListener( 'click', ( event ) => {

			if ( ! input || event.target === input ) return;
			input.checked = ! input.checked;
			apply( input.checked );

		} );
		list.add( item );
		rows.push( { input, panel: entry.panel } );

	}

	const dialog = new FloatingDialog( {
		title: 'Panels',
		icon: 'view_sidebar',
		panelStyles: { width: '16rem' },
	} );
	dialog.content( list );

	button?.addEventListener( 'click', () => {

		if ( ! dialog.isActive ) {

			for ( const row of rows ) {

				if ( row.input ) row.input.checked = row.panel.isVisible();

			}

		}

		dialog.toggle();

	} );

	return dialog;

}

// PROGRESS

function createProgress( footer ) {

	const bar = new StatusBar( { initialText: 'Starting Bonsai Web…', zIndex: 5 } );
	bar.parentContainer = footer;

	let timer = null;
	let message = '';

	function clearTimer() {

		if ( ! timer ) return;
		clearTimeout( timer );
		timer = null;

	}

	function goIdle() {

		clearTimer();
		message = 'Ready';
		bar.dom.classList.add( 'is-idle' );
		bar.dom.classList.remove( 'is-indeterminate' );
		bar.hide();

	}

	const progress = {
		show( nextMessage, ratio ) {

			clearTimer();
			if ( nextMessage !== undefined ) message = nextMessage;
			if ( message === 'Ready' ) {

				goIdle();
				return;

			}

			bar.dom.classList.remove( 'is-idle' );
			const indeterminate = ratio === undefined || ratio === null || Number.isNaN( ratio );
			bar.dom.classList.toggle( 'is-indeterminate', indeterminate );
			if ( indeterminate ) {

				bar.update( 0, message );
				if ( bar.percentageElement ) bar.percentageElement.textContent = '';

			} else {

				bar.update( Math.max( 0, Math.min( 1, ratio ) ), message );

			}

		},

		settle( nextMessage, delay = 700 ) {

			if ( ! nextMessage || nextMessage === 'Ready' ) {

				goIdle();
				return;

			}

			this.show( nextMessage, 1 );
			timer = setTimeout( goIdle, delay );

		},

		settleIfCurrent( nextMessage, delay = 250 ) {

			if ( message !== nextMessage ) return;
			this.settle( nextMessage, delay );

		},
	};

	return progress;

}

function installFetchProgress( progress ) {

	if ( globalThis.__bonsaiFetchProgress ) return;
	globalThis.__bonsaiFetchProgress = true;

	let fetchToken = 0;
	const origFetch = globalThis.fetch.bind( globalThis );
	globalThis.fetch = async ( input, init ) => {

		const url = typeof input === 'string' ? input : ( input && input.url ) || '';
		const isTrackable = /\.(ifc|ifcview|ifczip|json|wasm)(\?|$)/i.test( url );
		const res = await origFetch( input, init );
		if ( ! isTrackable || ! res.body || ! res.ok ) return res;

		const total = Number( res.headers.get( 'content-length' ) ) || 0;
		const name = url.split( '/' ).pop().split( '?' )[ 0 ];
		const label = `Downloading ${ name }…`;
		const token = ++ fetchToken;
		let received = 0;
		const reader = res.body.getReader();
		const finish = () => {

			if ( token === fetchToken ) progress.settleIfCurrent( label );

		};

		const stream = new ReadableStream( {
			async start( controller ) {

				progress.show( label, total ? 0 : null );
				try {

					while ( true ) {

						const { done, value } = await reader.read();
						if ( done ) break;
						received += value.byteLength;
						if ( total && token === fetchToken ) {

							progress.show( label, received / total );

						}

						controller.enqueue( value );

					}

					controller.close();

				} catch ( err ) {

					controller.error( err );

				} finally {

					finish();

				}

			},
			cancel( reason ) {

				reader.cancel( reason );
				finish();

			},
		} );
		return new Response( stream, {
			headers: res.headers,
			status: res.status,
			statusText: res.statusText,
		} );

	};

}

function bindModelProgress( signals, progress ) {

	signals.modelLoadStarted.add( ( payload ) => {

		if ( payload?.phase !== undefined ) {

			const label = payload.phase === 'parsing' ? 'Parsing IFC'
				: payload.phase === 'parsed' ? 'Parsed IFC'
					: payload.phase === 'tessellating' ? 'Tessellating geometry'
						: payload.phase === 'serializing' ? 'Writing .ifcview'
							: payload.phase === 'complete' ? 'Conversion complete'
								: `Converting (${ payload.phase })`;
			const suffix = payload.message ? ` — ${ payload.message }` : '';
			progress.show( `${ label }${ suffix }`, payload.ratio );
			return;

		}

		const name = payload?.name ?? payload?.url?.split( '/' ).pop() ?? 'model';
		progress.show( `Opening ${ name }…`, null );

	} );

	signals.modelLoaded.add( ( payload ) => {

		const name = payload?.name ?? 'model';
		progress.settle( `Model loaded (${ name })`, 1200 );

	} );

	signals.modelLoadedToGPU.add( ( payload ) => {

		if ( payload?.ok === false ) progress.settle( 'Model load failed', 1500 );
		else progress.settle( 'Model uploaded to GPU', 900 );

	} );

	signals.liveIfcReady.add( ( payload ) => {

		const name = payload?.file?.name ?? 'model';
		progress.settle( `Ready — ${ name }`, 700 );

	} );

}

export function start( container = document.body, configuration ) {

	const t0 = performance.now();

	const shell = mountShell( container, configuration.ui );

	const progress = createProgress( shell.footer );
	installFetchProgress( progress );

	const bonsai = new Bonsai( container, configuration, shell.viewport );

	bindRibbon( bonsai.context, configuration.ribbon, shell.layout );

	bindModelProgress( bonsai.context.signals, progress );

	const panels = mountUi( bonsai.context, shell.layout, configuration.app.CoreModules );
	bindPanelDialog( document.getElementById( 'RB_Panels' ), panels );
	log.log( `boot: gui ready in ${ ( performance.now() - t0 ).toFixed( 0 ) }ms` );

	progress.show( 'Loading viewer…', null );
	bonsai.context.signals.viewerReady.add( () => progress.show( 'Loading IfcOpenShell…', null ) );
	bonsai.context.signals.appReady.add( () => progress.settle( 'Ready', 400 ) );
	void bonsai.start();

	return bonsai;

}
