import { BonsaiWebConfiguration } from './configuration/config.js';
import { installImports, installStyles } from './configuration/imports.js';

installStyles( BonsaiWebConfiguration.paths );
installImports( BonsaiWebConfiguration.paths );

const BonsaiWeb = await import( '../build/bonsai.js' );

const bonsai = await BonsaiWeb.start( document.body, BonsaiWebConfiguration );

window.bonsai = bonsai;

bonsai.context.signals.appReady.add( ( payload ) => {

	console.log( '[bonsai] appReady', payload );

} );
