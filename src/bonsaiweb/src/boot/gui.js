import { createLogger } from '../util/log.js';
import { registerOperators } from '../modules/registry.js';
import { modulePanels } from '../modules/ui.js';
import { addSignals } from '../session/signals.js';
import { Bonsai, attachViewer, createSession, tool } from '../session/Bonsai.js';
import { watchSession } from '../session/watch.js';
import { bindPanelDialog } from '../ui/panels.js';
import { bindModelProgress, createProgress, installFetchProgress } from '../ui/progress.js';
import { bindRibbon } from '../ui/ribbon.js';
import { createWorkspacePanel, mountShell } from '../ui/world.js';
import { bootRuntime } from './runtime.js';

export { addSignals, Bonsai, tool };

const log = createLogger( 'bonsai' );
const ms = ( start ) => `${ ( performance.now() - start ).toFixed( 0 ) }ms`;

const uiById = new Map();
for ( const UI of modulePanels ) {

	const list = uiById.get( UI.id ) ?? [];
	list.push( UI );
	uiById.set( UI.id, list );

}

function mountModuleUi( bonsai, configs ) {

	const panels = [];
	for ( const item of configs ) {

		if ( item.active === false ) continue;
		for ( const UI of uiById.get( item.id ) ?? [] ) {

			if ( ! UI.spec ) continue;
			const instance = new UI( { context: bonsai } );
			if ( ! instance.root ) continue;
			const workspace = createWorkspacePanel( bonsai.app.layout, UI.spec, instance.root );
			instance.attach?.( workspace );
			panels.push( { spec: UI.spec, panel: workspace } );

		}

	}

	bonsai.panels = panels;
	return panels;

}

export async function start( container = document.body, configuration ) {

	const shell = mountShell( container, configuration.ui );
	const progress = createProgress( shell.footer );
	installFetchProgress( progress );
	progress.show( 'Loading dependencies & viewer…', null );

	const tBoot = await bootRuntime( { gui: true } );

	const geometry = tool.Loader.configure( configuration.geometry );
	log.log( `geometry: engine=${ geometry.engine } kernel=${ geometry.kernel } thread=${ geometry.thread }` );
	const bonsai = createSession( container );
	bonsai.app.world = shell.world;
	bonsai.app.layout = shell.layout;

	bindRibbon( bonsai, configuration.ribbon );
	bindModelProgress( bonsai, progress );

	const tViewer = performance.now();
	await attachViewer( bonsai, shell.viewport );
	log.log( `boot: viewer ready in ${ ms( tViewer ) }` );
	log.log( `boot total: ${ ms( tBoot ) }` );

	progress.settle( 'Viewer ready', 400 );

	registerOperators( bonsai, configuration.app.CoreModules );
	const panels = mountModuleUi( bonsai, configuration.app.CoreModules );
	bindPanelDialog( document.getElementById( 'RB_Panels' ), panels );

	watchSession( bonsai );
	bonsai.signals.appReady.dispatch( true );
	return bonsai;

}
